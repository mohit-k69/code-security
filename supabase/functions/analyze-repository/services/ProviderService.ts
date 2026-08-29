export interface PullRequest {
  id: number;
  number: number;
  title: string;
  state: string;
  draft: boolean;
  created_at: string;
  updated_at: string;
  html_url: string;
  user: {
    login: string;
    avatar_url: string;
  };
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
  };
}

export interface PRFile {
  filename: string;
  status: string; // added, modified, removed, renamed
  additions: number;
  deletions: number;
  changes: number;
}

export interface ProviderService {
  /**
   * Fetch a list of open pull requests for the repository.
   */
  getOpenPullRequests(owner: string, repo: string): Promise<PullRequest[]>;

  /**
   * Fetch details of a specific pull request.
   */
  getPullRequestDetails(owner: string, repo: string, pullNumber: number): Promise<PullRequest>;

  /**
   * Fetch the list of files changed in a pull request.
   */
  getChangedFiles(owner: string, repo: string, pullNumber: number): Promise<PRFile[]>;

  /**
   * Fetch the raw diff string for a pull request.
   */
  getDiff(owner: string, repo: string, pullNumber: number): Promise<string>;

  /**
   * Fetch the raw content of a specific file at a given commit/ref.
   */
  getFileContent(owner: string, repo: string, path: string, ref: string): Promise<string>;

  /**
   * Fetch latest commits on default branch for repositories without open PRs.
   */
  getLatestCommits?(owner: string, repo: string): Promise<any[]>;

  /**
   * Fetch changed files for a specific commit.
   */
  getCommitFiles?(owner: string, repo: string, commitSha: string): Promise<PRFile[]>;
}
