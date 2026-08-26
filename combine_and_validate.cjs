const fs = require('fs');

try {
  const original30 = JSON.parse(fs.readFileSync('eval_braintrust_30_cases.json', 'utf8'));
  const new70 = JSON.parse(fs.readFileSync('eval_braintrust_70_new_cases.json', 'utf8'));

  const combined = [...original30, ...new70];

  let errors = [];

  // Validate exactly 100 cases
  if (combined.length !== 100) {
    errors.push(`Expected 100 cases, found ${combined.length}`);
  }

  // Validate IDs tc_001 through tc_100
  const expectedIds = Array.from({ length: 100 }, (_, i) => `tc_${String(i + 1).padStart(3, '0')}`);
  const actualIds = combined.map(c => c.id);
  
  const missingIds = expectedIds.filter(id => !actualIds.includes(id));
  if (missingIds.length > 0) {
    errors.push(`Missing IDs: ${missingIds.join(', ')}`);
  }

  // Check for duplicates
  const idCounts = {};
  actualIds.forEach(id => idCounts[id] = (idCounts[id] || 0) + 1);
  const duplicateIds = Object.keys(idCounts).filter(id => idCounts[id] > 1);
  if (duplicateIds.length > 0) {
    errors.push(`Duplicate IDs: ${duplicateIds.join(', ')}`);
  }

  // Validate Schema
  const validVerdicts = ['PASS', 'FAIL', 'NOT_VERIFIED'];
  const validSeverities = ['critical', 'warning', 'info']; 
  const validClasses = [
    'SECRET_EXPOSURE', 'AUTH_BYPASS', 'AUTHORIZATION_FAILURE', 'BUSINESS_LOGIC_FLAW', 'JWT_SECURITY', 
    'INSECURE_CONFIGURATION', 'PATH_TRAVERSAL', 'CRYPTOGRAPHIC_FAILURE', 
    'INPUT_VALIDATION', 'XSS', 'SQL_INJECTION' // Assuming these are valid from previous audit
  ];

  combined.forEach(c => {
    if (!c.id || !c.category || !c.snippet || !c.expected) {
      errors.push(`Missing required fields in ${c.id}`);
    }
    const exp = c.expected;
    if (!validVerdicts.includes(exp.verdict)) {
      errors.push(`Invalid verdict ${exp.verdict} in ${c.id}`);
    }
    if (exp.verdict === 'FAIL') {
      if (!Array.isArray(exp.vulnerabilityClasses) || !Array.isArray(exp.severities) || typeof exp.findingCount !== 'number') {
        errors.push(`Invalid FAIL structure in ${c.id}`);
      }
      exp.vulnerabilityClasses.forEach(vc => {
        if (!validClasses.includes(vc)) {
          errors.push(`Unsupported vulnerability class ${vc} in ${c.id}`);
        }
      });
      exp.severities.forEach(s => {
        if (!validSeverities.includes(s)) {
          errors.push(`Unsupported severity ${s} in ${c.id}`);
        }
      });
      if (exp.vulnerabilityClasses.length !== exp.findingCount || exp.severities.length !== exp.findingCount) {
        errors.push(`Mismatch between findingCount and arrays in ${c.id}`);
      }
    }
  });

  if (errors.length > 0) {
    console.error("VALIDATION FAILED:");
    errors.forEach(e => console.error(e));
    process.exit(1);
  }

  fs.writeFileSync('eval_braintrust_100_cases.json', JSON.stringify(combined, null, 2));
  console.log("Validation passed! Successfully wrote eval_braintrust_100_cases.json");

} catch (e) {
  console.error("Error during execution:", e);
  process.exit(1);
}
