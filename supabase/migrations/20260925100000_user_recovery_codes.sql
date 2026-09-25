-- Migration: Create user_recovery_codes table for secure one-time recovery codes
-- Phase 1: Database foundation for recovery codes

CREATE TABLE IF NOT EXISTS public.user_recovery_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    consumed_at TIMESTAMPTZ NULL,
    revoked_at TIMESTAMPTZ NULL
);

-- Index for querying all recovery codes belonging to a user (e.g. for revocation or account deletion)
CREATE INDEX IF NOT EXISTS idx_user_recovery_codes_user_id
    ON public.user_recovery_codes(user_id);

-- Partial index for active codes per user (unconsumed and unrevoked) for status checks and batch invalidation
CREATE INDEX IF NOT EXISTS idx_user_recovery_codes_user_active
    ON public.user_recovery_codes(user_id)
    WHERE consumed_at IS NULL AND revoked_at IS NULL;

-- Fast index for lookup / verification during recovery verification (Phase 2)
CREATE INDEX IF NOT EXISTS idx_user_recovery_codes_lookup
    ON public.user_recovery_codes(user_id, code_hash)
    WHERE consumed_at IS NULL AND revoked_at IS NULL;

-- Enable Row Level Security (RLS)
ALTER TABLE public.user_recovery_codes ENABLE ROW LEVEL SECURITY;

-- Deny-all client policy: The client must NOT be able to directly read, insert, update, or delete recovery codes.
-- By enabling RLS and not adding any permissive policies for anon or authenticated roles,
-- PostgreSQL denies all client operations by default.
-- Defense-in-depth: explicitly revoke all permissions from public, anon, and authenticated roles.
REVOKE ALL ON TABLE public.user_recovery_codes FROM PUBLIC;
REVOKE ALL ON TABLE public.user_recovery_codes FROM anon;
REVOKE ALL ON TABLE public.user_recovery_codes FROM authenticated;

-- Grant access strictly to trusted backend roles (service_role and postgres)
GRANT ALL ON TABLE public.user_recovery_codes TO service_role;
GRANT ALL ON TABLE public.user_recovery_codes TO postgres;
