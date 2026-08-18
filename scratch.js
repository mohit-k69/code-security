import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://riqjsppvihvcyihuhkzg.supabase.co';
const supabaseKey = 'sb_publishable_BL2lW9myFpxdmG4E2JOlCw_MrSPx8kJ';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase
    .from('pr_reviews')
    .select('pr_number, commit_sha')
    .eq('repository_owner', 'test')
    .eq('repository_name', 'test');
    
  console.log('Error:', error);
}

test();
