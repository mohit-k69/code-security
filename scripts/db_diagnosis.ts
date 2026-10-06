import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_ADMIN_KEY || '';

if (!url || !serviceKey) {
  console.error("Missing credentials");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function run() {
  const { data: { users }, error: usersErr } = await admin.auth.admin.listUsers();
  if (usersErr) throw usersErr;
  
  for (const u of users) {
    const maskedEmail = u.email ? u.email.replace(/(.{2})(.*)(@.*)/, '$1***$3') : 'none';
    console.log(`\nUser: ${u.id}`);
    console.log(`Email: ${maskedEmail}`);
    console.log(`Identities:`);
    for (const id of u.identities || []) {
      console.log(` - ${id.provider} (ID: ${id.id}) | Created: ${id.created_at} | Updated: ${id.updated_at}`);
    }
    
    const { data: connections, error: connErr } = await admin.from('oauth_connections').select('*').eq('user_id', u.id);
    if (connErr) throw connErr;
    console.log(`OAuth Connections:`);
    if (!connections || connections.length === 0) {
      console.log(` - None`);
    }
    for (const c of connections || []) {
      console.log(` - Provider: ${c.provider} | Provider User ID: ${c.provider_user_id}`);
      console.log(`   Has Access Token: ${!!c.access_token} | Has Refresh Token: ${!!c.refresh_token}`);
      console.log(`   Created: ${c.created_at} | Updated: ${c.updated_at} | Expires: ${c.expires_at}`);
    }
  }
}
run().catch(console.error);
