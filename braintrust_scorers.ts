export function findingCountAccuracy(args: any) {
  const expectedCount = args.expected?.["expected.findingCount"] ?? args.expected?.findingCount ?? 0;
  const actualCount = args.output?.totalFindings ?? 0;
  return expectedCount === actualCount ? 1 : 0;
}

export function findingClassAccuracy(args: any) {
  const expectedClasses = args.expected?.["expected.vulnerabilityClasses"] || args.expected?.vulnerabilityClasses || [];
  
  // Extract actual vulnerability classes from output findings
  const actualClasses: string[] = [];
  if (args.output?.findings) {
    for (const severity of Object.keys(args.output.findings)) {
      for (const finding of args.output.findings[severity]) {
        if (finding.vulnerabilityClass) {
          actualClasses.push(finding.vulnerabilityClass);
        }
      }
    }
  }
  
  // Basic set equality
  const expectedSet = new Set(expectedClasses);
  const actualSet = new Set(actualClasses);
  if (expectedSet.size !== actualSet.size) return 0;
  for (const c of expectedSet) {
    if (!actualSet.has(c)) return 0;
  }
  return 1;
}

export function severityAccuracy(args: any) {
  const expectedSeverities = args.expected?.["expected.severities"] || args.expected?.severities || [];
  
  const actualSeverities: string[] = [];
  if (args.output?.findings) {
    for (const severity of Object.keys(args.output.findings)) {
      const count = args.output.findings[severity].length;
      for (let i = 0; i < count; i++) {
        actualSeverities.push(severity);
      }
    }
  }
  
  const expectedStr = [...expectedSeverities].sort().join(",");
  const actualStr = [...actualSeverities].sort().join(",");
  return expectedStr === actualStr ? 1 : 0;
}

export function deduplicationAccuracy(args: any) {
  const expectedCount = args.expected?.["expected.findingCount"] ?? args.expected?.findingCount ?? 0;
  const actualCount = args.output?.totalFindings ?? 0;
  return expectedCount === actualCount ? 1 : 0;
}

export function verdictAccuracy(args: any) {
  const expectedVerdict = args.expected?.["expected.verdict"] ?? args.expected?.verdict;
  const actualVerdict = args.output?.verdict;
  return expectedVerdict === actualVerdict ? 1 : 0;
}
