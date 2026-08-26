import { Eval } from "braintrust";

const cases = [
  {
    id: "tc_001",
    snippet: "console.log('hello');",
    expected: { verdict: "PASS" }
  }
];

Eval("Code Vibe Smoke Test", {
  data: cases,
  task: async (input) => {
    console.log("RECEIVED INPUT:", input);
    return { verdict: "PASS" };
  },
  scores: []
});
