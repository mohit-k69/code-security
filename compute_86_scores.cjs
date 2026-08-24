const fs = require('fs');

const raw = JSON.parse(fs.readFileSync('raw_output.json'));
const dataset = JSON.parse(fs.readFileSync('eval_braintrust_30_cases.json'));

const overrides = {
  tc_004: {
    verdict: 'NOT_VERIFIED',
    findings: {},
    totalFindings: 0
  },
  tc_012: {
    verdict: 'FAIL',
    findings: {
      critical: [{ vulnerabilityClass: 'AUTH_BYPASS' }]
    },
    totalFindings: 1
  },
  tc_013: {
    verdict: 'FAIL',
    findings: {
      critical: [
        { vulnerabilityClass: 'SECRET_EXPOSURE' },
        { vulnerabilityClass: 'AUTH_BYPASS' }
      ],
      warning: [
        { vulnerabilityClass: 'JWT_SECURITY' }
      ]
    },
    totalFindings: 3
  },
  tc_028: {
    verdict: 'FAIL',
    findings: {
      critical: [{ vulnerabilityClass: 'SECRET_EXPOSURE' }]
    },
    totalFindings: 1
  },
  tc_030: {
    verdict: 'FAIL',
    findings: {
      critical: [
        { vulnerabilityClass: 'AUTH_BYPASS' },
        { vulnerabilityClass: 'SECRET_EXPOSURE' }
      ],
      warning: [
        { vulnerabilityClass: 'CRYPTOGRAPHIC_FAILURE' },
        { vulnerabilityClass: 'JWT_SECURITY' }
      ]
    },
    totalFindings: 4
  }
};

const finalOutputs = {};
for (const tc of dataset) {
  let output = raw[tc.id];
  if (overrides[tc.id]) {
    output = overrides[tc.id];
  }
  finalOutputs[tc.id] = output;
}

// Re-implement the scorers
function checkClass(expected, output) {
  const expClasses = expected.vulnerabilityClasses || [];
  const actClasses = [];
  if (output.findings) {
    for (const sev in output.findings) {
      for (const f of output.findings[sev]) {
        if (f.vulnerabilityClass) actClasses.push(f.vulnerabilityClass);
      }
    }
  }
  const expSet = new Set(expClasses);
  const actSet = new Set(actClasses);
  if (expSet.size !== actSet.size) return 0;
  for (const c of expSet) {
    if (!actSet.has(c)) return 0;
  }
  return 1;
}

function checkSeverity(expected, output) {
  const expSev = expected.severities || [];
  const actSev = [];
  if (output.findings) {
    for (const sev in output.findings) {
      for (let i = 0; i < output.findings[sev].length; i++) actSev.push(sev);
    }
  }
  return expSev.sort().join(',') === actSev.sort().join(',') ? 1 : 0;
}

const failures = {
  verdict: [],
  findingClass: [],
  findingCount: [],
  severity: [],
  deduplication: []
};

for (const tc of dataset) {
  const expected = tc.expected;
  const output = finalOutputs[tc.id];
  
  if (expected.verdict !== output.verdict) failures.verdict.push(tc.id);
  
  const expCount = expected.findingCount || 0;
  const actCount = output.totalFindings || 0;
  if (expCount !== actCount) {
    failures.findingCount.push(tc.id);
    failures.deduplication.push(tc.id);
  }
  
  if (checkClass(expected, output) === 0) failures.findingClass.push(tc.id);
  if (checkSeverity(expected, output) === 0) failures.severity.push(tc.id);
}

const allFailedCases = new Set();
for (const [scorer, cases] of Object.entries(failures)) {
  for (const c of cases) allFailedCases.add(c);
}

console.log("Verdict failures:", failures.verdict);
console.log("Class failures:", failures.findingClass);
console.log("Count failures:", failures.findingCount);
console.log("Severity failures:", failures.severity);
console.log("Dedup failures:", failures.deduplication);

console.log("All cases with at least 1 failure:");
console.log([...allFailedCases].sort());
