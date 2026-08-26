
### Case: tc_012
- **Expected**: Verdict=FAIL, Count=1, Classes=[AUTHORIZATION_FAILURE]
- **Actual**: Verdict=FAIL
- **Actual Findings (Aggregated)**: 1
  - BUSINESS_LOGIC_FLAW: BUSINESS_LOGIC_FLAW: snippet.js:3
- **Raw Checkpoint Findings**: 1
  - [SEC-AUTHZ-001] BUSINESS_LOGIC_FLAW: Profile update uses an unverified client-controlled user ID

### Case: tc_013
- **Expected**: Verdict=FAIL, Count=2, Classes=[JWT_SECURITY, SECRET_EXPOSURE]
- **Actual**: Verdict=FAIL
- **Actual Findings (Aggregated)**: 3
  - SECRET_EXPOSURE: SECRET_EXPOSURE: snippet.js:2
  - AUTH_BYPASS: AUTH_BYPASS: snippet.js:2
  - JWT_SECURITY: JWT_SECURITY: snippet.js:2
- **Raw Checkpoint Findings**: 3
  - [SEC-SECRET-001] SECRET_EXPOSURE: Hardcoded JWT Secret
  - [SEC-SESSION-001] AUTH_BYPASS: JWT identity is taken directly from client input
  - [SEC-SESSION-001] JWT_SECURITY: JWT is issued without an expiration

### Case: tc_015
- **Expected**: Verdict=NOT_VERIFIED, Count=0, Classes=[]
- **Actual**: Verdict=FAIL
- **Actual Findings (Aggregated)**: 1
  - INSECURE_CONFIGURATION: INSECURE_CONFIGURATION: snippet.js:4
- **Raw Checkpoint Findings**: 1
  - [SEC-CONFIG-001] INSECURE_CONFIGURATION: Overly Permissive CORS Configuration

### Case: tc_031
- **Expected**: Verdict=FAIL, Count=1, Classes=[SECRET_EXPOSURE]
- **Actual**: Verdict=PASS
- **Actual Findings (Aggregated)**: 0
- **Raw Checkpoint Findings**: 0

### Case: tc_032
- **Expected**: Verdict=FAIL, Count=1, Classes=[SECRET_EXPOSURE]
- **Actual**: Verdict=PASS
- **Actual Findings (Aggregated)**: 0
- **Raw Checkpoint Findings**: 0

### Case: tc_033
- **Expected**: Verdict=FAIL, Count=1, Classes=[SECRET_EXPOSURE]
- **Actual**: Verdict=PASS
- **Actual Findings (Aggregated)**: 0
- **Raw Checkpoint Findings**: 0

### Case: tc_037
- **Expected**: Verdict=PASS, Count=0, Classes=[]
- **Actual**: Verdict=NOT_VERIFIED
- **Actual Findings (Aggregated)**: 0
- **Raw Checkpoint Findings**: 0

### Case: tc_038
- **Expected**: Verdict=PASS, Count=0, Classes=[]
- **Actual**: Verdict=FAIL
- **Actual Findings (Aggregated)**: 1
  - BUSINESS_LOGIC_FLAW: BUSINESS_LOGIC_FLAW: snippet.js:2
- **Raw Checkpoint Findings**: 1
  - [SEC-AUTH-001] BUSINESS_LOGIC_FLAW: Plaintext password comparison during login

### Case: tc_040
- **Expected**: Verdict=FAIL, Count=1, Classes=[SECRET_EXPOSURE]
- **Actual**: Verdict=NOT_VERIFIED
- **Actual Findings (Aggregated)**: 0
- **Raw Checkpoint Findings**: 0

### Case: tc_041
- **Expected**: Verdict=FAIL, Count=1, Classes=[BUSINESS_LOGIC_FLAW]
- **Actual**: Verdict=PASS
- **Actual Findings (Aggregated)**: 0
- **Raw Checkpoint Findings**: 0

### Case: tc_042
- **Expected**: Verdict=FAIL, Count=1, Classes=[AUTH_BYPASS]
- **Actual**: Verdict=NOT_VERIFIED
- **Actual Findings (Aggregated)**: 0
- **Raw Checkpoint Findings**: 0

### Case: tc_043
- **Expected**: Verdict=FAIL, Count=1, Classes=[BUSINESS_LOGIC_FLAW]
- **Actual**: Verdict=NOT_VERIFIED
- **Actual Findings (Aggregated)**: 0
- **Raw Checkpoint Findings**: 0

### Case: tc_044
- **Expected**: Verdict=FAIL, Count=1, Classes=[AUTH_BYPASS]
- **Actual**: Verdict=NOT_VERIFIED
- **Actual Findings (Aggregated)**: 0
- **Raw Checkpoint Findings**: 0

### Case: tc_047
- **Expected**: Verdict=PASS, Count=0, Classes=[]
- **Actual**: Verdict=NOT_VERIFIED
- **Actual Findings (Aggregated)**: 0
- **Raw Checkpoint Findings**: 0

### Case: tc_048
- **Expected**: Verdict=PASS, Count=0, Classes=[]
- **Actual**: Verdict=NOT_VERIFIED
- **Actual Findings (Aggregated)**: 0
- **Raw Checkpoint Findings**: 0

### Case: tc_052
- **Expected**: Verdict=FAIL, Count=1, Classes=[JWT_SECURITY]
- **Actual**: Verdict=FAIL
- **Actual Findings (Aggregated)**: 1
  - JWT_SECURITY: JWT_SECURITY: snippet.js:3
- **Raw Checkpoint Findings**: 2
  - [SEC-AUTH-001] AUTH_BYPASS: JWT identity is trusted without signature verification
  - [SEC-SECRET-001] JWT_SECURITY: Insecure JWT Processing via jwt.decode

### Case: tc_063
- **Expected**: Verdict=PASS, Count=0, Classes=[]
- **Actual**: Verdict=NOT_VERIFIED
- **Actual Findings (Aggregated)**: 0
- **Raw Checkpoint Findings**: 0

### Case: tc_065
- **Expected**: Verdict=FAIL, Count=1, Classes=[CRYPTOGRAPHIC_FAILURE]
- **Actual**: Verdict=FAIL
- **Actual Findings (Aggregated)**: 1
  - CRYPTOGRAPHIC_FAILURE: CRYPTOGRAPHIC_FAILURE: snippet.js:2
- **Raw Checkpoint Findings**: 1
  - [SEC-CRYPTO-001] CRYPTOGRAPHIC_FAILURE: Use of deprecated DES encryption

### Case: tc_069
- **Expected**: Verdict=FAIL, Count=1, Classes=[CRYPTOGRAPHIC_FAILURE]
- **Actual**: Verdict=FAIL
- **Actual Findings (Aggregated)**: 1
  - CRYPTOGRAPHIC_FAILURE: CRYPTOGRAPHIC_FAILURE: snippet.js:2
- **Raw Checkpoint Findings**: 1
  - [SEC-CRYPTO-001] CRYPTOGRAPHIC_FAILURE: Deprecated SHA-1 hashing algorithm

### Case: tc_074
- **Expected**: Verdict=FAIL, Count=1, Classes=[INSECURE_CONFIGURATION]
- **Actual**: Verdict=FAIL
- **Actual Findings (Aggregated)**: 1
  - INPUT_VALIDATION: INPUT_VALIDATION: snippet.js:2
- **Raw Checkpoint Findings**: 1
  - [SEC-INPUT-001] INPUT_VALIDATION: XML External Entity (XXE) Injection

### Case: tc_075
- **Expected**: Verdict=FAIL, Count=1, Classes=[INSECURE_CONFIGURATION]
- **Actual**: Verdict=FAIL
- **Actual Findings (Aggregated)**: 1
  - INPUT_VALIDATION: INPUT_VALIDATION: snippet.js:1
- **Raw Checkpoint Findings**: 1
  - [SEC-INPUT-001] INPUT_VALIDATION: XML External Entity (XXE) Injection Vulnerability

### Case: tc_076
- **Expected**: Verdict=FAIL, Count=1, Classes=[INSECURE_CONFIGURATION]
- **Actual**: Verdict=PASS
- **Actual Findings (Aggregated)**: 0
- **Raw Checkpoint Findings**: 0

### Case: tc_077
- **Expected**: Verdict=FAIL, Count=1, Classes=[INPUT_VALIDATION]
- **Actual**: Verdict=PASS
- **Actual Findings (Aggregated)**: 0
- **Raw Checkpoint Findings**: 0

### Case: tc_079
- **Expected**: Verdict=PASS, Count=0, Classes=[]
- **Actual**: Verdict=NOT_VERIFIED
- **Actual Findings (Aggregated)**: 0
- **Raw Checkpoint Findings**: 0

### Case: tc_080
- **Expected**: Verdict=PASS, Count=0, Classes=[]
- **Actual**: Verdict=FAIL
- **Actual Findings (Aggregated)**: 1
  - INPUT_VALIDATION: INPUT_VALIDATION: snippet.js:2
- **Raw Checkpoint Findings**: 1
  - [SEC-INPUT-001] INPUT_VALIDATION: Command Injection via Unsanitized User Input

### Case: tc_085
- **Expected**: Verdict=NOT_VERIFIED, Count=0, Classes=[]
- **Actual**: Verdict=PASS
- **Actual Findings (Aggregated)**: 0
- **Raw Checkpoint Findings**: 0

### Case: tc_086
- **Expected**: Verdict=NOT_VERIFIED, Count=0, Classes=[]
- **Actual**: Verdict=PASS
- **Actual Findings (Aggregated)**: 0
- **Raw Checkpoint Findings**: 0

### Case: tc_087
- **Expected**: Verdict=NOT_VERIFIED, Count=0, Classes=[]
- **Actual**: Verdict=NOT_VERIFIED
- **Actual Findings (Aggregated)**: 0
- **Raw Checkpoint Findings**: 0

### Case: tc_089
- **Expected**: Verdict=FAIL, Count=2, Classes=[SECRET_EXPOSURE, SECRET_EXPOSURE]
- **Actual**: Verdict=PASS
- **Actual Findings (Aggregated)**: 0
- **Raw Checkpoint Findings**: 0

### Case: tc_091
- **Expected**: Verdict=FAIL, Count=1, Classes=[SECRET_EXPOSURE]
- **Actual**: Verdict=PASS
- **Actual Findings (Aggregated)**: 0
- **Raw Checkpoint Findings**: 0

### Case: tc_092
- **Expected**: Verdict=FAIL, Count=1, Classes=[BUSINESS_LOGIC_FLAW]
- **Actual**: Verdict=FAIL
- **Actual Findings (Aggregated)**: 1
  - BUSINESS_LOGIC_FLAW: BUSINESS_LOGIC_FLAW: snippet.js:2
- **Raw Checkpoint Findings**: 1
  - [SEC-AUTHZ-001] BUSINESS_LOGIC_FLAW: Administrative access relies on client-controlled localStorage

### Case: tc_093
- **Expected**: Verdict=FAIL, Count=1, Classes=[BUSINESS_LOGIC_FLAW]
- **Actual**: Verdict=PASS
- **Actual Findings (Aggregated)**: 0
- **Raw Checkpoint Findings**: 0

### Case: tc_098
- **Expected**: Verdict=PASS, Count=0, Classes=[]
- **Actual**: Verdict=FAIL
- **Actual Findings (Aggregated)**: 1
  - INPUT_VALIDATION: INPUT_VALIDATION: snippet.js:2
- **Raw Checkpoint Findings**: 1
  - [SEC-INPUT-001] INPUT_VALIDATION: Arbitrary Code Execution via eval()

### Case: tc_100
- **Expected**: Verdict=FAIL, Count=1, Classes=[SECRET_EXPOSURE]
- **Actual**: Verdict=PASS
- **Actual Findings (Aggregated)**: 0
- **Raw Checkpoint Findings**: 0
