import { Eval } from "braintrust";

Eval("Code Vibe Local Evaluation", {
  data: [{ input: "test", expected: "test" }],
  task: async (input) => {
    console.log("=> OPENROUTER_API_KEY IS:", !!process.env.OPENROUTER_API_KEY);
    return input;
  },
  scores: [],
});
