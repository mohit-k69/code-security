import { PullRequest, PRFile, ProviderService } from './ProviderService.ts';

export class GitlabService implements ProviderService {
  private token: string;
  private baseUrl: string;

  constructor(token: string, baseUrl = 'https://gitlab.com/api/v4') {
    this.token = token;
    this.baseUrl = baseUrl;
  }

  private getProjectIdentifier(owner: string, repo: string): string {
    if (!owner || repo.includes('/')) {
      return encodeURIComponent(repo);
    }
    return encodeURIComponent(`${owner}/${repo}`);
  }

  private async fetchGitlabApi(endpoint: string, options: RequestInit = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/json',
        'User-Agent': 'CodeVibe-Edge-Function',
        ...options.headers,
      }
    });

    if (!res.ok) {
      console.error(`GitLab API error at ${endpoint}:`, res.statusText);
      throw new Error(`GitLab API failure: ${res.statusText}`);
    }

    return res;
  }

  /**
   * Maps raw GitLab API MR JSON to our PullRequest interface.
   */
  private mapMergeRequest(mr: any): PullRequest {
    return {
      id: mr.id,
      number: mr.iid,
      title: mr.title,
      state: mr.state === 'opened' ? 'open' : mr.state,
      draft: Boolean(mr.draft || mr.work_in_progress),
      created_at: mr.created_at,
      updated_at: mr.updated_at,
      html_url: mr.web_url,
      user: {
        login: mr.author?.username || mr.author?.name || 'unknown',
        avatar_url: mr.author?.avatar_url || '',
      },
      head: {
        ref: mr.source_branch || '',
        sha: mr.sha || mr.diff_head_sha || '',
      },
      base: {
        ref: mr.target_branch || '',
      },
    };
  }

  async getOpenPullRequests(owner: string, repo: string): Promise<PullRequest[]> {
    const project = this.getProjectIdentifier(owner, repo);
    const res = await this.fetchGitlabApi(`/projects/${project}/merge_requests?state=opened&order_by=updated_at&sort=desc&per_page=30`);
    const data = await res.json();
    return data.map((mr: any) => this.mapMergeRequest(mr));
  }

  async getPullRequestDetails(owner: string, repo: string, pullNumber: number): Promise<PullRequest> {
    const project = this.getProjectIdentifier(owner, repo);
    const res = await this.fetchGitlabApi(`/projects/${project}/merge_requests/${pullNumber}`);
    const mr = await res.json();
    return this.mapMergeRequest(mr);
  }

  async getChangedFiles(owner: string, repo: string, pullNumber: number): Promise<PRFile[]> {
    const project = this.getProjectIdentifier(owner, repo);
    // Use the per-file Merge Request diffs endpoint with pagination support
    const res = await this.fetchGitlabApi(`/projects/${project}/merge_requests/${pullNumber}/diffs?per_page=100`);
    const diffs = await res.json();

    return diffs.map((diff: any) => {
      const filename = diff.new_path || diff.old_path;
      let status = 'modified';
      if (diff.new_file) status = 'added';
      else if (diff.deleted_file) status = 'removed';
      else if (diff.renamed_file) status = 'renamed';

      // Parse additions/deletions from unified diff lines if available
      let additions = 0;
      let deletions = 0;
      if (diff.diff) {
        const lines = diff.diff.split('\n');
        for (const line of lines) {
          if (line.startsWith('+') && !line.startsWith('+++')) additions++;
          else if (line.startsWith('-') && !line.startsWith('---')) deletions++;
        }
      }

      if (diff.too_large || diff.collapsed) {
        console.warn(`[GitLabService] Diff for ${filename} is marked as limited (too_large: ${diff.too_large}, collapsed: ${diff.collapsed})`);
      }

      return {
        filename,
        status,
        additions,
        deletions,
        changes: additions + deletions,
      };
    });
  }

  async getDiff(owner: string, repo: string, pullNumber: number): Promise<string> {
    const project = this.getProjectIdentifier(owner, repo);
    try {
      // Try raw unified diff endpoint first
      const res = await this.fetchGitlabApi(`/projects/${project}/merge_requests/${pullNumber}/raw_diff`, {
        headers: { 'Accept': 'text/plain' }
      });
      return await res.text();
    } catch {
      // Fallback: aggregate diffs from the per-file endpoint
      const diffsRes = await this.fetchGitlabApi(`/projects/${project}/merge_requests/${pullNumber}/diffs?per_page=100`);
      const diffs = await diffsRes.json();
      return diffs.map((d: any) => `--- a/${d.old_path}\n+++ b/${d.new_path}\n${d.diff || ''}`).join('\n');
    }
  }

  async getFileContent(owner: string, repo: string, path: string, ref: string): Promise<string> {
    const project = this.getProjectIdentifier(owner, repo);
    const encodedPath = encodeURIComponent(path);
    const res = await this.fetchGitlabApi(`/projects/${project}/repository/files/${encodedPath}/raw?ref=${encodeURIComponent(ref)}`, {
      headers: { 'Accept': 'text/plain' }
    });
    return await res.text();
  }

  async getRepositoryFiles(
    owner: string,
    repo: string,
    commitSha: string,
    isSupportedFile: (path: string) => boolean
  ): Promise<{ path: string; content: string }[]> {
    try {
      const project = this.getProjectIdentifier(owner, repo);
      const res = await this.fetchGitlabApi(`/projects/${project}/repository/tree?ref=${encodeURIComponent(commitSha)}&recursive=true&per_page=100`);
      const tree = await res.json();

      const files = Array.isArray(tree)
        ? tree.filter((t: any) => t.type === 'blob' && isSupportedFile(t.path))
        : [];

      const results: { path: string; content: string }[] = [];

      for (let i = 0; i < files.length; i += 10) {
        const chunk = files.slice(i, i + 10);
        const chunkResults = await Promise.all(
          chunk.map(async (file: any) => {
            try {
              const content = await this.getFileContent(owner, repo, file.path, commitSha);
              return { path: file.path, content };
            } catch {
              return null;
            }
          })
        );

        for (const r of chunkResults) {
          if (r) results.push(r);
        }
      }

      return results;
    } catch (e) {
      console.error('Failed to fetch GitLab repository files:', e);
      return [];
    }
  }
}
