import { FindingAggregator } from "./supabase/functions/analyze-repository/orchestrator/aggregator/FindingAggregator.ts";

const aggregator = new FindingAggregator();
const results: any[] = [
  {
    checkpointId: "SEC-AUTHZ-001",
    confidence: 0.99,
    findings: [
      {
        criterionId: "AUTHZ-C1",
        vulnerabilityClass: "BUSINESS_LOGIC_FLAW",
        cwes: ["CWE-639"],
        primaryLocation: { file: "snippet.js", line: 2 },
        severity: "critical"
      },
      {
        criterionId: "AUTHZ-C3",
        vulnerabilityClass: "AUTH_BYPASS",
        cwes: ["CWE-862"],
        primaryLocation: { file: "snippet.js", line: 1 },
        severity: "critical"
      },
      {
        criterionId: "AUTHZ-C6",
        vulnerabilityClass: "BUSINESS_LOGIC_FLAW",
        cwes: ["CWE-862"],
        primaryLocation: { file: "snippet.js", line: 2 },
        severity: "critical"
      }
    ]
  }
];

const agg = aggregator.aggregate(results);
console.log(JSON.stringify(agg, null, 2));
console.log("Length:", agg.length);
