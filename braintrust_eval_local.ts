import { Eval, initDataset } from "braintrust";
import { findingCountAccuracy, findingClassAccuracy, severityAccuracy, deduplicationAccuracy, verdictAccuracy } from "./braintrust_scorers.ts";
import { localCodeVibeTask } from "./local_eval_task.ts";

import cases from "./eval_braintrust_100_cases.json" with { type: "json" };

Eval("Code Vibe Local Evaluation", {
  data: cases.map((c: any) => ({
    input: { snippet: c.snippet },
    expected: c.expected,
    metadata: { id: c.id, category: c.category, tags: c.tags, rationale: c.rationale }
  })),
  task: localCodeVibeTask,
  scores: [verdictAccuracy, findingClassAccuracy, findingCountAccuracy, severityAccuracy, deduplicationAccuracy],
  maxConcurrency: 2,
});
