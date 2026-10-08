import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.production') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('[SENSITIVE]')) {
  console.log("Cannot query DB: missing or masked credentials in .env.production");
  process.exit(0);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('oauth_connections').select('user_id, provider, updated_at').eq('provider', 'bitbucket').order('updated_at', { ascending: false }).limit(5);
  if (error) {
    console.error("DB Error:", error);
  } else {
    console.log("Recent Bitbucket OAuth Connections:");
    console.log(data);
  }
}
check();
