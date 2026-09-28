import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Crockford Base32 alphabet (32 symbols, 5 bits per character)
const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const RECOVERY_CODES_COUNT = 10;
const ENTROPY_BYTES = 20; // 160 bits of cryptographically secure entropy (>= 128 bits required)

function normalizeRecoveryCode(rawCode: string): string {
  if (!rawCode || typeof rawCode !== 'string') return '';
  return rawCode
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

function generateSingleCode(entropyBytes: number = ENTROPY_BYTES): string {
  const randomBytes = new Uint8Array(entropyBytes);
  crypto.getRandomValues(randomBytes);

  const totalBits = entropyBytes * 8;
  const numChars = Math.floor(totalBits / 5);
  const charArray: string[] = [];

  let bitBuffer = 0;
  let bitCount = 0;
  let byteIndex = 0;

  for (let i = 0; i < numChars; i++) {
    while (bitCount < 5 && byteIndex < entropyBytes) {
      bitBuffer = (bitBuffer << 8) | randomBytes[byteIndex++];
      bitCount += 8;
    }
    const shift = bitCount - 5;
    const index = (bitBuffer >> shift) & 0x1f;
    bitBuffer &= (1 << shift) - 1;
    bitCount -= 5;
    charArray.push(CROCKFORD_ALPHABET[index]);
  }

  const chunks: string[] = [];
  for (let i = 0; i < charArray.length; i += 4) {
    chunks.push(charArray.slice(i, i + 4).join(''));
  }
  return chunks.join('-');
}

async function hashRecoveryCode(code: string): Promise<string> {
  const normalized = normalizeRecoveryCode(code);
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 405,
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized: missing authorization header' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    // 1. Verify user identity with anon client and incoming user JWT
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[generate-recovery-codes] Missing Supabase environment configuration');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    // 2. Initialize privileged admin client using Service Role Key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 3. Generate exactly 10 independent codes and compute hashes
    const codes: string[] = [];
    const hashes: string[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < RECOVERY_CODES_COUNT; i++) {
      let code: string;
      do {
        code = generateSingleCode(ENTROPY_BYTES);
      } while (seen.has(code));
      seen.add(code);
      codes.push(code);
      hashes.push(await hashRecoveryCode(code));
    }

    // 4. Atomically serialize and replace recovery codes via PostgreSQL transaction
    const { error: rpcError } = await supabaseAdmin.rpc('replace_user_recovery_codes_atomic', {
      p_user_id: user.id,
      p_code_hashes: hashes,
    });

    if (rpcError) {
      const errMsg = rpcError.message || '';
      if (
        errMsg.includes('RECOVERY_CODES_REGENERATION_IN_PROGRESS') ||
        (rpcError.code === 'P0001' && errMsg.includes('IN_PROGRESS'))
      ) {
        return new Response(
          JSON.stringify({
            error: 'RECOVERY_CODES_REGENERATION_IN_PROGRESS',
            message: 'Recovery code generation is already in progress for this account. Please wait a moment.',
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 409,
          }
        );
      }

      if (
        errMsg.includes('does not exist') ||
        errMsg.includes('not found') ||
        errMsg === 'Unknown RPC function' ||
        rpcError.code === '42883' ||
        rpcError.code === 'PGRST202'
      ) {
        console.error('[generate-recovery-codes] replace_user_recovery_codes_atomic RPC is not available in database');
        return new Response(
          JSON.stringify({
            error: 'RECOVERY_CODES_TEMPORARILY_UNAVAILABLE',
            message: 'Recovery code service is temporarily unavailable.',
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 503,
          }
        );
      }

      console.error('[generate-recovery-codes] Database error during atomic replacement:', errMsg);
      return new Response(
        JSON.stringify({
          error: 'RECOVERY_CODES_DATABASE_ERROR',
          message: 'Failed to update recovery codes.',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    // 5. Return plaintext codes strictly ONCE to client
    // Plaintext codes are NEVER logged in console or persisted
    return new Response(JSON.stringify({ success: true, count: codes.length, codes }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err: any) {
    console.error('[generate-recovery-codes] Unexpected error occurred');
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
