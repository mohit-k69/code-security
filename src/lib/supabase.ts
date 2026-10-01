import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || 'https://placeholder.supabase.co';
const supabaseAnonKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || 'placeholder-anon-key';

// Prioritize localStorage for fast, persistent sessions across tabs & reloads.
// Seamlessly migrate any active tokens previously written to sessionStorage.
const getAuthStorage = () => {
  if (typeof window === 'undefined') return undefined;
  try {
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i);
      if (key && (key.startsWith('sb-') || key.includes('auth-token') || key.includes('supabase'))) {
        const val = window.sessionStorage.getItem(key);
        if (val && !window.localStorage.getItem(key)) {
          window.localStorage.setItem(key, val);
        }
      }
    }
  } catch {}
  return window.localStorage;
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: getAuthStorage(),
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Resilient Edge Function invoker with server-side proxy fallback
const originalInvoke = supabase.functions.invoke.bind(supabase.functions);
supabase.functions.invoke = async function (functionName: string, options?: any) {
  try {
    const result = await originalInvoke(functionName, options);
    if (result.error && (
      result.error.message?.includes('Failed to send a request') ||
      result.error.message?.includes('NOT_FOUND') ||
      (result.error as any).context?.status === 404
    )) {
      return await fallbackInvoke(functionName, options);
    }
    return result;
  } catch (err: any) {
    return await fallbackInvoke(functionName, options);
  }
};

async function fallbackInvoke(functionName: string, options?: any) {
  if (typeof window === 'undefined') {
    return { data: null, error: new Error('Fallback invoker requires browser context') };
  }
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    };
    const response = await fetch(`/api/functions/${functionName}`, {
      method: options?.method || 'POST',
      headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await response.json();
    if (!response.ok) {
      return { data: null, error: new Error(data?.error || `HTTP ${response.status}: Failed to invoke function`) };
    }
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: err };
  }
}
