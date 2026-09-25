-- Migration: Recovery verification, rate limiting, and restricted recovery tickets
-- Phase 2: Secure verification of recovery codes and issuance of restricted tickets

-- 1. Table for restricted short-lived recovery authorizations (recovery tickets)
CREATE TABLE IF NOT EXISTS public.user_recovery_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    ticket_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ NULL,
    revoked_at TIMESTAMPTZ NULL
);

-- Partial index for active ticket lookup
CREATE INDEX IF NOT EXISTS idx_user_recovery_tickets_lookup
    ON public.user_recovery_tickets(ticket_hash)
    WHERE consumed_at IS NULL AND revoked_at IS NULL;

-- Index for user lookups and cleanup
CREATE INDEX IF NOT EXISTS idx_user_recovery_tickets_user_id
    ON public.user_recovery_tickets(user_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.user_recovery_tickets ENABLE ROW LEVEL SECURITY;

-- Deny all client access (anon and authenticated)
REVOKE ALL ON TABLE public.user_recovery_tickets FROM PUBLIC;
REVOKE ALL ON TABLE public.user_recovery_tickets FROM anon;
REVOKE ALL ON TABLE public.user_recovery_tickets FROM authenticated;

-- Grant strictly to service_role and postgres
GRANT ALL ON TABLE public.user_recovery_tickets TO service_role;
GRANT ALL ON TABLE public.user_recovery_tickets TO postgres;


-- 2. Table for persistent rate limiting on recovery verification
CREATE TABLE IF NOT EXISTS public.recovery_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_key TEXT NOT NULL UNIQUE,
    attempts INT NOT NULL DEFAULT 1,
    first_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    blocked_until TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_recovery_rate_limits_key
    ON public.recovery_rate_limits(rate_key);

-- Enable RLS
ALTER TABLE public.recovery_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.recovery_rate_limits FROM PUBLIC;
REVOKE ALL ON TABLE public.recovery_rate_limits FROM anon;
REVOKE ALL ON TABLE public.recovery_rate_limits FROM authenticated;

GRANT ALL ON TABLE public.recovery_rate_limits TO service_role;
GRANT ALL ON TABLE public.recovery_rate_limits TO postgres;


-- 3. Atomic recovery-code consumption function
-- Ensures race-condition safe one-time code verification and consumption
CREATE OR REPLACE FUNCTION public.consume_recovery_code(
    p_user_id UUID,
    p_code_hash TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_updated_id UUID;
BEGIN
    -- Atomically lock and consume the active matching code
    UPDATE public.user_recovery_codes
    SET consumed_at = now()
    WHERE id = (
        SELECT id
        FROM public.user_recovery_codes
        WHERE user_id = p_user_id
          AND code_hash = p_code_hash
          AND consumed_at IS NULL
          AND revoked_at IS NULL
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    RETURNING id INTO v_updated_id;

    RETURN v_updated_id IS NOT NULL;
END;
$$;

-- Secure the consumption function
REVOKE ALL ON FUNCTION public.consume_recovery_code(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_recovery_code(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.consume_recovery_code(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_recovery_code(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_recovery_code(UUID, TEXT) TO postgres;
