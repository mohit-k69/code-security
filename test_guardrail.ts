const combinedEvidenceSnippet = "const API_KEY = <REDACTED_STRIPE_SECRET_KEY>;";
const combinedText = "title description";
const isQueryingOrReturningUserData = /(SELECT.*(ssn|password_hash|email|phone|address|user)|db\.\w+\.find|res\.(json|send).*(user|profile|data)|req\.(body|params|query))/i.test(combinedEvidenceSnippet) ||
                                      /\b(ssn|social security|personal data|pii|user profile|password_hash|email address)\b/i.test(combinedText);
const isActualHardcodedSecret = /=\s*['"][a-zA-Z0-9_\-\.\/+=]{8,}['"]/i.test(combinedEvidenceSnippet) ||
                                /(AKIA[0-9A-Z]{16}|sk_live_[0-9a-zA-Z]+|ghp_[0-9a-zA-Z]+|-----BEGIN [A-Z ]*PRIVATE KEY-----)/.test(combinedEvidenceSnippet) ||
                                /(mongodb(\+srv)?|postgres(ql)?|mysql|redis):\/\/[^\s'"]+:[^\s'"]+@/i.test(combinedEvidenceSnippet);
console.log({ isQueryingOrReturningUserData, isActualHardcodedSecret });
