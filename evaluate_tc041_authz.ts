import { CheckpointRouter } from "./supabase/functions/analyze-repository/orchestrator/router/CheckpointRouter.ts";
import { localCodeVibeTask } from "./local_eval_task.ts";

async function main() {
  // Hack to force AuthorizationSpec execution
  const routerProto = CheckpointRouter.prototype as any;
  const originalRoute = routerProto.route;
  routerProto.route = async function() {
    return {
      selectedCheckpointIds: ["SEC-AUTHZ-001"],
      skippedCheckpointIds: [],
      isFallback: true,
      explanation: ["Forced SEC-AUTHZ-001"]
    };
  };

  const snippet = `app.get('/users/:id/messages', (req, res) => {
  const messages = db.getMessagesForUser(req.params.id);
  res.json(messages);
});`;
  const result = await localCodeVibeTask(snippet);
  console.log("\n================================\nEvaluating tc_041 (Forced AUTHZ)...\n================================");
  console.log("Verdict:", result.verdict);
  console.log("Checkpoints:");
  for (const cp of result.checkpoints) {
    console.log(`  - ${cp.checkpointId}: ${cp.verdict}`);
  }
}

main().catch(console.error);
