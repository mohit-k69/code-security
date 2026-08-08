-- Migration: Create pr_reviews table to track which commits have been reviewed
CREATE TABLE IF NOT EXISTS pr_reviews (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  repository_owner text NOT NULL,
  repository_name text NOT NULL,
  pr_number integer NOT NULL,
  commit_sha text NOT NULL,
  reviewed_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Index for fast lookups by repository and PR number
CREATE INDEX idx_pr_reviews_repo_pr ON pr_reviews (repository_owner, repository_name, pr_number);

-- Enable RLS
ALTER TABLE pr_reviews ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own reviews
CREATE POLICY "Users can read own pr_reviews"
  ON pr_reviews
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Allow users to insert their own reviews
CREATE POLICY "Users can insert own pr_reviews"
  ON pr_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
