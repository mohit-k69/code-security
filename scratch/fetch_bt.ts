import { writeFileSync } from "node:fs";
const API_KEY = process.env.BRAINTRUST_API_KEY;
if (!API_KEY) {
  console.error("Missing BRAINTRUST_API_KEY in environment");
  process.exit(1);
}
async function run() {
  const res = await fetch("https://api.braintrust.dev/v1/experiment?project_name=Code%20Vibe%20Local%20Evaluation", {
    headers: { "Authorization": `Bearer ${API_KEY}` }
  });
  if (!res.ok) {
    console.error("Failed", res.status, await res.text());
    return;
  }
  const data = await res.json();
  const experiments = data.objects || [];
  console.log(`Found ${experiments.length} experiments.`);
  
  if (experiments.length > 0) {
    experiments.sort((a: any, b: any) => new Date(b.created).getTime() - new Date(a.created).getTime());
    const latestExp = experiments[0];
    console.log(`Fetching latest experiment: ${latestExp.name} (${latestExp.id})`);
    const expId = latestExp.id;
    const fetchRes = await fetch(`https://api.braintrust.dev/v1/experiment/${expId}/fetch?limit=100`, {
       method: "POST",
       headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
       body: JSON.stringify({})
    });
    if (fetchRes.ok) {
       const events = await fetchRes.json();
       writeFileSync("scratch/events.json", JSON.stringify(events, null, 2));
       console.log("Wrote scratch/events.json");
    } else {
       console.error("Events failed", fetchRes.status, await fetchRes.text());
    }
  }
}
run();
