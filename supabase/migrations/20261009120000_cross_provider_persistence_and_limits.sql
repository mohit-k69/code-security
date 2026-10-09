-- Migration: Cross-provider persistence, duplicate prevention and atomic limit enforcement

-- 1. Add provider to pr_reviews and update index
ALTER TABLE public.pr_reviews ADD COLUMN provider TEXT NOT NULL DEFAULT 'github';

DROP INDEX IF EXISTS idx_pr_reviews_repo_pr;
CREATE INDEX idx_pr_reviews_provider_repo_pr ON public.pr_reviews (provider, repository_owner, repository_name, pr_number);

-- 2. Atomic limit enforcement and idempotency reservation
CREATE OR REPLACE FUNCTION reserve_review_slot(
    p_user_id UUID, 
    p_limit INT,
    p_name TEXT,
    p_review_type TEXT,
    p_repository_owner TEXT,
    p_repository_name TEXT,
    p_pr_number INTEGER,
    p_commit_sha TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INT;
    v_reservation_id UUID;
    v_existing_reservation UUID;
BEGIN
    -- Advisory lock for concurrency on this user's limits
    PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

    -- Clean up stale reservations (older than 15 minutes)
    DELETE FROM public.reviews 
    WHERE user_id = p_user_id 
      AND verdict = 'IN_PROGRESS' 
      AND created_at < now() - interval '15 minutes';

    -- Check idempotency: is there already an active or completed review for this exact commit?
    IF p_commit_sha IS NOT NULL THEN
        SELECT id INTO v_existing_reservation FROM public.reviews
        WHERE user_id = p_user_id
          AND review_type = p_review_type
          AND repository_owner = p_repository_owner
          AND repository_name = p_repository_name
          AND pr_number = p_pr_number
          AND commit_sha = p_commit_sha
        LIMIT 1;

        IF v_existing_reservation IS NOT NULL THEN
            -- We already have a reservation or completed review for this exact run
            RAISE EXCEPTION 'Idempotency conflict: review for this commit already exists or is in progress.';
        END IF;
    END IF;

    -- Count active and completed reviews
    SELECT count(*) INTO v_count 
    FROM public.reviews 
    WHERE user_id = p_user_id;

    IF v_count >= p_limit THEN
        RAISE EXCEPTION 'Free review limit exceeded';
    END IF;

    -- Create reservation
    INSERT INTO public.reviews (
        user_id, name, review_type, repository_owner, repository_name, pr_number, commit_sha, verdict
    ) VALUES (
        p_user_id, p_name, p_review_type, p_repository_owner, p_repository_name, p_pr_number, p_commit_sha, 'IN_PROGRESS'
    ) RETURNING id INTO v_reservation_id;

    RETURN v_reservation_id;
END;
$$;

-- 3. Finalize review atomically
CREATE OR REPLACE FUNCTION finalize_review(
    p_reservation_id UUID,
    p_user_id UUID,
    p_verdict TEXT,
    p_total_findings INT,
    p_report JSONB
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_review public.reviews%ROWTYPE;
BEGIN
    -- Update the review record
    UPDATE public.reviews
    SET verdict = p_verdict,
        total_findings = p_total_findings,
        report = p_report
    WHERE id = p_reservation_id AND user_id = p_user_id
    RETURNING * INTO v_review;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reservation not found or unauthorized';
    END IF;

    -- Insert into pr_reviews for PRSelector
    IF v_review.pr_number IS NOT NULL AND v_review.repository_owner IS NOT NULL AND v_review.repository_name IS NOT NULL THEN
        INSERT INTO public.pr_reviews (
            user_id, provider, repository_owner, repository_name, pr_number, commit_sha
        ) VALUES (
            p_user_id, v_review.review_type, v_review.repository_owner, v_review.repository_name, v_review.pr_number, v_review.commit_sha
        );
    END IF;
END;
$$;

-- 4. Release reservation on failure
CREATE OR REPLACE FUNCTION release_review_reservation(
    p_reservation_id UUID,
    p_user_id UUID
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM public.reviews
    WHERE id = p_reservation_id AND user_id = p_user_id AND verdict = 'IN_PROGRESS';
END;
$$;
