const crypto = require('crypto');

const hashesToMatch = [
  "97279ba6f4f3543138530c2b7f96941463250eb9269fda2a3257f104ac875b88",
  "65a8fc1dec61133fd5143dec3409f83aaab3fba7ddcdf693271252ecee903308"
];

const candidates = [
  "google/gemini-3.1-pro",
  "google/gemini-3.1-flash",
  "google/gemini-3.1-flash-lite",
  "openai/gpt-5.6-luna",
  "openai/gpt-4o",
  "anthropic/claude-3-5-sonnet",
  "google/gemini-1.5-pro",
  "google/gemini-1.5-flash",
];

for (const candidate of candidates) {
  const hash = crypto.createHash('sha256').update(candidate).digest('hex');
  if (hashesToMatch.includes(hash)) {
    console.log(`Matched: ${candidate} -> ${hash}`);
  }
}
