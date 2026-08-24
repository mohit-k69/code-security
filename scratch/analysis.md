# Braintrust Experiment Analysis (testing-1787587124)

| Case ID | Expected Verdict | Actual Verdict | Expected Classes | Actual Classes | Exp Count | Act Count | Exp Severity | Act Severity | Failed Scorers | Likely Root Cause Layer |
|---|---|---|---|---|---|---|---|---|---|---|
| tc_003 | PASS | NOT_VERIFIED |  | BUSINESS_LOGIC_FLAW | 0 | 1 |  | warning | deduplicationAccuracy, severityAccuracy, findingCountAccuracy, findingClassAccuracy, verdictAccuracy | Aggregator (Deduplication failure) |
| tc_004 | PASS | NOT_VERIFIED |  |  | 0 | 0 |  |  | verdictAccuracy | Model/Prompt (False Positive / Hallucination) |
| tc_010 | PASS | FAIL |  | SECRET_EXPOSURE | 0 | 1 |  | critical | deduplicationAccuracy, severityAccuracy, findingCountAccuracy, findingClassAccuracy, verdictAccuracy | Aggregator (Deduplication failure) |
| tc_012 | FAIL | FAIL | BUSINESS_LOGIC_FLAW | AUTH_BYPASS | 1 | 1 | critical | critical | findingClassAccuracy | Model/Prompt (Taxonomy mapping) |
| tc_013 | FAIL | FAIL | AUTH_BYPASS, SECRET_EXPOSURE, JWT_SECURITY | AUTH_BYPASS, SECRET_EXPOSURE | 3 | 2 | critical, critical, warning | critical, critical | deduplicationAccuracy, severityAccuracy, findingCountAccuracy, findingClassAccuracy | Model/Prompt (Taxonomy mapping) |
| tc_014 | FAIL | FAIL | CRYPTOGRAPHIC_FAILURE | CRYPTOGRAPHIC_FAILURE | 1 | 1 | critical | warning | severityAccuracy | Model/Prompt (Severity assessment) |
| tc_015 | FAIL | FAIL | INSECURE_CONFIGURATION | INSECURE_CONFIGURATION | 1 | 1 | critical | warning | severityAccuracy | Model/Prompt (Severity assessment) |
| tc_030 | FAIL | FAIL | CRYPTOGRAPHIC_FAILURE, AUTH_BYPASS, JWT_SECURITY, SECRET_EXPOSURE | AUTH_BYPASS, SECRET_EXPOSURE, CRYPTOGRAPHIC_FAILURE | 4 | 3 | critical, critical, warning, critical | critical, critical, warning | deduplicationAccuracy, severityAccuracy, findingCountAccuracy, findingClassAccuracy | Model/Prompt (Taxonomy mapping) |

## Top 3 Highest-Impact Problems

1. **Model/Prompt (Taxonomy mapping)**: 3 failed cases
2. **Aggregator (Deduplication failure)**: 2 failed cases
3. **Model/Prompt (Severity assessment)**: 2 failed cases
