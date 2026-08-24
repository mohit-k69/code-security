import { initDataset } from "braintrust";
import * as dotenv from "dotenv";
dotenv.config();

async function run() {
  const dataset = initDataset("Code Vibe", { dataset: "Eval Braintrust 30 Cases Direct" });
  for await (const record of dataset) {
    console.log(JSON.stringify(record, null, 2));
    break;
  }
}

run().catch(console.error);
