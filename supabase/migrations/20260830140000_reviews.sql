-- Migration: Create reviews table to persist code analysis history for users
CREATE TABLE IF NOT EXISTS public.reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    review_type TEXT NOT NULL DEFAULT 'github',
    repository_owner TEXT,
    repository_name TEXT,
    pr_number INTEGER,
    commit_sha TEXT,
    verdict TEXT NOT NULL DEFAULT 'NOT_VERIFIED',
    total_findings INTEGER NOT NULL DEFAULT 0,
    report JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups and ordering by user
CREATE INDEX IF NOT EXISTS idx_reviews_user_created ON public.reviews (user_id, created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view only their own reviews
CREATE POLICY "Users can read own reviews"
    ON public.reviews
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Allow authenticated users to insert only their own reviews
CREATE POLICY "Users can insert own reviews"
    ON public.reviews
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to update only their own reviews
CREATE POLICY "Users can update own reviews"
    ON public.reviews
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to delete only their own reviews
CREATE POLICY "Users can delete own reviews"
    ON public.reviews
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);
