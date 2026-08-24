
import { CheckpointRunner } from "./supabase/functions/analyze-repository/services/CheckpointRunner.ts";
import { OpenRouterProvider } from "./supabase/functions/analyze-repository/orchestrator/providers/OpenRouterProvider.ts";
import { AuthenticationSpec } from "./supabase/functions/analyze-repository/prompts/specifications/AuthenticationSpec.ts";
import { SessionJwtSpec } from "./supabase/functions/analyze-repository/prompts/specifications/SessionJwtSpec.ts";

const snippet = `const jwt = require('jsonwebtoken');
function generateToken(user) {
  return jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h', algorithm: 'HS256' });
}`;

async function run() {
  const runner = new CheckpointRunner(new OpenRouterProvider());
  
  const ctx = {
    repository: "test",
    prNumber: 1,
    commitSha: "123",
    changedFiles: [{ path: "test.js", content: snippet, deleted: false }],
    dependencies: []
  };

  const framework = "You are a senior security engineer.";

  console.log("=== SEC-AUTH-001 ===");
  const authRes = await runner.run(ctx, framework, AuthenticationSpec);
  console.log(JSON.stringify(authRes, null, 2));
  
  console.log("\\n=== SEC-SESSION-001 ===");
  const sessRes = await runner.run(ctx, framework, SessionJwtSpec);
  console.log(JSON.stringify(sessRes, null, 2));
}

run();
