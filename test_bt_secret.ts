import { Eval } from "braintrust";

Eval("Test Secret", {
  data: [{ input: "test" }],
  task: async (input) => {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error("Key missing from process.env");
    return key.substring(0, 5) + "...";
  },
  scores: []
});
