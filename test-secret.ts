import { PatternRegistry } from "./supabase/functions/analyze-repository/services/PatternRegistry.ts";

const registry = new PatternRegistry();
const content = `const API_KEY = "sk_live_TEST_SECRET_123456789";`;

console.log("Enabled patterns:");
for (const pattern of registry.getEnabledPatterns()) {
  pattern.regex.lastIndex = 0;
  let match;
  while ((match = pattern.regex.exec(content)) !== null) {
    console.log(`Matched ${pattern.id}: ${match[0]}`);
  }
}
