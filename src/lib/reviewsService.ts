import { supabase } from './supabase';
import { type AnalysisResult } from '../analyzer';

export interface ReviewedItem {
  id?: string;
  name: string;
  verdict: 'PASS' | 'FAIL' | 'NOT_VERIFIED' | string;
  pr: number | null;
  date: Date;
  result: AnalysisResult | any;
  reviewType?: string;
  repoOwner?: string;
  repoName?: string;
  commitSha?: string;
}

export interface SaveReviewInput {
  userId: string;
  name: string;
  reviewType: 'github' | 'paste' | 'upload';
  repositoryOwner?: string | null;
  repositoryName?: string | null;
  prNumber?: number | null;
  commitSha?: string | null;
  verdict: string;
  report: AnalysisResult | any;
}

/**
 * Fetches persisted reviews for the authenticated user from the Supabase public.reviews table.
 */
export async function fetchUserReviews(userId: string): Promise<ReviewedItem[]> {
  try {
    if (!userId) return [];

    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase query error on public.reviews:', error);
      return [];
    }

    if (!data || !Array.isArray(data)) {
      return [];
    }

    return data.map((row: any) => ({
      id: row.id,
      name: row.name || 'Code Review',
      verdict: row.verdict || 'NOT_VERIFIED',
      pr: row.pr_number || null,
      date: new Date(row.created_at || Date.now()),
      result: row.report || {},
      reviewType: row.review_type,
      repoOwner: row.repository_owner,
      repoName: row.repository_name,
      commitSha: row.commit_sha
    }));
  } catch (err: any) {
    console.error('Unexpected error loading review history from public.reviews:', err);
    return [];
  }
}

/**
 * Saves a completed analysis review to the Supabase public.reviews table.
 */
export async function saveUserReview(input: SaveReviewInput): Promise<ReviewedItem | null> {
  try {
    if (!input.userId) {
      console.warn('Cannot persist review: missing user_id');
      return null;
    }

    let totalFindings = 0;
    if (Array.isArray(input.report?.findings)) {
      totalFindings = input.report.findings.length;
    } else if (input.report?.findings) {
      const f = input.report.findings;
      totalFindings = (f.critical?.length || 0) + (f.warning?.length || 0) + (f.info?.length || 0);
    }

    const payload = {
      user_id: input.userId,
      name: input.name,
      review_type: input.reviewType,
      repository_owner: input.repositoryOwner || null,
      repository_name: input.repositoryName || null,
      pr_number: input.prNumber || null,
      commit_sha: input.commitSha || null,
      verdict: input.verdict || 'NOT_VERIFIED',
      total_findings: totalFindings,
      report: input.report,
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('reviews')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Failed to insert into public.reviews:', error);
      return null;
    }

    return {
      id: data.id,
      name: data.name,
      verdict: data.verdict,
      pr: data.pr_number,
      date: new Date(data.created_at),
      result: data.report,
      reviewType: data.review_type,
      repoOwner: data.repository_owner,
      repoName: data.repository_name,
      commitSha: data.commit_sha
    };
  } catch (err: any) {
    console.error('Unexpected error in saveUserReview:', err);
    return null;
  }
}

