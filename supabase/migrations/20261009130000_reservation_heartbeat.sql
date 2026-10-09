-- Migration: Add heartbeat support for long-running review reservations

-- 1. Add last_heartbeat_at column to track active reservations without changing their display order
ALTER TABLE public.reviews ADD COLUMN last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 2. Update reserve_review_slot to use last_heartbeat_at for cleanup
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

    -- Clean up stale reservations (no heartbeat in the last 15 minutes)
    DELETE FROM public.reviews 
    WHERE user_id = p_user_id 
      AND verdict = 'IN_PROGRESS' 
      AND last_heartbeat_at < now() - interval '15 minutes';

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
        user_id, name, review_type, repository_owner, repository_name, pr_number, commit_sha, verdict, last_heartbeat_at
    ) VALUES (
        p_user_id, p_name, p_review_type, p_repository_owner, p_repository_name, p_pr_number, p_commit_sha, 'IN_PROGRESS', now()
    ) RETURNING id INTO v_reservation_id;

    RETURN v_reservation_id;
END;
$$;

-- 3. Add heartbeat function
CREATE OR REPLACE FUNCTION heartbeat_review_reservation(
    p_reservation_id UUID,
    p_user_id UUID
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.reviews
    SET last_heartbeat_at = now()
    WHERE id = p_reservation_id AND user_id = p_user_id AND verdict = 'IN_PROGRESS';
END;
$$;
