# Stable Failures Draft

## Case: tc_013
**Category/Tags**: obvious / jwt,secrets
**Rationale**: Missing expiration and potentially weak hardcoded secret, should flag both JWT and Secrets issues.
**Snippet**:
```javascript
app.post('/token', (req, res) => {
  const token = jwt.sign({ user: req.body.user }, 'super_secret_key');
  res.json({ token });
});
```
**Expected**: Verdict=FAIL, Count=2, Classes=JWT_SECURITY,SECRET_EXPOSURE
**Actual**: Verdict=FAIL, Classes=AUTH_BYPASS: snippet.js:2,SECRET_EXPOSURE: snippet.js:2,JWT_SECURITY: snippet.js:2
**Raw Findings**: []

## Case: tc_015
**Category/Tags**: obvious / configuration,cors
**Rationale**: CORS allows any origin, but lacks enough application context for a concrete vulnerability.
**Snippet**:
```javascript
const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors({ origin: '*' }));
app.disable('x-powered-by');
```
**Expected**: Verdict=NOT_VERIFIED, Count=0, Classes=
**Actual**: Verdict=FAIL, Classes=INSECURE_CONFIGURATION: snippet.js:4
**Raw Findings**: []

## Case: tc_037
**Category/Tags**: secrets / secrets,safe
**Rationale**: Safe loading of secrets from environment variables.
**Snippet**:
```javascript
const dbPassword = process.env.DB_PASSWORD || process.env.FALLBACK_PASS;
db.connect(dbPassword);
```
**Expected**: Verdict=PASS, Count=0, Classes=
**Actual**: Verdict=NOT_VERIFIED, Classes=
**Raw Findings**: []

## Case: tc_038
**Category/Tags**: secrets / secrets,safe,variable-name
**Rationale**: Variable named userPassword but purely receives dynamic arguments.
**Snippet**:
```javascript
function loginUser(userPassword) {
  return db.query('SELECT * FROM users WHERE pass = $1', [userPassword]);
}
```
**Expected**: Verdict=PASS, Count=0, Classes=
**Actual**: Verdict=FAIL, Classes=CRYPTOGRAPHIC_FAILURE: snippet.js:2
**Raw Findings**: []

## Case: tc_040
**Category/Tags**: secrets / secrets,connection-string
**Rationale**: Hardcoded password inside a connection string.
**Snippet**:
```javascript
const client = new MongoClient('mongodb://admin:admin12345@prod.database.internal:27017');
```
**Expected**: Verdict=FAIL, Count=1, Classes=SECRET_EXPOSURE
**Actual**: Verdict=PASS, Classes=
**Raw Findings**: []

## Case: tc_041
**Category/Tags**: authz / authz,idor
**Rationale**: IDOR: Trusting req.params.id without checking ownership, explicitly BUSINESS_LOGIC_FLAW per AuthorizationSpec.
**Snippet**:
```javascript
app.get('/users/:id/messages', (req, res) => {
  const messages = db.getMessagesForUser(req.params.id);
  res.json(messages);
});
```
**Expected**: Verdict=FAIL, Count=1, Classes=BUSINESS_LOGIC_FLAW
**Actual**: Verdict=NOT_VERIFIED, Classes=
**Raw Findings**: []

## Case: tc_042
**Category/Tags**: authz / authz,missing-auth
**Rationale**: Missing authorization check on an explicitly administrative endpoint.
**Snippet**:
```javascript
app.post('/api/admin/delete_user', (req, res) => {
  db.users.delete(req.body.userId);
  res.send('Deleted');
});
```
**Expected**: Verdict=FAIL, Count=1, Classes=AUTH_BYPASS
**Actual**: Verdict=NOT_VERIFIED, Classes=BUSINESS_LOGIC_FLAW: snippet.js:1
**Raw Findings**: []

## Case: tc_043
**Category/Tags**: authz / authz,mass-assignment
**Rationale**: Mass assignment allowing privilege escalation (e.g., injecting role: admin).
**Snippet**:
```javascript
app.post('/profile', (req, res) => {
  const user = req.session.user;
  Object.assign(user, req.body);
  db.save(user);
});
```
**Expected**: Verdict=FAIL, Count=1, Classes=BUSINESS_LOGIC_FLAW
**Actual**: Verdict=FAIL, Classes=AUTH_BYPASS: snippet.js:3
**Raw Findings**: []

## Case: tc_044
**Category/Tags**: authz / authz,auth-bypass
**Rationale**: Password reset trusts the email provided in the body without verifying a reset token.
**Snippet**:
```javascript
app.post('/reset-password', (req, res) => {
  const userEmail = req.body.email;
  db.users.updatePassword(userEmail, req.body.newPassword);
});
```
**Expected**: Verdict=FAIL, Count=1, Classes=AUTH_BYPASS
**Actual**: Verdict=NOT_VERIFIED, Classes=
**Raw Findings**: []

## Case: tc_047
**Category/Tags**: authz / authz,safe,middleware
**Rationale**: Delegated but explicitly present authorization middleware boundary.
**Snippet**:
```javascript
import { requireAdmin } from './middleware';
router.post('/settings', requireAdmin, (req, res) => {
  res.send('Updated settings');
});
```
**Expected**: Verdict=PASS, Count=0, Classes=
**Actual**: Verdict=NOT_VERIFIED, Classes=
**Raw Findings**: []

## Case: tc_048
**Category/Tags**: authz / authz,safe,session
**Rationale**: Standard session validation correctly implemented.
**Snippet**:
```javascript
function handleRequest(req, res) {
  if (!req.session || !req.session.userId) {
    return res.redirect('/login');
  }
  res.send('Welcome');
}
```
**Expected**: Verdict=PASS, Count=0, Classes=
**Actual**: Verdict=NOT_VERIFIED, Classes=
**Raw Findings**: []

## Case: tc_063
**Category/Tags**: file / file,safe,db-lookup
**Rationale**: Safe indirect file reference using database record lookup.
**Snippet**:
```javascript
async function downloadFile(req, res) {
  const record = await db.files.findById(req.params.id);
  res.sendFile(record.absolutePath);
}
```
**Expected**: Verdict=PASS, Count=0, Classes=
**Actual**: Verdict=NOT_VERIFIED, Classes=BUSINESS_LOGIC_FLAW: snippet.js:2
**Raw Findings**: []

## Case: tc_065
**Category/Tags**: crypto / crypto,weak-pbkdf2
**Rationale**: Use of broken DES encryption algorithm. Cryptography defaults to critical for blatantly broken algorithms.
**Snippet**:
```javascript
function encryptData(data, key) {
  const cipher = crypto.createCipher('des', key);
  return cipher.update(data, 'utf8', 'hex') + cipher.final('hex');
}
```
**Expected**: Verdict=FAIL, Count=1, Classes=CRYPTOGRAPHIC_FAILURE
**Actual**: Verdict=FAIL, Classes=CRYPTOGRAPHIC_FAILURE: snippet.js:2
**Raw Findings**: []

## Case: tc_069
**Category/Tags**: crypto / crypto,sha1
**Rationale**: Broken SHA-1 algorithm.
**Snippet**:
```javascript
function hashData(data) {
  return crypto.createHash('sha1').update(data).digest('hex');
}
```
**Expected**: Verdict=FAIL, Count=1, Classes=CRYPTOGRAPHIC_FAILURE
**Actual**: Verdict=NOT_VERIFIED, Classes=
**Raw Findings**: []

## Case: tc_076
**Category/Tags**: configuration / config,cors-reflection
**Rationale**: Reflecting the Origin header directly allows any origin.
**Snippet**:
```javascript
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  next();
});
```
**Expected**: Verdict=FAIL, Count=1, Classes=INSECURE_CONFIGURATION
**Actual**: Verdict=PASS, Classes=
**Raw Findings**: []

## Case: tc_077
**Category/Tags**: injection / injection,nosql
**Rationale**: NoSQL injection on a non-auth endpoint to guarantee INPUT_VALIDATION class.
**Snippet**:
```javascript
app.get('/api/products', async (req, res) => {
  const products = await db.collection('products').find({ category: req.query.category }).toArray();
  res.json(products);
});
```
**Expected**: Verdict=FAIL, Count=1, Classes=INPUT_VALIDATION
**Actual**: Verdict=PASS, Classes=
**Raw Findings**: []

## Case: tc_079
**Category/Tags**: injection / injection,safe,orm
**Rationale**: Safe standard ORM usage prevents SQL/NoSQL injection.
**Snippet**:
```javascript
const user = await User.findOne({ where: { username: req.body.username } });
```
**Expected**: Verdict=PASS, Count=0, Classes=
**Actual**: Verdict=NOT_VERIFIED, Classes=
**Raw Findings**: []

## Case: tc_080
**Category/Tags**: injection / injection,safe,spawn
**Rationale**: Using spawn with an argument array is immune to shell command injection.
**Snippet**:
```javascript
const { spawn } = require('child_process');
spawn('ls', ['-l', req.query.dir]);
```
**Expected**: Verdict=PASS, Count=0, Classes=
**Actual**: Verdict=FAIL, Classes=INPUT_VALIDATION: snippet.js:2
**Raw Findings**: []

## Case: tc_085
**Category/Tags**: partial-context / partial,middleware
**Rationale**: Middleware definition exists but logic is absent.
**Snippet**:
```javascript
import { customSecurityMiddleware } from './lib/security';
app.use(customSecurityMiddleware);
```
**Expected**: Verdict=PASS, Count=0, Classes=
**Actual**: Verdict=PASS, Classes=
**Raw Findings**: []

## Case: tc_086
**Category/Tags**: partial-context / partial,config
**Rationale**: Innocuous config file missing context.
**Snippet**:
```javascript
export const config = {
  port: 3000,
  timeout: 5000
};
```
**Expected**: Verdict=PASS, Count=0, Classes=
**Actual**: Verdict=PASS, Classes=
**Raw Findings**: []

## Case: tc_089
**Category/Tags**: aggregation / aggregation,secrets,multi
**Rationale**: Two distinct secrets on adjacent lines must not be deduplicated.
**Snippet**:
```javascript
const s3Key = 'AKIAIOSFODNN7EXAMPLE';
const stripeKey = 'sk_live_1234567890abcdef';
```
**Expected**: Verdict=FAIL, Count=2, Classes=SECRET_EXPOSURE,SECRET_EXPOSURE
**Actual**: Verdict=PASS, Classes=
**Raw Findings**: []

## Case: tc_091
**Category/Tags**: severity / severity,critical
**Rationale**: Clearly critical hardcoded production database password.
**Snippet**:
```javascript
const DB_URL = 'postgres://prod_admin:RealProdPass123!@10.0.1.5:5432/main_db';
```
**Expected**: Verdict=FAIL, Count=1, Classes=SECRET_EXPOSURE
**Actual**: Verdict=PASS, Classes=
**Raw Findings**: []

## Case: tc_092
**Category/Tags**: severity / severity,warning
**Rationale**: Client-only authorization enforcement is explicitly defined as a warning severity in AuthorizationSpec.
**Snippet**:
```javascript
function AdminPanel() {
  if (!localStorage.getItem('isAdmin')) {
    return <div>Access Denied</div>;
  }
  return <AdminDashboard />;
}
```
**Expected**: Verdict=FAIL, Count=1, Classes=BUSINESS_LOGIC_FLAW
**Actual**: Verdict=FAIL, Classes=BUSINESS_LOGIC_FLAW: snippet.js:2
**Raw Findings**: []

## Case: tc_093
**Category/Tags**: severity / severity,warning
**Rationale**: Missing authorization on a non-destructive read operation is explicitly defined as a warning severity in AuthorizationSpec.
**Snippet**:
```javascript
app.get('/api/internal/users', (req, res) => {
  const users = db.getInternalUsers();
  res.json(users);
});
```
**Expected**: Verdict=FAIL, Count=1, Classes=BUSINESS_LOGIC_FLAW
**Actual**: Verdict=PASS, Classes=
**Raw Findings**: []

## Case: tc_098
**Category/Tags**: adversarial / adversarial,safe,eval
**Rationale**: Eval looks dangerous, but JSON.stringify ensures input cannot break out into execution.
**Snippet**:
```javascript
const safeData = { val: req.query.input };
eval('var state = ' + JSON.stringify(safeData));
```
**Expected**: Verdict=PASS, Count=0, Classes=
**Actual**: Verdict=FAIL, Classes=INPUT_VALIDATION: snippet.js:2
**Raw Findings**: []

