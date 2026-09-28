-- Migration: Recovery-code distributed concurrency and atomic replacement
-- Phase 4A.2: PostgreSQL-level transaction serialization, non-blocking 64-bit advisory transaction locking, and atomic replacement

-- 1. Atomic recovery-code replacement function
-- Guarantees:
-- A. Non-blocking 64-bit advisory transaction locking (pg_catalog.pg_try_advisory_xact_lock) scoped per user
-- B. Concurrent requests for the same user immediately fail closed with RECOVERY_CODES_REGENERATION_IN_PROGRESS (no queueing/overwriting)
-- C. Atomicity: revocation of old codes and insertion of 10 new hashes commit together in one transaction
-- D. Rollback safety: failures never leave zero recoverable state or overlapping active generations
-- E. Distributed coordination across all Express instances, Cloud Run instances, and Supabase Edge Functions
-- F. Security Definer hardening with empty search_path (SET search_path = '') and fully qualified object references

CREATE OR REPLACE FUNCTION public.replace_user_recovery_codes_atomic(
    p_user_id UUID,
    p_code_hashes TEXT[]
)
RETURNS TABLE (
    revoked_count INT,
    inserted_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_lock_key BIGINT;
    v_revoked_count INT := 0;
    v_inserted_count INT := 0;
    v_hash TEXT;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'p_user_id cannot be null';
    END IF;

    IF p_code_hashes IS NULL OR pg_catalog.array_length(p_code_hashes, 1) IS NULL OR pg_catalog.array_length(p_code_hashes, 1) <> 10 THEN
        RAISE EXCEPTION 'p_code_hashes must contain exactly 10 recovery code hashes';
    END IF;

    -- 1. Derive deterministic 64-bit namespaced advisory lock key
    -- Uses 16 hex characters of md5('recovery_code_regeneration:' || p_user_id::text) cast to 64-bit bigint.
    -- This guarantees a collision-resistant 64-bit integer specific to recovery code generation for this user.
    v_lock_key := ('x' || pg_catalog.substr(pg_catalog.md5('recovery_code_regeneration:' || p_user_id::pg_catalog.text), 1, 16))::pg_catalog.bit(64)::BIGINT;

    -- 2. Non-blocking distributed advisory transaction lock
    -- If another transaction holds the lock for this user, reject immediately with controlled error
    IF NOT pg_catalog.pg_try_advisory_xact_lock(v_lock_key) THEN
        RAISE EXCEPTION 'RECOVERY_CODES_REGENERATION_IN_PROGRESS';
    END IF;

    -- 3. Atomically revoke all currently active (unconsumed and unrevoked) recovery codes for this user
    UPDATE public.user_recovery_codes
    SET revoked_at = pg_catalog.now()
    WHERE user_id = p_user_id
      AND consumed_at IS NULL
      AND revoked_at IS NULL;

    GET DIAGNOSTICS v_revoked_count = ROW_COUNT;

    -- 4. Insert exactly 10 new recovery code hashes in the exact same transaction
    FOREACH v_hash IN ARRAY p_code_hashes LOOP
        INSERT INTO public.user_recovery_codes (
            user_id,
            code_hash,
            created_at,
            consumed_at,
            revoked_at
        ) VALUES (
            p_user_id,
            v_hash,
            pg_catalog.now(),
            NULL,
            NULL
        );
    END LOOP;

    v_inserted_count := pg_catalog.array_length(p_code_hashes, 1);

    RETURN QUERY SELECT v_revoked_count, v_inserted_count;
END;
$$;

-- Secure the replacement function
REVOKE ALL ON FUNCTION public.replace_user_recovery_codes_atomic(UUID, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_user_recovery_codes_atomic(UUID, TEXT[]) FROM anon;
REVOKE ALL ON FUNCTION public.replace_user_recovery_codes_atomic(UUID, TEXT[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.replace_user_recovery_codes_atomic(UUID, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_user_recovery_codes_atomic(UUID, TEXT[]) TO postgres;
