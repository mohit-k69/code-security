import { handleRequest } from "./supabase/functions/analyze-snippet/index.ts";
const req = new Request("http://localhost/analyze-snippet", {
  method: "POST",
  headers: { "Authorization": "Bearer test-token", "Content-Type": "application/json" },
  body: JSON.stringify({ files: [{ name: "snippet.js", content: "const jwt = require(\"jsonwebtoken\");\nfunction login(user) {\n  return jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: \"1h\" });\n}" }] })
});
const res = await handleRequest(req);
console.log(await res.text());
