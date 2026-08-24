import { ReviewOrchestrator } from "./supabase/functions/analyze-repository/orchestrator/ReviewOrchestrator.ts";
import { OpenRouterProvider } from "./supabase/functions/analyze-repository/orchestrator/providers/OpenRouterProvider.ts";

const provider = new OpenRouterProvider();
const orchestrator = new ReviewOrchestrator({ provider });

const payload = {
  repository: "local_user/jwt_overlap",
  prNumber: 0,
  commitSha: "local",
  changedFiles: [
    {
      path: "snippet.js",
      content: `const express = require('express');
const jwt = require('jsonwebtoken');
const app = express();

const JWT_SECRET = "my_hardcoded_jwt_secret";

app.post('/api/login', (req, res) => {
  const token = jwt.sign({ user: "admin" }, JWT_SECRET);
  res.json({ token });
});`
    }
  ],
  dependencies: []
};

async function run() {
  console.log("Testing JWT/Secret Overlap Separation...");
  try {
    const result = await orchestrator.review(payload);
    console.log(JSON.stringify(result, null, 2));
  } catch(e) {
    console.log("Error:", e.message);
  }
}
run();
