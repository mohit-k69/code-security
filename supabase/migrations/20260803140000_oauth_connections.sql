-- Create the oauth_connections table
CREATE TABLE public.oauth_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('github', 'gitlab', 'bitbucket')),
    provider_user_id TEXT,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Ensure a user only has one connection per provider
    CONSTRAINT oauth_connections_user_id_provider_key UNIQUE(user_id, provider)
);

-- Add a trigger to automatically update the updated_at column
CREATE OR REPLACE FUNCTION update_oauth_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_oauth_connections_updated_at_trigger
    BEFORE UPDATE ON public.oauth_connections
    FOR EACH ROW
    EXECUTE FUNCTION update_oauth_connections_updated_at();

-- Enable Row Level Security (RLS)
ALTER TABLE public.oauth_connections ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own connections
CREATE POLICY "Users can view their own oauth connections"
    ON public.oauth_connections
    FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Users can insert their own connections
CREATE POLICY "Users can insert their own oauth connections"
    ON public.oauth_connections
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own connections
CREATE POLICY "Users can update their own oauth connections"
    ON public.oauth_connections
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own connections
CREATE POLICY "Users can delete their own oauth connections"
    ON public.oauth_connections
    FOR DELETE
    USING (auth.uid() = user_id);

-- Note: The `service_role` key bypasses RLS by default in Supabase, 
-- so Edge Functions using the service_role client will automatically 
-- have full access to read and update these tokens without explicit policies.
