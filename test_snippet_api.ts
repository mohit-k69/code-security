import { handleRequest } from "./supabase/functions/analyze-snippet/index.ts";

const req = new Request("http://localhost/analyze-snippet", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-test-bypass": "true"
  },
  body: JSON.stringify({
    files: [{ name: "snippet.js", content: "console.log('hello');" }]
  })
});

const res = await handleRequest(req);
const data = await res.json();
console.log(JSON.stringify(data, null, 2));
