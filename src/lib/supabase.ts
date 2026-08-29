import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const originalInvoke = supabase.functions.invoke.bind(supabase.functions);

supabase.functions.invoke = async (functionName: string, options?: any) => {
  // 1. Try Supabase Edge Functions directly
  try {
    const result = await originalInvoke(functionName, options);
    if (!result.error && result.data) {
      return result;
    }
  } catch (cloudErr) {
    console.warn(`Direct Supabase function invocation for ${functionName} failed, trying local proxy:`, cloudErr);
  }

  // 2. Fallback to local server proxy if cloud fails or returns error
  try {
    const url = `/api/functions/${functionName}`;
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    
    const headers: Record<string, string> = {
      ...options?.headers,
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (options?.body) headers['Content-Type'] = 'application/json';

    const res = await fetch(url, {
      method: options?.method || 'POST',
      headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    const isJson = res.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await res.json() : await res.text();
    
    if (!res.ok) {
      return { data: null, error: new Error(data?.error || data || 'Function error') };
    }
    return { data, error: null };
  } catch (localErr: any) {
    return { data: null, error: localErr };
  }
};
