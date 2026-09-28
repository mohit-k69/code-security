const content = `const API_KEY = "sk_live_TEST_SECRET_123456789";`;

const stripeRegex = /sk_(live|test)_[0-9a-zA-Z_\-]{14,}/g;
const genericRegex = /(?<=(?:api_key|apikey|api-key|secret_key|secretkey|secret-key|auth_token|access_token|private_token)\s*[:=]\s*["'])(?:[a-zA-Z0-9_\-\.]{16,})(?=["'])/gi;

let match;
stripeRegex.lastIndex = 0;
while ((match = stripeRegex.exec(content)) !== null) {
  console.log("Stripe Match:", match[0]);
}

genericRegex.lastIndex = 0;
while ((match = genericRegex.exec(content)) !== null) {
  console.log("Generic Match:", match[0]);
}
