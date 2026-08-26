import { localCodeVibeTask } from "../local_eval_task.ts";
import { ReviewOrchestrator } from "../supabase/functions/analyze-repository/orchestrator/ReviewOrchestrator.ts";
import { OpenRouterProvider } from "../supabase/functions/analyze-repository/orchestrator/providers/OpenRouterProvider.ts";
import { PatternRegistry } from "../supabase/functions/analyze-repository/services/PatternRegistry.ts";
import { SensitiveDataDetector } from "../supabase/functions/analyze-repository/services/SensitiveDataDetector.ts";
import { ContextManager } from "../supabase/functions/analyze-repository/services/ContextManager.ts";

const mismatches = [
  "tc_012", "tc_013", "tc_015", "tc_031", "tc_032", "tc_033", "tc_037", "tc_038",
  "tc_040", "tc_041", "tc_042", "tc_043", "tc_044", "tc_047", "tc_048", "tc_052",
  "tc_063", "tc_065", "tc_069", "tc_074", "tc_075", "tc_076", "tc_077", "tc_079",
  "tc_080", "tc_085", "tc_086", "tc_087", "tc_089", "tc_091", "tc_092", "tc_093",
  "tc_098", "tc_100"
];

const data = JSON.parse(await Deno.readTextFile("../eval_braintrust_100_cases.json"));
const targetCases = data.filter((tc: any) => mismatches.includes(tc.id));

async function run() {
  for (const tc of targetCases) {
    console.log(`\n============================`);
    console.log(`CASE: ${tc.id}`);
    console.log(`EXPECTED: ${JSON.stringify(tc.expected)}`);

    // We override executeCheckpoints via a mock so we can capture raw findings
    const llmProvider = new OpenRouterProvider(Deno.env.get("STANDARD_MODEL") || "");
    const orchestrator = new ReviewOrchestrator({ 
      provider: llmProvider,
      models: {
        standard: Deno.env.get("STANDARD_MODEL") || "",
        major: Deno.env.get("MAJOR_MODEL") || ""
      }
    });

    // Monkey-patch executeCheckpoints to capture raw results
    const originalExecute = orchestrator["executeCheckpoints"].bind(orchestrator);
    let rawResults: any = null;
    orchestrator["executeCheckpoints"] = async (checkpoints, sanitizedPackage) => {
      rawResults = await originalExecute(checkpoints, sanitizedPackage);
      return rawResults;
    };

    const contextPackage = {
      repository: `local_user/paste_snippet`,
      prNumber: 0,
      commitSha: 'local',
      changedFiles: [{ path: "snippet.js", content: tc.snippet, deleted: false }],
      dependencies: [],
      missingDependencies: [],
      metadata: { totalFiles: 1, totalChars: tc.snippet.length, truncated: false }
    };

    const patternRegistry = new PatternRegistry();
    const detector = new SensitiveDataDetector(patternRegistry);
    const detectionResult = detector.detect(contextPackage);
    const contextManager = new ContextManager();
    const sanitizedPackage = contextManager.sanitize(contextPackage, detectionResult);

    try {
      const executionResult = await orchestrator.review(sanitizedPackage);
      
      console.log(`\nACTUAL VERDICT: ${executionResult.report.verdict}`);
      
      console.log(`\nCHECKPOINTS RUN:`);
      const executed = executionResult.report.checkpoints.filter((c: any) => c.status === "completed" && c.applicability !== "NOT_APPLICABLE");
      executed.forEach((c: any) => console.log(` - ${c.checkpointId} (Count: ${c.findingCount}, Verdict: ${c.verdict})`));
      
      console.log(`\nRAW FINDINGS BEFORE AGGREGATION:`);
      if (rawResults) {
        for (const res of rawResults) {
          if (res.findings && res.findings.length > 0) {
            console.log(`\n--- ${res.checkpointId} ---`);
            res.findings.forEach((f: any) => {
              console.log(`Class: ${f.vulnerabilityClass}`);
              console.log(`Severity: ${f.severity}`);
              console.log(`Title: ${f.title}`);
              console.log(`Description: ${f.description}`);
              console.log(`Location: ${f.primaryLocation.path}:${f.primaryLocation.line} - ${f.primaryLocation.snippet}`);
            });
          }
        }
      }

      console.log(`\nAGGREGATED FINDINGS:`);
      const allAgg = [...executionResult.report.findings.critical, ...executionResult.report.findings.warning, ...executionResult.report.findings.info];
      allAgg.forEach((f: any) => {
        console.log(`Class: ${f.vulnerabilityClass}`);
        console.log(`Severity: ${f.severity}`);
        console.log(`Contributing: ${f.contributingCheckpoints.join(", ")}`);
        console.log(`Description: ${f.description}`);
      });
      
    } catch (e: any) {
      console.log("Error:", e.message);
    }
  }
}

run();
