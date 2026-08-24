const snippet = `const jwt = require('jsonwebtoken');
function generateToken(user) {
  return jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h', algorithm: 'HS256' });
}`;

async function run() {
  const API_URL = "https://riqjsppvihvcyihuhkzg.supabase.co/functions/v1/analyze-snippet";
  
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-test-bypass': 'true'
    },
    body: JSON.stringify({
      files: [{ name: "snippet.js", content: snippet }]
    })
  });
  
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

run();
