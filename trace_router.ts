import { CheckpointRouter } from "./supabase/functions/analyze-repository/orchestrator/router/CheckpointRouter.ts";
import { CheckpointRegistry } from "./supabase/functions/analyze-repository/orchestrator/registry/CheckpointRegistry.ts";

const snippet = `function verifyUserToken(token) {
  // Implementation delegated to external C++ binding
  return nativeAuth.verify(token);
}`;

const pkg = {
  repository: "local_user/paste_snippet",
  prNumber: 0,
  commitSha: "local",
  changedFiles: [{ path: "snippet.js", content: snippet, deleted: false }],
  dependencies: [],
  metadata: {}
};

async function trace() {
  const router = new CheckpointRouter();
  const selected = router.route(pkg as any);
  console.log("Selected Checkpoints:");
  selected.forEach(s => console.log(s.id));
}

trace();
