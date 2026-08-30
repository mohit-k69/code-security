import { PullRequest, PRFile, ProviderService } from './ProviderService.ts';

export class GithubService implements ProviderService {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async fetchGithubApi(endpoint: string, options: RequestInit = {}) {
    const res = await fetch(`https://api.github.com${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'CodeVibe-Edge-Function',
        ...options.headers,
      }
    });

    if (!res.ok) {
      console.error(`GitHub API error at ${endpoint}:`, res.statusText);
      throw new Error(`GitHub API failure: ${res.statusText}`);
    }

    return res;
  }

  /**
   * Maps raw GitHub API PR JSON to our PullRequest interface.
   * Single source of truth — used by both list and detail endpoints.
   */
  private mapPullRequest(pr: any): PullRequest {
    return {
      id: pr.id,
      number: pr.number,
      title: pr.title,
      state: pr.state,
      draft: pr.draft,
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      html_url: pr.html_url,
      user: {
        login: pr.user.login,
        avatar_url: pr.user.avatar_url,
      },
      head: { ref: pr.head.ref, sha: pr.head.sha },
      base: { ref: pr.base.ref },
    };
  }

  async getOpenPullRequests(owner: string, repo: string): Promise<PullRequest[]> {
    const res = await this.fetchGithubApi(`/repos/${owner}/${repo}/pulls?state=open&sort=updated&direction=desc&per_page=30`);
    const data = await res.json();
    return data.map((pr: any) => this.mapPullRequest(pr));
  }

  async getPullRequestDetails(owner: string, repo: string, pullNumber: number): Promise<PullRequest> {
    const res = await this.fetchGithubApi(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
    const pr = await res.json();
    return this.mapPullRequest(pr);
  }

  async getChangedFiles(owner: string, repo: string, pullNumber: number): Promise<PRFile[]> {
    const res = await this.fetchGithubApi(`/repos/${owner}/${repo}/pulls/${pullNumber}/files?per_page=100`);
    const files = await res.json();
    return files.map((file: any) => ({
      filename: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
    }));
  }

  async getDiff(owner: string, repo: string, pullNumber: number): Promise<string> {
    const res = await this.fetchGithubApi(`/repos/${owner}/${repo}/pulls/${pullNumber}`, {
      headers: {
        'Accept': 'application/vnd.github.v3.diff'
      }
    });
    return await res.text();
  }

  async getFileContent(owner: string, repo: string, path: string, ref: string): Promise<string> {
    const res = await this.fetchGithubApi(`/repos/${owner}/${repo}/contents/${path}?ref=${ref}`, {
      headers: {
        'Accept': 'application/vnd.github.v3.raw'
      }
    });
    return await res.text();
  }
}
