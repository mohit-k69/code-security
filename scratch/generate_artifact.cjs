const fs = require('fs');

const data = JSON.parse(fs.readFileSync('/Users/mohitkaushal/Desktop/code-security/scratch/failure_trace.json', 'utf8'));

const clusters = [
  {
    name: "Aggregator overriding FAIL with NOT_VERIFIED",
    predicate: c => c.actualVerdict === 'NOT_VERIFIED' && c.finalFindings.length > 0,
    type: "aggregation",
    checkpoint: "FindingAggregator",
    rule: "Aggregator verdict precedence logic",
    issue: "aggregation problem",
    fix: "If findings > 0, verdict MUST be FAIL regardless of individual checkpoint NOT_VERIFIED statuses.",
    risk: "Low",
    regression: "None"
  },
  {
    name: "Severity Mismatch",
    predicate: c => c.expMetrics.severityScore === 0 && c.expMetrics.classScore === 1,
    type: "severity",
    checkpoint: "ReviewOrchestrator / Models",
    rule: "Severity assignment",
    issue: "genuine model limitation",
    fix: "Enhance severity definitions in the prompt JSON schema to prevent models from downgrading critical flaws.",
    risk: "Low",
    regression: "tc_030"
  },
  {
    name: "False Positive: Over-flagging standard usage",
    predicate: c => c.expected.verdict === 'PASS' && (c.actualVerdict === 'FAIL' || c.finalFindings.length > 0) && !c.checkpoints.some(cp => cp.verdict === 'NOT_VERIFIED'),
    type: "false positive",
    checkpoint: "SEC-FILE-001, SEC-AUTH-001, etc.",
    rule: "Strict validation heuristics",
    issue: "genuine model limitation / specification gap",
    fix: "Enhance checkpoint prompts with 'Safe Usage Patterns' to instruct the model to ignore standard/benign frameworks unless explicit misconfiguration is found.",
    risk: "Medium",
    regression: "tc_012, tc_013"
  },
  {
    name: "False Negative: Missed Vulnerabilities",
    predicate: c => c.expected.verdict === 'FAIL' && c.actualVerdict === 'PASS',
    type: "detection",
    checkpoint: "Various",
    rule: "Vulnerability detection logic",
    issue: "genuine model limitation",
    fix: "Provide more concrete examples of complex/indirect vulnerabilities in the system prompt.",
    risk: "Medium",
    regression: "Could increase false positives across clean baseline cases."
  },
  {
    name: "False NOT_VERIFIED (Context too small)",
    predicate: c => c.actualVerdict === 'NOT_VERIFIED' && c.finalFindings.length === 0,
    type: "NOT_VERIFIED routing",
    checkpoint: "ReviewOrchestrator / Models",
    rule: "Context sufficiency threshold",
    issue: "genuine model limitation",
    fix: "Relax the context requirement or instruct models to assume necessary imports exist if standard library/framework signatures are used.",
    risk: "High",
    regression: "tc_021, tc_022, tc_023"
  },
  {
    name: "Multi-finding Deduplication Failure / Over-reporting",
    predicate: c => c.expected.findingCount < c.finalFindings.length && c.actualVerdict === 'FAIL',
    type: "deduplication",
    checkpoint: "FindingGuardrail / Aggregator",
    rule: "Deduplication similarity threshold",
    issue: "aggregation problem",
    fix: "Strengthen the finding deduplication logic. Group findings by line number + vulnerability class.",
    risk: "Low",
    regression: "tc_030"
  },
  {
    name: "Under-reporting (Missed Partial Findings)",
    predicate: c => c.expected.findingCount > c.finalFindings.length && c.actualVerdict === 'FAIL',
    type: "multi-finding",
    checkpoint: "ReviewOrchestrator",
    rule: "Finding extraction",
    issue: "genuine model limitation",
    fix: "Add prompt logic enforcing exhaustive reporting of ALL vulnerability instances.",
    risk: "Low",
    regression: "None"
  },
  {
    name: "Misclassification of Vulnerability",
    predicate: c => c.expMetrics.classScore < 1 && c.expMetrics.verdictScore === 1,
    type: "vulnerability-class mapping",
    checkpoint: "Model Mapping",
    rule: "Enum definitions",
    issue: "genuine model limitation",
    fix: "Provide clearer boundaries between overlapping classes (e.g., AUTH_BYPASS vs BUSINESS_LOGIC_FLAW) in the JSON schema descriptions.",
    risk: "Medium",
    regression: "tc_007, tc_015"
  }
];

let unmatched = [...data];
const resultClusters = [];

for (const cl of clusters) {
  const matches = unmatched.filter(cl.predicate);
  if (matches.length > 0) {
    resultClusters.push({ ...cl, cases: matches, count: matches.length });
    unmatched = unmatched.filter(c => !cl.predicate(c));
  }
}

if (unmatched.length > 0) {
  resultClusters.push({
    name: "Other / Uncategorized",
    cases: unmatched,
    count: unmatched.length,
    type: "mixed",
    checkpoint: "Unknown",
    rule: "Various",
    issue: "Unknown",
    fix: "Manual investigation required",
    risk: "Unknown",
    regression: "Unknown"
  });
}

// Sort by count
resultClusters.sort((a, b) => b.count - a.count);

let md = "# Failure Analysis Report\n\n";
md += "## Exact number of affected cases\n";
md += `**Total Mismatching Cases:** ${data.length} out of 100\n\n`;

md += "## Root-Cause Clusters (Ranked by Impact)\n\n";
md += "| Root-Cause Cluster | Case IDs | Count | Failure Type | Checkpoint/Spec | Prompt/Code Rule | Issue Category | Proposed General Fix | Overfitting Risk | Regression Risk (30-case baseline) |\n";
md += "|---|---|---|---|---|---|---|---|---|---|\n";

resultClusters.forEach(cl => {
  const ids = cl.cases.map(c => c.id).join(', ');
  md += `| **${cl.name}** | ${ids} | ${cl.count} | ${cl.type} | ${cl.checkpoint} | ${cl.rule} | ${cl.issue} | ${cl.fix} | ${cl.risk} | ${cl.regression} |\n`;
});

md += "\n## Top Systemic Fixes to Improve Generalization\n\n";
md += "1. **Aggregator Verdict Precedence (Aggregation Problem):** Fix the aggregator logic so that if `findings.length > 0`, the final verdict is `FAIL`, regardless of any checkpoints returning `NOT_VERIFIED`. Currently, some findings are dropped or the overall status is corrupted if one checkpoint bails out.\n";
md += "2. **Relax NOT_VERIFIED Threshold (Genuine Model Limitation):** Update the base prompt to instruct the model to assume standard dependencies are correctly imported (e.g., `express`, `bcrypt`) rather than instantly bailing out to `NOT_VERIFIED` due to missing partial context.\n";
md += "3. **Strengthen Deduplication (Aggregation Problem):** Implement a strict line-based deduplication in `FindingGuardrail` or `ReviewOrchestrator` to collapse duplicate findings of the same class on the same line into a single finding.\n";
md += "4. **Clarify Class Boundaries (Specification Gap):** Add explicit prompt instructions separating `AUTH_BYPASS` vs `BUSINESS_LOGIC_FLAW`, and `INSECURE_CONFIGURATION` vs `INPUT_VALIDATION` to prevent misclassification.\n";
md += "5. **Enhance Severity Guidance (Genuine Model Limitation):** Add explicit definitions for severity levels to prevent the model from inappropriately downgrading high-impact vulnerabilities.\n\n";

md += "## Expected Regression Risk to the Original 30 Cases\n";
md += "The structural fixes (Aggregator precedence, Deduplication) pose **zero risk** to the original 30 cases, as they correct orchestration bugs. The prompt-based fixes (relaxing NOT_VERIFIED) pose a **High risk** to cases `tc_021`, `tc_022`, and `tc_023` (which strictly enforce NOT_VERIFIED for missing contexts). Tuning this threshold carefully is critical.\n\n";

md += "## Which fixes should be tested first\n";
md += "1. **Aggregator Verdict Precedence** (Pure code fix, high impact, zero risk).\n";
md += "2. **Line-based Deduplication** (Pure code fix, moderate impact, low risk).\n";

fs.writeFileSync('/Users/mohitkaushal/Desktop/code-security/scratch/failure_analysis.md', md);
