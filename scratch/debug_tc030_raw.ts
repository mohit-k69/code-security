import { SessionJwtSpec } from "../supabase/functions/analyze-repository/prompts/specifications/SessionJwtSpec.ts";
import { CheckpointRunner } from "../supabase/functions/analyze-repository/services/CheckpointRunner.ts";
import { OpenRouterProvider } from "../supabase/functions/analyze-repository/orchestrator/providers/OpenRouterProvider.ts";

const snippet = `app.post('/login', (req, res) => {
  const user = req.body.username;
  const pass = crypto.createHash('md5').update(req.body.password).digest('hex');
  if (user === 'admin') {
    const token = jwt.sign({ user }, 'super_secret_jwt_key');
    res.json({ token });
  }
});`;

// Temporarily instantiate provider. Note: OpenRouterProvider currently has temperature: 0.1 locally.
// We will manually mock it to see what happens at 0.0 if we wanted, but let's just use the provider 
// and override the payload if we want, or we can just fetch directly to OpenRouter.

async function run() {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  const targetModel = "openai/gpt-5.6-luna"; // or google/gemini-3.1-flash-lite
  
  const runner = new CheckpointRunner(new OpenRouterProvider(targetModel));
  // We can't easily intercept the raw output from CheckpointRunner without modifying it.
  // Instead, let's just build the prompt and call fetch.
  
  // @ts-ignore
  const prompt = runner.buildPrompt(SessionJwtSpec, {
    repository: "test",
    prNumber: 1,
    commitSha: "123",
    changedFiles: [{ path: "test.js", content: snippet, deleted: false }],
    dependencies: []
  });

  const requestBody = {
    model: targetModel,
    messages: [
      { role: "system", content: "You are a senior security engineer." },
      { role: "user", content: prompt }
    ],
    response_format: { type: "json_object" },
    temperature: 0.0, // Force 0.0 for this test
  };

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody)
  });

  const json = await response.json();
  console.log(JSON.stringify(json, null, 2));
}

run();
