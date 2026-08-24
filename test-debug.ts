import { handleRequest } from "./supabase/functions/analyze-snippet/index.ts";

async function run() {
    const req = new Request("http://localhost/analyze-snippet", {
    method: "POST",
    headers: {
      "Authorization": "Bearer test-token",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      files: [{ name: "snippet.js", content: "const a = 1;" }]
    })
  });
  const res = await handleRequest(req);
  console.log(await res.text());
}
run();
