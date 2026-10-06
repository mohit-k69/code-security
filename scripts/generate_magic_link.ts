import { createClient } from '@supabase/supabase-js';

const url = 'https://riqjsppvihvcyihuhkzg.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpcWpzcHB2aWh2Y3lpaHVoa3pnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTU3NTE2NCwiZXhwIjoyMTAxMTUxMTY0fQ.2pPPddQ5txQa6097V7u1PD-zGvF3s7uHsoQtcXv1PrE';

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function run() {
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: 'mohit.k.main@gmail.com',
  });
  if (error) throw error;
  console.log(data.properties.action_link);
}
run().catch(console.error);
