import { PullRequest, PRFile, ProviderService } from './ProviderService.ts';

export class AzureDevOpsService implements ProviderService {
  private token: string;
  private defaultOrg: string;
  private defaultProject: string;

  constructor(token: string, defaultOrg = '', defaultProject = '') {
    this.token = token;
    this.defaultOrg = defaultOrg;
    this.defaultProject = defaultProject;
  }

  private parseOrgAndProject(owner: string): { org: string; project: string } {
    if (owner.includes('/')) {
      const [org, project] = owner.split('/');
      return { org: org || this.defaultOrg, project: project || this.defaultProject };
    }
    return { org: owner || this.defaultOrg, project: this.defaultProject };
  }

  private async fetchAzureApi(path: string, options: RequestInit = {}) {
    const url = path.startsWith('http') ? path : `https://dev.azure.com/${path}`;
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
      console.error(`Azure DevOps API error at ${path}:`, res.statusText);
      throw new Error(`Azure DevOps API failure: ${res.statusText}`);
    }

    return res;
  }

  private mapPullRequest(pr: any): PullRequest {
    return {
      id: pr.pullRequestId,
      number: pr.pullRequestId,
      title: pr.title || 'Untitled Pull Request',
      state: pr.status === 'active' ? 'open' : pr.status?.toLowerCase(),
      draft: Boolean(pr.isDraft),
      created_at: pr.creationDate,
      updated_at: pr.creationDate,
      html_url: pr.url || '',
      user: {
        login: pr.createdBy?.displayName || pr.createdBy?.uniqueName || 'unknown',
        avatar_url: pr.createdBy?._links?.avatar?.href || '',
      },
      head: {
        ref: pr.sourceRefName?.replace(/^refs\/heads\//, '') || '',
        sha: pr.lastMergeSourceCommit?.commitId || pr.lastMergeCommit?.commitId || '',
      },
      base: {
        ref: pr.targetRefName?.replace(/^refs\/heads\//, '') || '',
      },
    };
  }

  async getOpenPullRequests(owner: string, repo: string): Promise<PullRequest[]> {
    const { org, project } = this.parseOrgAndProject(owner);
    const scopePath = project ? `${org}/${project}` : org;
    const res = await this.fetchAzureApi(`${scopePath}/_apis/git/repositories/${encodeURIComponent(repo)}/pullrequests?searchCriteria.status=active&$top=30&api-version=7.1-preview.1`);
    const data = await res.json();
    return (data.value || []).map((pr: any) => this.mapPullRequest(pr));
  }

  async getPullRequestDetails(owner: string, repo: string, pullNumber: number): Promise<PullRequest> {
    const { org, project } = this.parseOrgAndProject(owner);
    const scopePath = project ? `${org}/${project}` : org;
    const res = await this.fetchAzureApi(`${scopePath}/_apis/git/repositories/${encodeURIComponent(repo)}/pullrequests/${pullNumber}?api-version=7.1-preview.1`);
    const pr = await res.json();
    return this.mapPullRequest(pr);
  }

  async getChangedFiles(owner: string, repo: string, pullNumber: number): Promise<PRFile[]> {
    const { org, project } = this.parseOrgAndProject(owner);
    const scopePath = project ? `${org}/${project}` : org;

    // Get PR iterations
    const iterRes = await this.fetchAzureApi(`${scopePath}/_apis/git/repositories/${encodeURIComponent(repo)}/pullrequests/${pullNumber}/iterations?api-version=7.1-preview.1`);
    const iterData = await iterRes.json();
    const iterations = iterData.value || [];

    if (iterations.length === 0) {
      return [];
    }

    const latestIterationId = iterations[iterations.length - 1].id;
    const changesRes = await this.fetchAzureApi(`${scopePath}/_apis/git/repositories/${encodeURIComponent(repo)}/pullrequests/${pullNumber}/iterations/${latestIterationId}/changes?$top=100&api-version=7.1-preview.1`);
    const changesData = await changesRes.json();

    const changeEntries = changesData.changeEntries || changesData.value || [];
    return changeEntries.map((change: any) => {
      const itemPath = change.item?.path?.replace(/^\//, '') || '';
      let status = 'modified';
      if (change.changeType === 'add') status = 'added';
      else if (change.changeType === 'delete') status = 'removed';
      else if (change.changeType === 'rename') status = 'renamed';

      return {
        filename: itemPath,
        status,
        additions: 0,
        deletions: 0,
        changes: 0,
      };
    });
  }

  async getDiff(owner: string, repo: string, pullNumber: number): Promise<string> {
    const files = await this.getChangedFiles(owner, repo, pullNumber);
    const pr = await this.getPullRequestDetails(owner, repo, pullNumber);
    const headSha = pr.head.sha;

    // Build unified diff format for changed files
    const diffBlocks: string[] = [];
    for (const file of files.slice(0, 30)) {
      try {
        if (file.status !== 'removed') {
          const content = await this.getFileContent(owner, repo, file.filename, headSha);
          diffBlocks.push(`--- a/${file.filename}\n+++ b/${file.filename}\n@@ -0,0 +1,${content.split('\n').length} @@\n` + content.split('\n').map(l => `+${l}`).join('\n'));
        }
      } catch {
        diffBlocks.push(`--- a/${file.filename}\n+++ b/${file.filename}\n# diff unavailable`);
      }
    }
    return diffBlocks.join('\n\n');
  }

  async getFileContent(owner: string, repo: string, path: string, ref: string): Promise<string> {
    const { org, project } = this.parseOrgAndProject(owner);
    const scopePath = project ? `${org}/${project}` : org;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const res = await this.fetchAzureApi(
      `${scopePath}/_apis/git/repositories/${encodeURIComponent(repo)}/items?path=${encodeURIComponent(cleanPath)}&versionDescriptor.version=${encodeURIComponent(ref)}&versionDescriptor.versionType=commit&$format=text&api-version=7.1-preview.1`,
      { headers: { 'Accept': 'text/plain, application/octet-stream' } }
    );
    return await res.text();
  }

  async getRepositoryFiles(
    owner: string,
    repo: string,
    commitSha: string,
    isSupportedFile: (path: string) => boolean
  ): Promise<{ path: string; content: string }[]> {
    try {
      const { org, project } = this.parseOrgAndProject(owner);
      const scopePath = project ? `${org}/${project}` : org;
      const res = await this.fetchAzureApi(
        `${scopePath}/_apis/git/repositories/${encodeURIComponent(repo)}/items?recursionLevel=full&versionDescriptor.version=${encodeURIComponent(commitSha)}&versionDescriptor.versionType=commit&api-version=7.1-preview.1`
      );
      const data = await res.json();
      const items = (data.value || []).filter((item: any) => !item.isFolder && isSupportedFile(item.path?.replace(/^\//, '')));

      const results: { path: string; content: string }[] = [];

      for (let i = 0; i < items.length; i += 10) {
        const chunk = items.slice(i, i + 10);
        const chunkResults = await Promise.all(
          chunk.map(async (item: any) => {
            const cleanPath = item.path?.replace(/^\//, '') || '';
            try {
              const content = await this.getFileContent(owner, repo, cleanPath, commitSha);
              return { path: cleanPath, content };
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
      console.error('Failed to fetch Azure DevOps repository files:', e);
      return [];
    }
  }
}
