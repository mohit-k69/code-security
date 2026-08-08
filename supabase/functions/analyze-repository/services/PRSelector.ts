import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";
import { ProviderService, PullRequest } from "./ProviderService.ts";

export interface PRSelectorResult {
  status: 'pr_selected' | 'no_prs' | 'all_reviewed' | 'error';
  message?: string;
  repository?: string;
  prNumber?: number;
  commitSha?: string;
}

export class PRSelector {
  private db: SupabaseClient;
  private provider: ProviderService;

  constructor(db: SupabaseClient, provider: ProviderService) {
    this.db = db;
    this.provider = provider;
  }

  /**
   * Automatically determines which Pull Request should be analyzed next.
   * Based on PR Selector v1.0 Frozen Architecture.
   */
  public async selectNextReview(owner: string, repo: string): Promise<PRSelectorResult> {
    try {
      // 1. Fetch Open PRs (Rule 1: Only Open PRs)
      const allPrs = await this.provider.getOpenPullRequests(owner, repo);
      
      // Filter out Draft PRs
      const openPrs = allPrs.filter(pr => !pr.draft && pr.state === 'open');

      if (openPrs.length === 0) {
        return {
          status: 'no_prs',
          message: 'No open Pull Requests available.'
        };
      }

      // 2. Fetch Review Tracking Data
      // To implement Rule 2 & 3, we need the latest reviewed commit SHA for each PR.
      // We will fetch the most recent review for the current repository.
      const prNumbers = openPrs.map(pr => pr.number);
      
      const { data: reviews, error } = await this.db
        .from('pr_reviews')
        .select('pr_number, commit_sha')
        .eq('repository_owner', owner)
        .eq('repository_name', repo)
        .in('pr_number', prNumbers)
        .order('reviewed_at', { ascending: false });

      if (error) {
        console.error('Error fetching PR reviews:', error);
        return {
          status: 'error',
          message: 'Database connection/access error.'
        };
      }

      // Create a map of PR Number -> Latest Reviewed Commit SHA
      const latestReviews = new Map<number, string>();
      for (const review of (reviews || [])) {
        if (!latestReviews.has(review.pr_number)) {
          latestReviews.set(review.pr_number, review.commit_sha);
        }
      }

      // 3. Filter eligible PRs
      // Rule 2: Never review the same commit twice.
      // Rule 3: If a reviewed PR receives a new commit, review again.
      const eligiblePrs = openPrs.filter(pr => {
        const lastReviewedSha = latestReviews.get(pr.number);
        // If it was never reviewed, or the current head sha differs from the reviewed sha, it is eligible
        return lastReviewedSha !== pr.head.sha;
      });

      if (eligiblePrs.length === 0) {
        return {
          status: 'all_reviewed',
          message: 'No new code available for review.'
        };
      }

      // 4. Select newest eligible PR (Rule 4)
      // Sort descending by updated_at
      eligiblePrs.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      
      const selectedPr = eligiblePrs[0];

      // Note: PR Selector is READ-ONLY. We leave the insertion of the review record 
      // for the future Review Writer component after the analysis completes successfully.
      // TODO: Downstream component must insert into `pr_reviews` once analysis is complete.

      return {
        status: 'pr_selected',
        repository: `${owner}/${repo}`,
        prNumber: selectedPr.number,
        commitSha: selectedPr.head.sha
      };

    } catch (err: any) {
      console.error('Error in PRSelector:', err.message);
      return {
        status: 'error',
        message: 'Show connection/access error.'
      };
    }
  }
}
