-- Migration: Password reset and session revocation via restricted recovery tickets
-- Phase 3: Secure password reset, atomic ticket consumption, and session invalidation

-- 1. Atomic recovery-ticket consumption function
-- Ensures two concurrent requests cannot both consume the same recovery ticket
CREATE OR REPLACE FUNCTION public.consume_recovery_ticket_atomic(
    p_ticket_hash TEXT
)
RETURNS TABLE (
    ticket_id UUID,
    user_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    UPDATE public.user_recovery_tickets
    SET consumed_at = now()
    WHERE id = (
        SELECT id
        FROM public.user_recovery_tickets
        WHERE ticket_hash = p_ticket_hash
          AND consumed_at IS NULL
          AND revoked_at IS NULL
          AND expires_at > now()
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
SET search_path = public, auth, pg_temp
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
    SET revoked_at = now()
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
