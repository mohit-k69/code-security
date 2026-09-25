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
