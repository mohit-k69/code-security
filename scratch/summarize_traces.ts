const traces = JSON.parse(await Deno.readTextFile("forensic_traces.json"));

for (const trace of traces) {
  console.log(`\n### Case: ${trace.id}`);
  console.log(`- **Expected**: Verdict=${trace.expected.verdict}, Count=${trace.expected.findingCount}, Classes=[${trace.expected.vulnerabilityClasses.join(", ")}]`);
  console.log(`- **Actual**: Verdict=${trace.actualVerdict}`);
  
  const allAgg = [];
  if (trace.aggregatedFindings) {
    allAgg.push(...(trace.aggregatedFindings.critical || []));
    allAgg.push(...(trace.aggregatedFindings.warning || []));
    allAgg.push(...(trace.aggregatedFindings.info || []));
  }
  
  console.log(`- **Actual Findings (Aggregated)**: ${allAgg.length}`);
  allAgg.forEach((f: any) => {
    console.log(`  - ${f.vulnerabilityClass}: ${f.title}`);
  });

  const rawFindings = [];
  if (trace.rawResults) {
    for (const res of trace.rawResults) {
      if (res.findings && res.findings.length > 0) {
        rawFindings.push(...res.findings.map(f => ({ cp: res.checkpointId, class: f.vulnerabilityClass, title: f.title })));
      }
    }
  }
  
  console.log(`- **Raw Checkpoint Findings**: ${rawFindings.length}`);
  rawFindings.forEach((f: any) => {
    console.log(`  - [${f.cp}] ${f.class}: ${f.title}`);
  });
}
