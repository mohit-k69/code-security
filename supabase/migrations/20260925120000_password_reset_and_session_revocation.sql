-- Migration: Password reset and session revocation via restricted recovery tickets
-- Phase 3: Secure password reset, atomic ticket lease/claim, and session invalidation

-- 1. Extend user_recovery_tickets schema for resilient ticket leasing and ambiguous outcome containment
ALTER TABLE public.user_recovery_tickets
    ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS claim_expires_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS claim_id UUID NULL,
    ADD COLUMN IF NOT EXISTS password_updated_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS ambiguous_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_user_recovery_tickets_claim
    ON public.user_recovery_tickets(ticket_hash, claim_expires_at)
    WHERE consumed_at IS NULL AND revoked_at IS NULL AND ambiguous_at IS NULL;

-- 2. Atomic recovery-ticket claim/lease function
-- Ensures two concurrent requests cannot claim the same ticket simultaneously.
-- Acquires a short-lived server-controlled lease (e.g. 30 seconds).
CREATE OR REPLACE FUNCTION public.claim_recovery_ticket_atomic(
    p_ticket_hash TEXT,
    p_lease_seconds INT DEFAULT 30
)
RETURNS TABLE (
    ticket_id UUID,
    user_id UUID,
    claim_id UUID,
    already_updated BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_claim_id UUID := pg_catalog.gen_random_uuid();
    v_lease_seconds INT := pg_catalog.coalesce(p_lease_seconds, 30);
    v_ticket_id UUID;
    v_user_id UUID;
    v_already_updated BOOLEAN := FALSE;
BEGIN
    -- Clamp lease seconds between 5 and 60 seconds (server-controlled)
    IF v_lease_seconds < 5 THEN
        v_lease_seconds := 5;
    ELSIF v_lease_seconds > 60 THEN
        v_lease_seconds := 60;
    END IF;

    -- Select and lock eligible ticket row
    -- CRITICAL: ambiguous_at MUST be NULL (an ambiguous ticket can NEVER be re-claimed)
    SELECT id, user_recovery_tickets.user_id, (password_updated_at IS NOT NULL)
    INTO v_ticket_id, v_user_id, v_already_updated
    FROM public.user_recovery_tickets
    WHERE ticket_hash = p_ticket_hash
      AND consumed_at IS NULL
      AND revoked_at IS NULL
      AND ambiguous_at IS NULL
      AND expires_at > pg_catalog.now()
      AND (claim_expires_at IS NULL OR claim_expires_at < pg_catalog.now() OR password_updated_at IS NOT NULL)
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

    IF v_ticket_id IS NOT NULL THEN
        UPDATE public.user_recovery_tickets
        SET claimed_at = pg_catalog.now(),
            claim_expires_at = pg_catalog.now() + (v_lease_seconds || ' seconds')::interval,
            claim_id = v_claim_id
        WHERE id = v_ticket_id;

        RETURN QUERY SELECT v_ticket_id, v_user_id, v_claim_id, v_already_updated;
    END IF;
END;
$$;

-- Secure the ticket claim function
REVOKE ALL ON FUNCTION public.claim_recovery_ticket_atomic(TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_recovery_ticket_atomic(TEXT, INT) FROM anon;
REVOKE ALL ON FUNCTION public.claim_recovery_ticket_atomic(TEXT, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_recovery_ticket_atomic(TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_recovery_ticket_atomic(TEXT, INT) TO postgres;

-- 3. Safely release a claim ONLY if password update definitely failed before completion
CREATE OR REPLACE FUNCTION public.release_recovery_ticket_claim(
    p_ticket_id UUID,
    p_claim_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_updated INT;
BEGIN
    -- Only release if password was NOT updated yet, ticket is unconsumed, AND NOT ambiguous
    UPDATE public.user_recovery_tickets
    SET claimed_at = NULL,
        claim_expires_at = NULL,
        claim_id = NULL
    WHERE id = p_ticket_id
      AND claim_id = p_claim_id
      AND consumed_at IS NULL
      AND password_updated_at IS NULL
      AND ambiguous_at IS NULL;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN (v_updated > 0);
END;
$$;

REVOKE ALL ON FUNCTION public.release_recovery_ticket_claim(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_recovery_ticket_claim(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.release_recovery_ticket_claim(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.release_recovery_ticket_claim(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_recovery_ticket_claim(UUID, UUID) TO postgres;

-- 4. Mark ticket as permanently ambiguous/locked when external outcome cannot be proven
CREATE OR REPLACE FUNCTION public.mark_recovery_ticket_ambiguous(
    p_ticket_id UUID,
    p_claim_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_updated INT;
BEGIN
    UPDATE public.user_recovery_tickets
    SET ambiguous_at = pg_catalog.now(),
        claim_expires_at = NULL -- Permanently prevent lease expiration resurrection
    WHERE id = p_ticket_id
      AND claim_id = p_claim_id
      AND consumed_at IS NULL;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN (v_updated > 0);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_recovery_ticket_ambiguous(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_recovery_ticket_ambiguous(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.mark_recovery_ticket_ambiguous(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_recovery_ticket_ambiguous(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_recovery_ticket_ambiguous(UUID, UUID) TO postgres;

-- 4. Record password update succeeded before final ticket consumption
CREATE OR REPLACE FUNCTION public.record_recovery_password_updated(
    p_ticket_id UUID,
    p_claim_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_updated INT;
BEGIN
    UPDATE public.user_recovery_tickets
    SET password_updated_at = pg_catalog.now()
    WHERE id = p_ticket_id
      AND claim_id = p_claim_id
      AND consumed_at IS NULL;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN (v_updated > 0);
END;
$$;

REVOKE ALL ON FUNCTION public.record_recovery_password_updated(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_recovery_password_updated(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.record_recovery_password_updated(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_recovery_password_updated(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_recovery_password_updated(UUID, UUID) TO postgres;

-- 5. Finalize ticket consumption permanently
CREATE OR REPLACE FUNCTION public.finalize_recovery_ticket_atomic(
    p_ticket_id UUID,
    p_claim_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_updated INT;
BEGIN
    UPDATE public.user_recovery_tickets
    SET consumed_at = pg_catalog.now(),
        claim_expires_at = NULL
    WHERE id = p_ticket_id
      AND (claim_id = p_claim_id OR password_updated_at IS NOT NULL)
      AND consumed_at IS NULL;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN (v_updated > 0);
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_recovery_ticket_atomic(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_recovery_ticket_atomic(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_recovery_ticket_atomic(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_recovery_ticket_atomic(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_recovery_ticket_atomic(UUID, UUID) TO postgres;

-- 6. Atomic recovery-ticket consumption function (backward compatibility)
CREATE OR REPLACE FUNCTION public.consume_recovery_ticket_atomic(
    p_ticket_hash TEXT
)
RETURNS TABLE (
    ticket_id UUID,
    user_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    UPDATE public.user_recovery_tickets
    SET consumed_at = pg_catalog.now()
    WHERE id = (
        SELECT id
        FROM public.user_recovery_tickets
        WHERE ticket_hash = p_ticket_hash
          AND consumed_at IS NULL
          AND revoked_at IS NULL
          AND ambiguous_at IS NULL
          AND expires_at > pg_catalog.now()
          AND (claim_expires_at IS NULL OR claim_expires_at < pg_catalog.now())
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    RETURNING id AS ticket_id, user_recovery_tickets.user_id AS user_id;
END;
$$;

-- Secure the ticket consumption function
REVOKE ALL ON FUNCTION public.consume_recovery_ticket_atomic(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_recovery_ticket_atomic(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.consume_recovery_ticket_atomic(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_recovery_ticket_atomic(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_recovery_ticket_atomic(TEXT) TO postgres;


-- 2. Revoke all existing sessions for a user after password recovery
CREATE OR REPLACE FUNCTION public.revoke_user_sessions_after_recovery(
    p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Delete refresh tokens for the user in Supabase auth schema if table exists
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'auth' AND table_name = 'refresh_tokens'
    ) THEN
        DELETE FROM auth.refresh_tokens
        WHERE user_id = p_user_id::text
           OR session_id IN (
               SELECT id FROM auth.sessions WHERE user_id = p_user_id
           );
    END IF;

    -- Delete active sessions for the user in Supabase auth schema if table exists
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'auth' AND table_name = 'sessions'
    ) THEN
        DELETE FROM auth.sessions
        WHERE user_id = p_user_id;
    END IF;

    -- Invalidate any remaining unconsumed recovery tickets for this user
    UPDATE public.user_recovery_tickets
    SET revoked_at = pg_catalog.now()
    WHERE user_id = p_user_id
      AND consumed_at IS NULL
      AND revoked_at IS NULL;
END;
$$;

-- Secure session revocation function
REVOKE ALL ON FUNCTION public.revoke_user_sessions_after_recovery(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_user_sessions_after_recovery(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.revoke_user_sessions_after_recovery(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_sessions_after_recovery(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_user_sessions_after_recovery(UUID) TO postgres;


-- 3. Audit log table for recovery security events
CREATE TABLE IF NOT EXISTS public.recovery_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    user_id UUID NULL,
    ticket_id UUID NULL,
    ip TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recovery_audit_logs_event
    ON public.recovery_audit_logs(event_type, created_at DESC);

ALTER TABLE public.recovery_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.recovery_audit_logs FROM PUBLIC;
REVOKE ALL ON TABLE public.recovery_audit_logs FROM anon;
REVOKE ALL ON TABLE public.recovery_audit_logs FROM authenticated;
GRANT ALL ON TABLE public.recovery_audit_logs TO service_role;
GRANT ALL ON TABLE public.recovery_audit_logs TO postgres;
