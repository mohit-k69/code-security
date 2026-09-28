const syntheticMarkers = ["EXAMPLE", "FAKE", "MOCK", "DUMMY", "PLACEHOLDER", "TEST-ONLY", "DO-NOT-USE", "***REDACTED***"];
const matchedValue = "sk_live_TEST_SECRET_123456789";
const upperValue = matchedValue.toUpperCase();
const isSynthetic = syntheticMarkers.some(marker => upperValue.includes(marker));
console.log({ upperValue, isSynthetic });
