import { PullRequest, PRFile, ProviderService } from './ProviderService.ts';

export class BitbucketService implements ProviderService {
  private token: string;
  private baseUrl: string;

  constructor(token: string, baseUrl = 'https://api.bitbucket.org/2.0') {
    this.token = token;
    this.baseUrl = baseUrl;
  }

  private async fetchBitbucketApi(endpoint: string, options: RequestInit = {}) {
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
      console.error(`Bitbucket API error at ${endpoint}:`, res.statusText);
      throw new Error(`Bitbucket API failure: ${res.statusText}`);
    }

    return res;
  }

  /**
   * Maps raw Bitbucket API PR JSON to our PullRequest interface.
   */
  private mapPullRequest(pr: any): PullRequest {
    return {
      id: pr.id,
      number: pr.id, // Bitbucket uses numeric ID for PRs
      title: pr.title,
      state: pr.state === 'OPEN' ? 'open' : pr.state?.toLowerCase(),
      draft: false,
      created_at: pr.created_on,
      updated_at: pr.updated_on,
      html_url: pr.links?.html?.href || '',
      user: {
        login: pr.author?.display_name || pr.author?.nickname || pr.author?.username || 'unknown',
        avatar_url: pr.author?.links?.avatar?.href || '',
      },
      head: {
        ref: pr.source?.branch?.name || '',
        sha: pr.source?.commit?.hash || '',
      },
      base: {
        ref: pr.destination?.branch?.name || '',
      },
    };
  }

  async getOpenPullRequests(owner: string, repo: string): Promise<PullRequest[]> {
    const res = await this.fetchBitbucketApi(`/repositories/${owner}/${repo}/pullrequests?state=OPEN&pagelen=30`);
    const data = await res.json();
    return (data.values || []).map((pr: any) => this.mapPullRequest(pr));
  }

  async getPullRequestDetails(owner: string, repo: string, pullNumber: number): Promise<PullRequest> {
    const res = await this.fetchBitbucketApi(`/repositories/${owner}/${repo}/pullrequests/${pullNumber}`);
    const pr = await res.json();
    return this.mapPullRequest(pr);
  }

  async getChangedFiles(owner: string, repo: string, pullNumber: number): Promise<PRFile[]> {
    const res = await this.fetchBitbucketApi(`/repositories/${owner}/${repo}/pullrequests/${pullNumber}/diffstat?pagelen=100`);
    const data = await res.json();

    return (data.values || []).map((stat: any) => {
      const filename = stat.new?.path || stat.old?.path || '';
      let status = 'modified';
      if (stat.status === 'added') status = 'added';
      else if (stat.status === 'removed') status = 'removed';
      else if (stat.status === 'renamed') status = 'renamed';

      const additions = stat.lines_added || 0;
      const deletions = stat.lines_removed || 0;

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
    const res = await this.fetchBitbucketApi(`/repositories/${owner}/${repo}/pullrequests/${pullNumber}/diff`, {
      headers: { 'Accept': 'text/plain' }
    });
    return await res.text();
  }

  async getFileContent(owner: string, repo: string, path: string, ref: string): Promise<string> {
    const encodedPath = encodeURIComponent(path);
    const res = await this.fetchBitbucketApi(`/repositories/${owner}/${repo}/src/${encodeURIComponent(ref)}/${encodedPath}`, {
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
      const res = await this.fetchBitbucketApi(`/repositories/${owner}/${repo}/src/${encodeURIComponent(commitSha)}/?pagelen=100&max_depth=5`);
      const data = await res.json();

      const files = Array.isArray(data.values)
        ? data.values.filter((item: any) => item.type === 'commit_file' && isSupportedFile(item.path))
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
      console.error('Failed to fetch Bitbucket repository files:', e);
      return [];
    }
  }
}
