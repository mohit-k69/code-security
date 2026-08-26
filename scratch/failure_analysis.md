# Failure Analysis Report

## Exact number of affected cases
**Total Mismatching Cases:** 46 out of 100

## Root-Cause Clusters (Ranked by Impact)

| Root-Cause Cluster | Case IDs | Count | Failure Type | Checkpoint/Spec | Prompt/Code Rule | Issue Category | Proposed General Fix | Overfitting Risk | Regression Risk (30-case baseline) |
|---|---|---|---|---|---|---|---|---|---|
| **False NOT_VERIFIED (Context too small)** | tc_004, tc_023, tc_024, tc_037, tc_041, tc_044, tc_047, tc_048, tc_055, tc_069, tc_079 | 11 | NOT_VERIFIED routing | ReviewOrchestrator / Models | Context sufficiency threshold | genuine model limitation | Relax the context requirement or instruct models to assume necessary imports exist if standard library/framework signatures are used. | High | tc_021, tc_022, tc_023 |
| **False Negative: Missed Vulnerabilities** | tc_032, tc_033, tc_040, tc_076, tc_077, tc_089, tc_091, tc_093, tc_100 | 9 | detection | Various | Vulnerability detection logic | genuine model limitation | Provide more concrete examples of complex/indirect vulnerabilities in the system prompt. | Medium | Could increase false positives across clean baseline cases. |
| **Severity Mismatch** | tc_030, tc_049, tc_051, tc_064, tc_065, tc_071, tc_097 | 7 | severity | ReviewOrchestrator / Models | Severity assignment | genuine model limitation | Enhance severity definitions in the prompt JSON schema to prevent models from downgrading critical flaws. | Low | tc_030 |
| **Misclassification of Vulnerability** | tc_012, tc_043, tc_074, tc_075, tc_092 | 5 | vulnerability-class mapping | Model Mapping | Enum definitions | genuine model limitation | Provide clearer boundaries between overlapping classes (e.g., AUTH_BYPASS vs BUSINESS_LOGIC_FLAW) in the JSON schema descriptions. | Medium | tc_007, tc_015 |
| **Other / Uncategorized** | tc_031, tc_066, tc_083, tc_085, tc_086 | 5 | mixed | Unknown | Various | Unknown | Manual investigation required | Unknown | Unknown |
| **False Positive: Over-flagging standard usage** | tc_010, tc_038, tc_080, tc_098 | 4 | false positive | SEC-FILE-001, SEC-AUTH-001, etc. | Strict validation heuristics | genuine model limitation / specification gap | Enhance checkpoint prompts with 'Safe Usage Patterns' to instruct the model to ignore standard/benign frameworks unless explicit misconfiguration is found. | Medium | tc_012, tc_013 |
| **Aggregator overriding FAIL with NOT_VERIFIED** | tc_003, tc_042, tc_063 | 3 | aggregation | FindingAggregator | Aggregator verdict precedence logic | aggregation problem | If findings > 0, verdict MUST be FAIL regardless of individual checkpoint NOT_VERIFIED statuses. | Low | None |
| **Multi-finding Deduplication Failure / Over-reporting** | tc_013, tc_015 | 2 | deduplication | FindingGuardrail / Aggregator | Deduplication similarity threshold | aggregation problem | Strengthen the finding deduplication logic. Group findings by line number + vulnerability class. | Low | tc_030 |

## Top Systemic Fixes to Improve Generalization

1. **Aggregator Verdict Precedence (Aggregation Problem):** Fix the aggregator logic so that if `findings.length > 0`, the final verdict is `FAIL`, regardless of any checkpoints returning `NOT_VERIFIED`. Currently, some findings are dropped or the overall status is corrupted if one checkpoint bails out.
2. **Relax NOT_VERIFIED Threshold (Genuine Model Limitation):** Update the base prompt to instruct the model to assume standard dependencies are correctly imported (e.g., `express`, `bcrypt`) rather than instantly bailing out to `NOT_VERIFIED` due to missing partial context.
3. **Strengthen Deduplication (Aggregation Problem):** Implement a strict line-based deduplication in `FindingGuardrail` or `ReviewOrchestrator` to collapse duplicate findings of the same class on the same line into a single finding.
4. **Clarify Class Boundaries (Specification Gap):** Add explicit prompt instructions separating `AUTH_BYPASS` vs `BUSINESS_LOGIC_FLAW`, and `INSECURE_CONFIGURATION` vs `INPUT_VALIDATION` to prevent misclassification.
5. **Enhance Severity Guidance (Genuine Model Limitation):** Add explicit definitions for severity levels to prevent the model from inappropriately downgrading high-impact vulnerabilities.

## Expected Regression Risk to the Original 30 Cases
The structural fixes (Aggregator precedence, Deduplication) pose **zero risk** to the original 30 cases, as they correct orchestration bugs. The prompt-based fixes (relaxing NOT_VERIFIED) pose a **High risk** to cases `tc_021`, `tc_022`, and `tc_023` (which strictly enforce NOT_VERIFIED for missing contexts). Tuning this threshold carefully is critical.

## Which fixes should be tested first
1. **Aggregator Verdict Precedence** (Pure code fix, high impact, zero risk).
2. **Line-based Deduplication** (Pure code fix, moderate impact, low risk).
