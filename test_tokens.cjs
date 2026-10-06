const { execSync } = require('child_process');
const https = require('https');

async function testToken(token) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: '/user',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Node.js'
      }
    };
    const req = https.request(options, (res) => {
      resolve(res.statusCode);
    });
    req.on('error', () => resolve('error'));
    req.end();
  });
}

async function main() {
  const result = execSync('npx supabase db query "SELECT user_id, provider_user_id, access_token FROM oauth_connections WHERE provider=\'github\'" --linked --output json');
  const stdout = result.toString();
  try {
    const data = JSON.parse(stdout);
    for (const row of data.rows) {
      if (row.access_token) {
        const code = await testToken(row.access_token);
        console.log(`user_id: ${row.user_id}, provider_user_id: ${row.provider_user_id}, validates: ${code === 200 ? 'YES' : 'NO (' + code + ')'}`);
      }
    }
  } catch (e) {
    console.error("Error parsing JSON:", e.message);
  }
}
main();
