import { ReviewOrchestrator } from "./supabase/functions/analyze-repository/orchestrator/ReviewOrchestrator.ts";
import { OpenRouterProvider } from "./supabase/functions/analyze-repository/orchestrator/providers/OpenRouterProvider.ts";
import { CheckpointRegistry } from "./supabase/functions/analyze-repository/orchestrator/registry/CheckpointRegistry.ts";

const provider = new OpenRouterProvider();
const orchestrator = new ReviewOrchestrator({ provider });

const payload = {
  repository: "local_user/paste_snippet",
  prNumber: 0,
  commitSha: "local",
  changedFiles: [
    {
      path: "snippet.js",
      content: "const express = require('express');\nconst app = express();\nconst db = require('./db');\n\napp.post('/user', (req, res) => {\n  const id = req.body.id;\n  db.query(`SELECT * FROM users WHERE id = ${id}`);\n  res.send('ok');\n});"
    }
  ],
  dependencies: []
};

async function run() {
  const result = await orchestrator.review(payload);
  
  console.log(JSON.stringify(result, null, 2));
}
run();
