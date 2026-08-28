import { Eval } from "braintrust";

Eval("Test Secret", {
  data: [{ input: "test" }],
  task: async (input) => {
    console.log("ENV KEYS:", Object.keys(process.env).join(", "));
    return "done";
  },
  scores: []
});
