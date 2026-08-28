import { localCodeVibeTask as codeVibeTask } from "./local_eval_task.ts";
import fs from "fs";

const data = JSON.parse(fs.readFileSync("./eval_braintrust_100_cases.json", "utf-8"));
const targetIds = ['tc_023', 'tc_024', 'tc_025', 'tc_026', 'tc_083', 'tc_084', 'tc_087', 'tc_088'];

async function main() {
  for (const id of targetIds) {
    const tc = data.find((t: any) => t.id === id);
    if (!tc) continue;
    
    // We need to capture the raw checkpoint results before ReportGenerator aggregates them,
    // but codeVibeTask only returns the final report.
    // However, the report contains `checkpoints: CheckpointSummary[]` !
    const output = await codeVibeTask(tc.snippet);
    
    const summaries = output.checkpoints || [];
    
    // Let's grab the first one that triggered NOT_VERIFIED, or just the first one
    let targetCp = summaries.find((s: any) => s.verdict === "NOT_VERIFIED");
    if (!targetCp && summaries.length > 0) targetCp = summaries[0];
    
    const actualApplicability = targetCp ? targetCp.applicability : "UNKNOWN";
    
    // Also, checking if opaque rule triggered is implied by the verdict and applicability for Paste Code.
    // If NOT_VERIFIED + APPLICABLE, the rule worked as instructed.
    const ruleTriggered = actualApplicability === "APPLICABLE" && output.verdict === "NOT_VERIFIED";
    
    console.log(`\nCase: ${id}`);
    console.log(`Expected Verdict: ${tc.expected.verdict}`);
    console.log(`Actual Verdict: ${output.verdict}`);
    console.log(`Expected Applicability: N/A (benchmark json doesn't specify)`);
    console.log(`Actual Applicability: ${actualApplicability}`);
    console.log(`Opaque Rule Triggered: ${ruleTriggered ? "YES" : "NO"}`);
  }
}

main().catch(console.error);
