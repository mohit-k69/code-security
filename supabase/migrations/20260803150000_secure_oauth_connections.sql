-- This migration removes the permissive RLS policies on the oauth_connections table
-- to ensure that the frontend client can never read or modify sensitive OAuth tokens directly.
-- All access to this table must now be done through Edge Functions using the service_role key.

-- Drop the permissive policies created in the previous migration
DROP POLICY IF EXISTS "Users can view their own oauth connections" ON public.oauth_connections;
DROP POLICY IF EXISTS "Users can insert their own oauth connections" ON public.oauth_connections;
DROP POLICY IF EXISTS "Users can update their own oauth connections" ON public.oauth_connections;
DROP POLICY IF EXISTS "Users can delete their own oauth connections" ON public.oauth_connections;

-- Ensure RLS is still enabled (meaning deny-all for the anon/authenticated roles)
ALTER TABLE public.oauth_connections ENABLE ROW LEVEL SECURITY;
