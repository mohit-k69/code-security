CREATE TABLE IF NOT EXISTS public.oauth_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    locked_at TIMESTAMPTZ
);

ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;

-- Keep oauth_states inaccessible to the browser/client through RLS.
-- This ensures only the service role key (backend) can read/write states.
CREATE POLICY "Deny all access to oauth_states"
    ON public.oauth_states
    FOR ALL
    USING (false);
