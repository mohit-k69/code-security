import * as fs from 'fs';

const path = 'supabase/functions/analyze-repository/evals/datasets/AuthenticationEvalDataset.ts';
let code = fs.readFileSync(path, 'utf8');

// The tests to remove start from id: "AUTH-FAIL-13" to the end of AUTH-FAIL-15.
// We can just find the blocks using regex or substring replacement.

const fail13Start = code.indexOf(`    {\n      id: "AUTH-FAIL-13",`);
const pass04Start = code.indexOf(`    {\n      id: "AUTH-PASS-04",`);

if (fail13Start !== -1 && pass04Start !== -1) {
  code = code.substring(0, fail13Start) + code.substring(pass04Start);
  fs.writeFileSync(path, code);
  console.log("Successfully removed overlapping eval scenarios.");
} else {
  console.log("Could not find the test blocks to remove.");
}
