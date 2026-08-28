import { localCodeVibeTask } from "./local_eval_task.ts";

async function main() {
  const snippet = `app.get('/users/:id/messages', (req, res) => {
  const messages = db.getMessagesForUser(req.params.id);
  res.json(messages);
});`;
  const result = await localCodeVibeTask(snippet);
  console.log("\n================================\nEvaluating tc_041...\n================================");
  console.log("Verdict:", result.verdict);
  console.log("Checkpoints:");
  for (const cp of result.checkpoints) {
    console.log(`  - ${cp.checkpointId}: ${cp.verdict}`);
  }
}

main().catch(console.error);
