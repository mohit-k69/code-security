import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  console.log('Calling signUp...');
  const res = await supabase.auth.signUp({
    email: 'test_node_' + Date.now() + '@example.com',
    password: 'password123',
    options: {
      data: {
        first_name: 'Test',
        last_name: 'User',
        full_name: 'Test User'
      }
    }
  });
  console.log('Response:', JSON.stringify(res, null, 2));
}

test();
