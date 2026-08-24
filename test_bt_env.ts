import { Eval } from "braintrust";
Eval("Test Env", {
  data: [{ input: "test" }],
  task: async (input) => {
    try {
      return Deno.env.get("USER");
    } catch (e: any) {
      throw new Error("Caught error: " + e.message + "\n" + e.stack);
    }
  },
  scores: []
});
