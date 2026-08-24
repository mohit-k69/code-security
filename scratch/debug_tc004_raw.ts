import { SessionJwtSpec } from "../supabase/functions/analyze-repository/prompts/specifications/SessionJwtSpec.ts";
import { CheckpointRunner } from "../supabase/functions/analyze-repository/services/CheckpointRunner.ts";
import { OpenRouterProvider } from "../supabase/functions/analyze-repository/orchestrator/providers/OpenRouterProvider.ts";

const snippet = `const jwt = require('jsonwebtoken');
function generateToken(user) {
  return jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h', algorithm: 'HS256' });
}`;

async function run() {
  const runner = new CheckpointRunner(new OpenRouterProvider("openai/gpt-5.6-luna"));
  
  // @ts-ignore
  const result = await runner.run({
    repository: "test",
    prNumber: 1,
    commitSha: "123",
    changedFiles: [{ path: "test.js", content: snippet, deleted: false }],
    dependencies: []
  }, "You are a security engineer", SessionJwtSpec);

  console.log(JSON.stringify(result, null, 2));
}

run();
