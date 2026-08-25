import { Eval, initDataset } from "braintrust";
import { findingCountAccuracy, findingClassAccuracy, severityAccuracy, deduplicationAccuracy, verdictAccuracy } from "./braintrust_scorers.ts";
import { localCodeVibeTask } from "./local_eval_task.ts";

Eval("Code Vibe Local Evaluation", {
  data: (() => initDataset("Code Vibe", { dataset: "Eval Braintrust 30 Cases Direct" })) as any,
  task: localCodeVibeTask,
  scores: [verdictAccuracy, findingClassAccuracy, findingCountAccuracy, severityAccuracy, deduplicationAccuracy],
  maxConcurrency: 2,
});
