### Evaluation Results

- **Overall Accuracy:** 72.4%
- **Verdict Accuracy:** 68%
- **Finding Count Accuracy:** 76%
- **Severity Accuracy:** 70%
- **Vulnerability Class Accuracy:** 72%
- **Deduplication Accuracy:** 76%

### Mismatch Summary
- **Total Mismatches (Security/Model Failures):** 46
- **Total Runtime/API Errors:** 0

#### Failing Case IDs
tc_003, tc_004, tc_010, tc_012, tc_013, tc_015, tc_023, tc_024, tc_030, tc_031, tc_032, tc_033, tc_037, tc_038, tc_040, tc_041, tc_042, tc_043, tc_044, tc_047, tc_048, tc_049, tc_051, tc_055, tc_063, tc_064, tc_065, tc_066, tc_069, tc_071, tc_074, tc_075, tc_076, tc_077, tc_079, tc_080, tc_083, tc_085, tc_086, tc_089, tc_091, tc_092, tc_093, tc_097, tc_098, tc_100

#### Mismatch Details
**Case ID:** tc_003
- **Verdict Mismatch:** Expected `PASS`, Actual `NOT_VERIFIED`
- **Count Mismatch:** Expected `0`, Actual `1`
- **Class Mismatch:** Expected `[None]`, Actual `[BUSINESS_LOGIC_FLAW]`
- **Likely Root Cause:** Over-reporting/Duplication: Model reported extra or duplicate findings.

**Case ID:** tc_004
- **Verdict Mismatch:** Expected `PASS`, Actual `NOT_VERIFIED`
- **Likely Root Cause:** Model failed to analyze properly.

**Case ID:** tc_010
- **Verdict Mismatch:** Expected `PASS`, Actual `FAIL`
- **Count Mismatch:** Expected `0`, Actual `1`
- **Class Mismatch:** Expected `[None]`, Actual `[SECRET_EXPOSURE]`
- **Likely Root Cause:** False Positive: Model incorrectly identified safe code as vulnerable.

**Case ID:** tc_012
- **Class Mismatch:** Expected `[AUTHORIZATION_FAILURE]`, Actual `[BUSINESS_LOGIC_FLAW]`
- **Likely Root Cause:** Misclassification: Model incorrectly categorized the vulnerability.

**Case ID:** tc_013
- **Class Mismatch:** Expected `[JWT_SECURITY, SECRET_EXPOSURE]`, Actual `[AUTH_BYPASS, SECRET_EXPOSURE]`
- **Likely Root Cause:** Misclassification: Model incorrectly categorized the vulnerability.

**Case ID:** tc_015
- **Verdict Mismatch:** Expected `NOT_VERIFIED`, Actual `FAIL`
- **Count Mismatch:** Expected `0`, Actual `1`
- **Class Mismatch:** Expected `[None]`, Actual `[INSECURE_CONFIGURATION]`
- **Likely Root Cause:** Over-reporting/Duplication: Model reported extra or duplicate findings.

**Case ID:** tc_023
- **Verdict Mismatch:** Expected `NOT_VERIFIED`, Actual `PASS`
- **Likely Root Cause:** Model failed to analyze properly.

**Case ID:** tc_024
- **Count Mismatch:** Expected `0`, Actual `1`
- **Class Mismatch:** Expected `[None]`, Actual `[INPUT_VALIDATION]`
- **Likely Root Cause:** Over-reporting/Duplication: Model reported extra or duplicate findings.

**Case ID:** tc_030
- **Count Mismatch:** Expected `4`, Actual `5`
- **Class Mismatch:** Expected `[CRYPTOGRAPHIC_FAILURE, AUTH_BYPASS, JWT_SECURITY, SECRET_EXPOSURE]`, Actual `[AUTH_BYPASS, SECRET_EXPOSURE, SECRET_EXPOSURE, CRYPTOGRAPHIC_FAILURE, JWT_SECURITY]`
- **Likely Root Cause:** Over-reporting/Duplication: Model reported extra or duplicate findings.

**Case ID:** tc_031
- **Verdict Mismatch:** Expected `FAIL`, Actual `PASS`
- **Count Mismatch:** Expected `1`, Actual `0`
- **Likely Root Cause:** False Negative: Model failed to detect the vulnerability.

**Case ID:** tc_032
- **Verdict Mismatch:** Expected `FAIL`, Actual `PASS`
- **Count Mismatch:** Expected `1`, Actual `0`
- **Likely Root Cause:** False Negative: Model failed to detect the vulnerability.

**Case ID:** tc_033
- **Verdict Mismatch:** Expected `FAIL`, Actual `PASS`
- **Count Mismatch:** Expected `1`, Actual `0`
- **Likely Root Cause:** False Negative: Model failed to detect the vulnerability.

**Case ID:** tc_037
- **Verdict Mismatch:** Expected `PASS`, Actual `NOT_VERIFIED`
- **Likely Root Cause:** Model failed to analyze properly.

**Case ID:** tc_038
- **Verdict Mismatch:** Expected `PASS`, Actual `FAIL`
- **Count Mismatch:** Expected `0`, Actual `1`
- **Class Mismatch:** Expected `[None]`, Actual `[CRYPTOGRAPHIC_FAILURE]`
- **Likely Root Cause:** False Positive: Model incorrectly identified safe code as vulnerable.

**Case ID:** tc_040
- **Verdict Mismatch:** Expected `FAIL`, Actual `PASS`
- **Count Mismatch:** Expected `1`, Actual `0`
- **Likely Root Cause:** False Negative: Model failed to detect the vulnerability.

**Case ID:** tc_041
- **Verdict Mismatch:** Expected `FAIL`, Actual `NOT_VERIFIED`
- **Count Mismatch:** Expected `1`, Actual `0`
- **Class Mismatch:** Expected `[BUSINESS_LOGIC_FLAW]`, Actual `[None]`
- **Likely Root Cause:** Under-reporting: Model missed some vulnerabilities.

**Case ID:** tc_042
- **Verdict Mismatch:** Expected `FAIL`, Actual `NOT_VERIFIED`
- **Count Mismatch:** Expected `1`, Actual `0`
- **Class Mismatch:** Expected `[AUTH_BYPASS]`, Actual `[None]`
- **Likely Root Cause:** Under-reporting: Model missed some vulnerabilities.

**Case ID:** tc_043
- **Class Mismatch:** Expected `[BUSINESS_LOGIC_FLAW]`, Actual `[AUTH_BYPASS]`
- **Likely Root Cause:** Misclassification: Model incorrectly categorized the vulnerability.

**Case ID:** tc_044
- **Verdict Mismatch:** Expected `FAIL`, Actual `NOT_VERIFIED`
- **Count Mismatch:** Expected `1`, Actual `0`
- **Class Mismatch:** Expected `[AUTH_BYPASS]`, Actual `[None]`
- **Likely Root Cause:** Under-reporting: Model missed some vulnerabilities.

**Case ID:** tc_047
- **Verdict Mismatch:** Expected `PASS`, Actual `NOT_VERIFIED`
- **Likely Root Cause:** Model failed to analyze properly.

**Case ID:** tc_048
- **Verdict Mismatch:** Expected `PASS`, Actual `NOT_VERIFIED`
- **Likely Root Cause:** Model failed to analyze properly.

**Case ID:** tc_049
- **Likely Root Cause:** Model failed to analyze properly.

**Case ID:** tc_051
- **Count Mismatch:** Expected `1`, Actual `2`
- **Class Mismatch:** Expected `[JWT_SECURITY]`, Actual `[JWT_SECURITY, JWT_SECURITY]`
- **Likely Root Cause:** Over-reporting/Duplication: Model reported extra or duplicate findings.

**Case ID:** tc_055
- **Verdict Mismatch:** Expected `PASS`, Actual `NOT_VERIFIED`
- **Likely Root Cause:** Model failed to analyze properly.

**Case ID:** tc_063
- **Verdict Mismatch:** Expected `PASS`, Actual `NOT_VERIFIED`
- **Count Mismatch:** Expected `0`, Actual `1`
- **Class Mismatch:** Expected `[None]`, Actual `[BUSINESS_LOGIC_FLAW]`
- **Likely Root Cause:** Over-reporting/Duplication: Model reported extra or duplicate findings.

**Case ID:** tc_064
- **Likely Root Cause:** Model failed to analyze properly.

**Case ID:** tc_065
- **Likely Root Cause:** Model failed to analyze properly.

**Case ID:** tc_066
- **Verdict Mismatch:** Expected `FAIL`, Actual `NOT_VERIFIED`
- **Count Mismatch:** Expected `1`, Actual `0`
- **Class Mismatch:** Expected `[CRYPTOGRAPHIC_FAILURE]`, Actual `[None]`
- **Likely Root Cause:** Under-reporting: Model missed some vulnerabilities.

**Case ID:** tc_069
- **Verdict Mismatch:** Expected `FAIL`, Actual `NOT_VERIFIED`
- **Count Mismatch:** Expected `1`, Actual `0`
- **Class Mismatch:** Expected `[CRYPTOGRAPHIC_FAILURE]`, Actual `[None]`
- **Likely Root Cause:** Under-reporting: Model missed some vulnerabilities.

**Case ID:** tc_071
- **Likely Root Cause:** Model failed to analyze properly.

**Case ID:** tc_074
- **Class Mismatch:** Expected `[INSECURE_CONFIGURATION]`, Actual `[INPUT_VALIDATION]`
- **Likely Root Cause:** Misclassification: Model incorrectly categorized the vulnerability.

**Case ID:** tc_075
- **Class Mismatch:** Expected `[INSECURE_CONFIGURATION]`, Actual `[INPUT_VALIDATION]`
- **Likely Root Cause:** Misclassification: Model incorrectly categorized the vulnerability.

**Case ID:** tc_076
- **Verdict Mismatch:** Expected `FAIL`, Actual `PASS`
- **Count Mismatch:** Expected `1`, Actual `0`
- **Likely Root Cause:** False Negative: Model failed to detect the vulnerability.

**Case ID:** tc_077
- **Verdict Mismatch:** Expected `FAIL`, Actual `PASS`
- **Count Mismatch:** Expected `1`, Actual `0`
- **Likely Root Cause:** False Negative: Model failed to detect the vulnerability.

**Case ID:** tc_079
- **Verdict Mismatch:** Expected `PASS`, Actual `NOT_VERIFIED`
- **Likely Root Cause:** Model failed to analyze properly.

**Case ID:** tc_080
- **Verdict Mismatch:** Expected `PASS`, Actual `NOT_VERIFIED`
- **Likely Root Cause:** Model failed to analyze properly.

**Case ID:** tc_083
- **Verdict Mismatch:** Expected `NOT_VERIFIED`, Actual `PASS`
- **Likely Root Cause:** Model failed to analyze properly.

**Case ID:** tc_085
- **Verdict Mismatch:** Expected `NOT_VERIFIED`, Actual `PASS`
- **Likely Root Cause:** Model failed to analyze properly.

**Case ID:** tc_086
- **Verdict Mismatch:** Expected `NOT_VERIFIED`, Actual `PASS`
- **Likely Root Cause:** Model failed to analyze properly.

**Case ID:** tc_089
- **Verdict Mismatch:** Expected `FAIL`, Actual `PASS`
- **Count Mismatch:** Expected `2`, Actual `0`
- **Likely Root Cause:** False Negative: Model failed to detect the vulnerability.

**Case ID:** tc_091
- **Verdict Mismatch:** Expected `FAIL`, Actual `PASS`
- **Count Mismatch:** Expected `1`, Actual `0`
- **Likely Root Cause:** False Negative: Model failed to detect the vulnerability.

**Case ID:** tc_092
- **Class Mismatch:** Expected `[BUSINESS_LOGIC_FLAW]`, Actual `[AUTH_BYPASS]`
- **Likely Root Cause:** Misclassification: Model incorrectly categorized the vulnerability.

**Case ID:** tc_093
- **Verdict Mismatch:** Expected `FAIL`, Actual `PASS`
- **Count Mismatch:** Expected `1`, Actual `0`
- **Likely Root Cause:** False Negative: Model failed to detect the vulnerability.

**Case ID:** tc_097
- **Likely Root Cause:** Model failed to analyze properly.

**Case ID:** tc_098
- **Verdict Mismatch:** Expected `PASS`, Actual `FAIL`
- **Count Mismatch:** Expected `0`, Actual `1`
- **Class Mismatch:** Expected `[None]`, Actual `[INPUT_VALIDATION]`
- **Likely Root Cause:** False Positive: Model incorrectly identified safe code as vulnerable.

**Case ID:** tc_100
- **Verdict Mismatch:** Expected `FAIL`, Actual `NOT_VERIFIED`
- **Count Mismatch:** Expected `1`, Actual `0`
- **Class Mismatch:** Expected `[SECRET_EXPOSURE]`, Actual `[None]`
- **Likely Root Cause:** Under-reporting: Model missed some vulnerabilities.

