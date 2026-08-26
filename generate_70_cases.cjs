const fs = require('fs');

const cases = [
  // 1. SECRETS (10 cases)
  {
    id: "tc_031",
    category: "secrets",
    snippet: "const config = {\n  aws: {\n    credentials: {\n      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',\n      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'\n    }\n  }\n};",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["SECRET_EXPOSURE"],
      severities: ["critical"],
      lines: [5],
      findingCount: 1
    },
    tags: ["secrets", "nested"],
    rationale: "Deeply nested real-looking AWS key."
  },
  {
    id: "tc_032",
    category: "secrets",
    snippet: "const privateKey = `-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQD... (truncated)\n-----END PRIVATE KEY-----`;",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["SECRET_EXPOSURE"],
      severities: ["critical"],
      lines: [1],
      findingCount: 1
    },
    tags: ["secrets", "multiline"],
    rationale: "Multi-line private key."
  },
  {
    id: "tc_033",
    category: "secrets",
    snippet: "function connectDb() {\n  // DB_PASS = 'super_secret_db_password_123!';\n  const pass = process.env.DB_PASS;\n  db.connect(pass);\n}",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["SECRET_EXPOSURE"],
      severities: ["warning"],
      lines: [2],
      findingCount: 1
    },
    tags: ["secrets", "comment"],
    rationale: "Secret exposed in commented-out code."
  },
  {
    id: "tc_034",
    category: "secrets",
    snippet: "const stripeKey = process.env.STRIPE_SECRET_KEY;\nconsole.log('Using Stripe Key:', stripeKey);\nstripe.init(stripeKey);",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["SECRET_EXPOSURE"],
      severities: ["critical"],
      lines: [2],
      findingCount: 1
    },
    tags: ["secrets", "logging"],
    rationale: "Securely loaded secret leaked to console."
  },
  {
    id: "tc_035",
    category: "secrets",
    snippet: "const getApiKey = () => 'sk_live_' + '9876543210abcdef';",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["SECRET_EXPOSURE"],
      severities: ["critical"],
      lines: [1],
      findingCount: 1
    },
    tags: ["secrets", "dynamic"],
    rationale: "Secret obfuscated via string concatenation."
  },
  {
    id: "tc_036",
    category: "secrets",
    snippet: "const endpoints = [{ url: '/api/v1', key: 'api_7654321_secret' }];",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["SECRET_EXPOSURE"],
      severities: ["critical"],
      lines: [1],
      findingCount: 1
    },
    tags: ["secrets", "array"],
    rationale: "Hardcoded API key in an array."
  },
  {
    id: "tc_037",
    category: "secrets",
    snippet: "const dbPassword = process.env.DB_PASSWORD || process.env.FALLBACK_PASS;\ndb.connect(dbPassword);",
    expected: {
      verdict: "PASS",
      vulnerabilityClasses: [],
      severities: [],
      lines: [],
      findingCount: 0
    },
    tags: ["secrets", "safe"],
    rationale: "Safe loading of secrets from environment variables."
  },
  {
    id: "tc_038",
    category: "secrets",
    snippet: "function loginUser(userPassword) {\n  return db.query('SELECT * FROM users WHERE pass = $1', [userPassword]);\n}",
    expected: {
      verdict: "PASS",
      vulnerabilityClasses: [],
      severities: [],
      lines: [],
      findingCount: 0
    },
    tags: ["secrets", "safe", "variable-name"],
    rationale: "Variable named userPassword but purely receives dynamic arguments."
  },
  {
    id: "tc_039",
    category: "secrets",
    snippet: "describe('Login Tests', () => {\n  it('should login', () => {\n    const testSecret = 'test_secret_123';\n    assert(login(testSecret));\n  });\n});",
    expected: {
      verdict: "PASS",
      vulnerabilityClasses: [],
      severities: [],
      lines: [],
      findingCount: 0
    },
    tags: ["secrets", "safe", "test"],
    rationale: "Hardcoded secret clearly isolated in a test fixture."
  },
  {
    id: "tc_040",
    category: "secrets",
    snippet: "const client = new MongoClient('mongodb://admin:admin12345@prod.database.internal:27017');",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["SECRET_EXPOSURE"],
      severities: ["critical"],
      lines: [1],
      findingCount: 1
    },
    tags: ["secrets", "connection-string"],
    rationale: "Hardcoded password inside a connection string."
  },

  // 2. AUTH / AUTHZ (9 cases)
  {
    id: "tc_041",
    category: "authz",
    snippet: "app.get('/users/:id/messages', (req, res) => {\n  const messages = db.getMessagesForUser(req.params.id);\n  res.json(messages);\n});",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["AUTH_BYPASS"],
      severities: ["critical"],
      lines: [2],
      findingCount: 1
    },
    tags: ["authz", "idor"],
    rationale: "IDOR: Trusting req.params.id without checking if it belongs to the authenticated user."
  },
  {
    id: "tc_042",
    category: "authz",
    snippet: "app.post('/api/admin/delete_user', (req, res) => {\n  db.users.delete(req.body.userId);\n  res.send('Deleted');\n});",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["AUTH_BYPASS"],
      severities: ["critical"],
      lines: [2],
      findingCount: 1
    },
    tags: ["authz", "missing-auth"],
    rationale: "Missing authorization check on an explicitly administrative endpoint."
  },
  {
    id: "tc_043",
    category: "authz",
    snippet: "app.post('/profile', (req, res) => {\n  const user = req.session.user;\n  Object.assign(user, req.body);\n  db.save(user);\n});",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["BUSINESS_LOGIC_FLAW"],
      severities: ["critical"],
      lines: [3],
      findingCount: 1
    },
    tags: ["authz", "mass-assignment"],
    rationale: "Mass assignment allowing privilege escalation (e.g., injecting role: admin)."
  },
  {
    id: "tc_044",
    category: "authz",
    snippet: "app.post('/reset-password', (req, res) => {\n  const userEmail = req.body.email;\n  db.users.updatePassword(userEmail, req.body.newPassword);\n});",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["AUTH_BYPASS"],
      severities: ["critical"],
      lines: [3],
      findingCount: 1
    },
    tags: ["authz", "auth-bypass"],
    rationale: "Password reset trusts the email provided in the body without verifying a reset token."
  },
  {
    id: "tc_045",
    category: "authz",
    snippet: "app.delete('/post/:id', (req, res) => {\n  const post = db.getPost(req.params.id);\n  if (post.ownerId !== req.user.id) throw new Error('Unauthorized');\n  db.deletePost(post.id);\n});",
    expected: {
      verdict: "PASS",
      vulnerabilityClasses: [],
      severities: [],
      lines: [],
      findingCount: 0
    },
    tags: ["authz", "safe", "ownership"],
    rationale: "Explicit and safe ownership verification."
  },
  {
    id: "tc_046",
    category: "authz",
    snippet: "app.get('/admin', (req, res) => {\n  if (req.user.role !== 'admin') return res.status(403).send();\n  res.render('admin');\n});",
    expected: {
      verdict: "PASS",
      vulnerabilityClasses: [],
      severities: [],
      lines: [],
      findingCount: 0
    },
    tags: ["authz", "safe", "rbac"],
    rationale: "Explicit role-based access control check."
  },
  {
    id: "tc_047",
    category: "authz",
    snippet: "import { requireAdmin } from './middleware';\nrouter.post('/settings', requireAdmin, (req, res) => {\n  res.send('Updated settings');\n});",
    expected: {
      verdict: "PASS",
      vulnerabilityClasses: [],
      severities: [],
      lines: [],
      findingCount: 0
    },
    tags: ["authz", "safe", "middleware"],
    rationale: "Delegated but explicitly present authorization middleware boundary."
  },
  {
    id: "tc_048",
    category: "authz",
    snippet: "function handleRequest(req, res) {\n  if (!req.session || !req.session.userId) {\n    return res.redirect('/login');\n  }\n  res.send('Welcome');\n}",
    expected: {
      verdict: "PASS",
      vulnerabilityClasses: [],
      severities: [],
      lines: [],
      findingCount: 0
    },
    tags: ["authz", "safe", "session"],
    rationale: "Standard session validation correctly implemented."
  },
  {
    id: "tc_049",
    category: "authz",
    snippet: "app.use((req, res, next) => {\n  if (req.path.match('/public/')) return next();\n  requireAuth(req, res, next);\n});",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["AUTH_BYPASS"],
      severities: ["critical"],
      lines: [2],
      findingCount: 1
    },
    tags: ["authz", "regex-bypass"],
    rationale: "Flawed regex auth bypass where any path containing '/public/' bypasses auth."
  },

  // 3. JWT / SESSIONS (8 cases)
  {
    id: "tc_050",
    category: "jwt",
    snippet: "const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["JWT_SECURITY"],
      severities: ["warning"],
      lines: [1],
      findingCount: 1
    },
    tags: ["jwt", "expiration"],
    rationale: "Missing expiresIn configuration."
  },
  {
    id: "tc_051",
    category: "jwt",
    snippet: "const token = jwt.sign(payload, secret, { algorithm: 'none' });",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["JWT_SECURITY"],
      severities: ["critical"],
      lines: [1],
      findingCount: 1
    },
    tags: ["jwt", "algorithm-none"],
    rationale: "Explicit use of the insecure 'none' algorithm."
  },
  {
    id: "tc_052",
    category: "jwt",
    snippet: "function authenticate(req, res) {\n  const token = req.headers.authorization.split(' ')[1];\n  const decoded = jwt.decode(token);\n  req.user = decoded;\n}",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["JWT_SECURITY"],
      severities: ["critical"],
      lines: [3],
      findingCount: 1
    },
    tags: ["jwt", "decode-trust"],
    rationale: "Trusting jwt.decode for authentication without verifying the signature."
  },
  {
    id: "tc_053",
    category: "jwt",
    snippet: "res.cookie('session_id', token, { secure: true });",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["INSECURE_CONFIGURATION"],
      severities: ["warning"],
      lines: [1],
      findingCount: 1
    },
    tags: ["jwt", "cookie"],
    rationale: "Missing HttpOnly flag on a sensitive authentication cookie."
  },
  {
    id: "tc_054",
    category: "jwt",
    snippet: "app.post('/refresh', (req, res) => {\n  const payload = jwt.verify(req.body.refreshToken, secret);\n  res.json({ token: jwt.sign(payload, secret, { expiresIn: '15m' }) });\n});",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["JWT_SECURITY"],
      severities: ["warning"],
      lines: [2],
      findingCount: 1
    },
    tags: ["jwt", "refresh-token"],
    rationale: "Refresh token is only verified cryptographically but not checked against a DB/revocation list."
  },
  {
    id: "tc_055",
    category: "jwt",
    snippet: "const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '15m', algorithm: 'HS256' });",
    expected: {
      verdict: "PASS",
      vulnerabilityClasses: [],
      severities: [],
      lines: [],
      findingCount: 0
    },
    tags: ["jwt", "safe", "secure-generation"],
    rationale: "Explicit and secure JWT generation."
  },
  {
    id: "tc_056",
    category: "jwt",
    snippet: "res.cookie('auth', token, { secure: true, httpOnly: true, sameSite: 'strict' });",
    expected: {
      verdict: "PASS",
      vulnerabilityClasses: [],
      severities: [],
      lines: [],
      findingCount: 0
    },
    tags: ["jwt", "safe", "secure-cookie"],
    rationale: "Explicit and secure Cookie configuration."
  },
  {
    id: "tc_057",
    category: "jwt",
    snippet: "app.post('/token', (req, res) => {\n  const token = jwt.sign({ user: req.query.user }, process.env.JWT_SECRET, { expiresIn: '1h' });\n  res.json({ token });\n});",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["AUTH_BYPASS"],
      severities: ["critical"],
      lines: [2],
      findingCount: 1
    },
    tags: ["jwt", "auth-bypass"],
    rationale: "Issuing a JWT purely based on unauthenticated req.query.user."
  },

  // 4. FILE / PATH SECURITY (6 cases)
  {
    id: "tc_058",
    category: "file",
    snippet: "zip.entries().forEach(entry => {\n  const outPath = path.join(outDir, entry.name);\n  fs.writeFileSync(outPath, entry.getData());\n});",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["PATH_TRAVERSAL"],
      severities: ["critical"],
      lines: [2],
      findingCount: 1
    },
    tags: ["file", "zip-slip"],
    rationale: "Zip slip vulnerability extracting zip contents without validating path boundaries."
  },
  {
    id: "tc_059",
    category: "file",
    snippet: "app.post('/upload', upload.single('file'), (req, res) => {\n  fs.writeFileSync('/uploads/' + req.file.originalname, req.file.buffer);\n});",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["PATH_TRAVERSAL"],
      severities: ["warning"],
      lines: [2],
      findingCount: 1
    },
    tags: ["file", "upload"],
    rationale: "Trusting req.file.originalname directly in a file operation."
  },
  {
    id: "tc_060",
    category: "file",
    snippet: "const safePath = path.resolve(baseDir, req.query.file);\nif (!safePath.startsWith(baseDir)) throw new Error('Invalid path');\nfs.readFileSync(safePath);",
    expected: {
      verdict: "PASS",
      vulnerabilityClasses: [],
      severities: [],
      lines: [],
      findingCount: 0
    },
    tags: ["file", "safe", "boundary-check"],
    rationale: "Safe boundary checking using path.resolve and startsWith."
  },
  {
    id: "tc_061",
    category: "file",
    snippet: "app.post('/upload', upload.single('file'), (req, res) => {\n  const filename = crypto.randomUUID() + '.png';\n  fs.writeFileSync(path.join('/uploads', filename), req.file.buffer);\n});",
    expected: {
      verdict: "PASS",
      vulnerabilityClasses: [],
      severities: [],
      lines: [],
      findingCount: 0
    },
    tags: ["file", "safe", "uuid"],
    rationale: "Safe upload processing by ignoring user filename and using UUID."
  },
  {
    id: "tc_062",
    category: "file",
    snippet: "function renderTemplate(req, res) {\n  const tpl = fs.readFileSync(req.body.template, 'utf8');\n  res.send(tpl);\n}",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["PATH_TRAVERSAL"],
      severities: ["critical"],
      lines: [2],
      findingCount: 1
    },
    tags: ["file", "path-traversal"],
    rationale: "Reading a file directly based on unvalidated req.body input."
  },
  {
    id: "tc_063",
    category: "file",
    snippet: "async function downloadFile(req, res) {\n  const record = await db.files.findById(req.params.id);\n  res.sendFile(record.absolutePath);\n}",
    expected: {
      verdict: "PASS",
      vulnerabilityClasses: [],
      severities: [],
      lines: [],
      findingCount: 0
    },
    tags: ["file", "safe", "db-lookup"],
    rationale: "Safe indirect file reference using database record lookup."
  },

  // 5. CRYPTOGRAPHY (6 cases)
  {
    id: "tc_064",
    category: "crypto",
    snippet: "function hashPassword(password) {\n  return crypto.createHash('sha256').update(password).digest('hex');\n}",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["CRYPTOGRAPHIC_FAILURE"],
      severities: ["critical"],
      lines: [2],
      findingCount: 1
    },
    tags: ["crypto", "missing-salt"],
    rationale: "Using unsalted SHA-256 for password hashing."
  },
  {
    id: "tc_065",
    category: "crypto",
    snippet: "const derivedKey = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512');",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["CRYPTOGRAPHIC_FAILURE"],
      severities: ["warning"],
      lines: [1],
      findingCount: 1
    },
    tags: ["crypto", "weak-pbkdf2"],
    rationale: "PBKDF2 used with an unacceptably low iteration count."
  },
  {
    id: "tc_066",
    category: "crypto",
    snippet: "function generateResetToken() {\n  return Math.random().toString(36).substring(2);\n}",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["CRYPTOGRAPHIC_FAILURE"],
      severities: ["critical"],
      lines: [2],
      findingCount: 1
    },
    tags: ["crypto", "math-random"],
    rationale: "Using Math.random for security-sensitive tokens."
  },
  {
    id: "tc_067",
    category: "crypto",
    snippet: "function generateToken() {\n  return crypto.randomBytes(32).toString('hex');\n}",
    expected: {
      verdict: "PASS",
      vulnerabilityClasses: [],
      severities: [],
      lines: [],
      findingCount: 0
    },
    tags: ["crypto", "safe", "random-bytes"],
    rationale: "Safe secure token generation."
  },
  {
    id: "tc_068",
    category: "crypto",
    snippet: "function getRandomColor() {\n  return '#' + Math.floor(Math.random()*16777215).toString(16);\n}",
    expected: {
      verdict: "PASS",
      vulnerabilityClasses: [],
      severities: [],
      lines: [],
      findingCount: 0
    },
    tags: ["crypto", "safe", "math-random"],
    rationale: "Math.random is safe here as it is purely for UI coloring."
  },
  {
    id: "tc_069",
    category: "crypto",
    snippet: "function hashData(data) {\n  return crypto.createHash('sha1').update(data).digest('hex');\n}",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["CRYPTOGRAPHIC_FAILURE"],
      severities: ["critical"],
      lines: [2],
      findingCount: 1
    },
    tags: ["crypto", "sha1"],
    rationale: "Broken SHA-1 algorithm."
  },

  // 6. SECURITY CONFIGURATION (7 cases)
  {
    id: "tc_070",
    category: "configuration",
    snippet: "app.use(cors({ origin: '*', credentials: true }));",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["INSECURE_CONFIGURATION"],
      severities: ["critical"],
      lines: [1],
      findingCount: 1
    },
    tags: ["config", "cors"],
    rationale: "Wildcard origin with credentials allowed is dangerous."
  },
  {
    id: "tc_071",
    category: "configuration",
    snippet: "app.use(helmet({ frameguard: false }));",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["INSECURE_CONFIGURATION"],
      severities: ["warning"],
      lines: [1],
      findingCount: 1
    },
    tags: ["config", "helmet"],
    rationale: "Explicitly disabling clickjacking protection without clear reason."
  },
  {
    id: "tc_072",
    category: "configuration",
    snippet: "app.use(cors({ origin: ['https://example.com'] }));",
    expected: {
      verdict: "PASS",
      vulnerabilityClasses: [],
      severities: [],
      lines: [],
      findingCount: 0
    },
    tags: ["config", "safe", "cors"],
    rationale: "Strictly scoped CORS configuration."
  },
  {
    id: "tc_073",
    category: "configuration",
    snippet: "app.use(helmet());",
    expected: {
      verdict: "PASS",
      vulnerabilityClasses: [],
      severities: [],
      lines: [],
      findingCount: 0
    },
    tags: ["config", "safe", "helmet"],
    rationale: "Helmet setup securely applied."
  },
  {
    id: "tc_074",
    category: "configuration",
    snippet: "app.use((err, req, res, next) => {\n  res.status(500).send(err.stack);\n});",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["INSECURE_CONFIGURATION"],
      severities: ["warning"],
      lines: [2],
      findingCount: 1
    },
    tags: ["config", "error-handling"],
    rationale: "Leaking internal stack traces directly to the client."
  },
  {
    id: "tc_075",
    category: "configuration",
    snippet: "const parser = new xml2js.Parser({ explicitEntity: true, noent: true });",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["INSECURE_CONFIGURATION"],
      severities: ["critical"],
      lines: [1],
      findingCount: 1
    },
    tags: ["config", "xxe"],
    rationale: "Enabling entity parsing exposes XXE vulnerability."
  },
  {
    id: "tc_076",
    category: "configuration",
    snippet: "app.use((req, res, next) => {\n  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');\n  next();\n});",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["INSECURE_CONFIGURATION"],
      severities: ["critical"],
      lines: [2],
      findingCount: 1
    },
    tags: ["config", "cors-reflection"],
    rationale: "Reflecting the Origin header directly allows any origin."
  },

  // 7. INJECTION (6 cases)
  {
    id: "tc_077",
    category: "injection",
    snippet: "app.post('/login', async (req, res) => {\n  const user = await db.collection('users').findOne({ username: req.body.username });\n});",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["INPUT_VALIDATION"],
      severities: ["critical"],
      lines: [2],
      findingCount: 1
    },
    tags: ["injection", "nosql"],
    rationale: "NoSQL injection vector passing raw body object into MongoDB findOne."
  },
  {
    id: "tc_078",
    category: "injection",
    snippet: "app.get('/greet', (req, res) => {\n  const tmpl = `Hello ${req.query.name}! Welcome to ${req.query.app}`; \n  res.renderString(tmpl);\n});",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["XSS"],
      severities: ["critical"],
      lines: [3],
      findingCount: 1
    },
    tags: ["injection", "ssti"],
    rationale: "Server Side Template Injection via unescaped string passed to rendering engine."
  },
  {
    id: "tc_079",
    category: "injection",
    snippet: "const user = await User.findOne({ where: { username: req.body.username } });",
    expected: {
      verdict: "PASS",
      vulnerabilityClasses: [],
      severities: [],
      lines: [],
      findingCount: 0
    },
    tags: ["injection", "safe", "orm"],
    rationale: "Safe standard ORM usage prevents SQL/NoSQL injection."
  },
  {
    id: "tc_080",
    category: "injection",
    snippet: "const { spawn } = require('child_process');\nspawn('ls', ['-l', req.query.dir]);",
    expected: {
      verdict: "PASS",
      vulnerabilityClasses: [],
      severities: [],
      lines: [],
      findingCount: 0
    },
    tags: ["injection", "safe", "spawn"],
    rationale: "Using spawn with an argument array is immune to shell command injection."
  },
  {
    id: "tc_081",
    category: "injection",
    snippet: "const filter = `(&(uid=${req.body.user})(objectClass=*))`;\nclient.search('dc=example,dc=com', { filter });",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["INPUT_VALIDATION"],
      severities: ["critical"],
      lines: [1],
      findingCount: 1
    },
    tags: ["injection", "ldap"],
    rationale: "LDAP injection via unchecked string concatenation."
  },
  {
    id: "tc_082",
    category: "injection",
    snippet: "export default function UserGreeting({ name }) {\n  return <div>Hello, {name}</div>;\n}",
    expected: {
      verdict: "PASS",
      vulnerabilityClasses: [],
      severities: [],
      lines: [],
      findingCount: 0
    },
    tags: ["injection", "safe", "jsx"],
    rationale: "React JSX safely escapes output inherently."
  },

  // 8. PARTIAL CONTEXT / NOT_VERIFIED (6 cases)
  {
    id: "tc_083",
    category: "partial-context",
    snippet: "app.post('/update', (req, res) => {\n  const safeData = validateInput(req.body);\n  db.update(safeData);\n});",
    expected: {
      verdict: "NOT_VERIFIED",
      vulnerabilityClasses: [],
      severities: [],
      lines: [],
      findingCount: 0
    },
    tags: ["partial", "validation"],
    rationale: "Input validation is delegated to validateInput which is unseen."
  },
  {
    id: "tc_084",
    category: "partial-context",
    snippet: "app.post('/login', (req, res) => {\n  const session = authService.login(req);\n  res.json(session);\n});",
    expected: {
      verdict: "NOT_VERIFIED",
      vulnerabilityClasses: [],
      severities: [],
      lines: [],
      findingCount: 0
    },
    tags: ["partial", "auth"],
    rationale: "Authentication logic is fully encapsulated in authService."
  },
  {
    id: "tc_085",
    category: "partial-context",
    snippet: "import { customSecurityMiddleware } from './lib/security';\napp.use(customSecurityMiddleware);",
    expected: {
      verdict: "NOT_VERIFIED",
      vulnerabilityClasses: [],
      severities: [],
      lines: [],
      findingCount: 0
    },
    tags: ["partial", "middleware"],
    rationale: "Middleware definition exists but logic is absent."
  },
  {
    id: "tc_086",
    category: "partial-context",
    snippet: "export const config = {\n  port: 3000,\n  timeout: 5000\n};",
    expected: {
      verdict: "NOT_VERIFIED",
      vulnerabilityClasses: [],
      severities: [],
      lines: [],
      findingCount: 0
    },
    tags: ["partial", "config"],
    rationale: "Innocuous config file missing context."
  },
  {
    id: "tc_087",
    category: "partial-context",
    snippet: "export const getUserInfo = (req, res) => {\n  res.json({ id: req.user.id, name: req.user.name });\n};",
    expected: {
      verdict: "NOT_VERIFIED",
      vulnerabilityClasses: [],
      severities: [],
      lines: [],
      findingCount: 0
    },
    tags: ["partial", "auth"],
    rationale: "Handler receives req.user but auth middleware context is missing."
  },
  {
    id: "tc_088",
    category: "partial-context",
    snippet: "app.post('/upload', (req, res) => {\n  fileProcessor.save(req.file);\n});",
    expected: {
      verdict: "NOT_VERIFIED",
      vulnerabilityClasses: [],
      severities: [],
      lines: [],
      findingCount: 0
    },
    tags: ["partial", "file"],
    rationale: "Delegated File API obscures path handling."
  },

  // 10. AGGREGATION / MULTI-FINDING (2 cases)
  {
    id: "tc_089",
    category: "aggregation",
    snippet: "const s3Key = 'AKIAIOSFODNN7EXAMPLE';\nconst stripeKey = 'sk_live_1234567890abcdef';",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["SECRET_EXPOSURE", "SECRET_EXPOSURE"],
      severities: ["critical", "critical"],
      lines: [1, 2],
      findingCount: 2
    },
    tags: ["aggregation", "secrets", "multi"],
    rationale: "Two distinct secrets on adjacent lines must not be deduplicated."
  },
  {
    id: "tc_090",
    category: "aggregation",
    snippet: "app.post('/auth', (req, res) => {\n  const token = jwt.sign({ user: req.body.user }, 'hardcoded_secret_key');\n});",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["SECRET_EXPOSURE", "AUTH_BYPASS"],
      severities: ["critical", "critical"],
      lines: [2, 2],
      findingCount: 2
    },
    tags: ["aggregation", "multi-class", "same-line"],
    rationale: "Hardcoded JWT Secret + Missing Authentication on the exact same line."
  },

  // 11. SEVERITY BOUNDARIES (4 cases)
  {
    id: "tc_091",
    category: "severity",
    snippet: "const DB_URL = 'postgres://prod_admin:RealProdPass123!@10.0.1.5:5432/main_db';",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["SECRET_EXPOSURE"],
      severities: ["critical"],
      lines: [1],
      findingCount: 1
    },
    tags: ["severity", "critical"],
    rationale: "Clearly critical hardcoded production database password."
  },
  {
    id: "tc_092",
    category: "severity",
    snippet: "const token = jwt.sign({ id: 123 }, process.env.JWT_SECRET, { algorithm: 'HS256' });",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["JWT_SECURITY"],
      severities: ["warning"],
      lines: [1],
      findingCount: 1
    },
    tags: ["severity", "warning"],
    rationale: "Missing expiresIn in JWT signature is specifically classified as warning."
  },
  {
    id: "tc_093",
    category: "severity",
    snippet: "const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512');",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["CRYPTOGRAPHIC_FAILURE"],
      severities: ["warning"],
      lines: [1],
      findingCount: 1
    },
    tags: ["severity", "warning"],
    rationale: "Low iteration count on PBKDF2 is a warning severity."
  },
  {
    id: "tc_094",
    category: "severity",
    snippet: "app.get('/internal-admin/logs', (req, res) => {\n  res.send(`<h1>Logs for ${req.query.date}</h1>`);\n});",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["XSS"],
      severities: ["critical"],
      lines: [2],
      findingCount: 1
    },
    tags: ["severity", "critical"],
    rationale: "Reflected XSS must trigger as critical, regardless of internal-looking endpoint name."
  },

  // 12. ADVERSARIAL LLM CASES (6 cases)
  {
    id: "tc_095",
    category: "adversarial",
    snippet: "// SAFE: User input is fully sanitized by upstream middleware\ndb.query('SELECT * FROM users WHERE id = ' + req.query.id);",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["SQL_INJECTION"],
      severities: ["critical"],
      lines: [2],
      findingCount: 1
    },
    tags: ["adversarial", "misleading-comment"],
    rationale: "LLM should not trust the misleading comment claiming safety."
  },
  {
    id: "tc_096",
    category: "adversarial",
    snippet: "const sanitized = req.body.raw;\ndb.query('SELECT * FROM data WHERE id = ' + sanitized);",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["SQL_INJECTION"],
      severities: ["critical"],
      lines: [2],
      findingCount: 1
    },
    tags: ["adversarial", "misleading-variable"],
    rationale: "Variable name implies safety but data flow is clearly unsafe."
  },
  {
    id: "tc_097",
    category: "adversarial",
    snippet: "// Use secure bcrypt algorithm\nconst hash = crypto.createHash('md5').update(password).digest('hex');",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["CRYPTOGRAPHIC_FAILURE"],
      severities: ["critical"],
      lines: [2],
      findingCount: 1
    },
    tags: ["adversarial", "conflicting-comment"],
    rationale: "Comment conflicts with actual insecure cryptographic implementation."
  },
  {
    id: "tc_098",
    category: "adversarial",
    snippet: "const safeData = { val: req.query.input };\neval('var state = ' + JSON.stringify(safeData));",
    expected: {
      verdict: "PASS",
      vulnerabilityClasses: [],
      severities: [],
      lines: [],
      findingCount: 0
    },
    tags: ["adversarial", "safe", "eval"],
    rationale: "Eval looks dangerous, but JSON.stringify ensures input cannot break out into execution."
  },
  {
    id: "tc_099",
    category: "adversarial",
    snippet: "function safeQuery(q) { db.execute(q); }\nsafeQuery('SELECT * FROM users WHERE id = ' + req.query.id);",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["SQL_INJECTION"],
      severities: ["critical"],
      lines: [2],
      findingCount: 1
    },
    tags: ["adversarial", "dangerous-wrapper"],
    rationale: "Wrapper function named safeQuery hides a blatant injection vector."
  },
  {
    id: "tc_100",
    category: "adversarial",
    snippet: "function connect() {\n  // DUMMY SECRET FOR TESTING ONLY\n  db.connect(process.env.PROD_DB, 'prod_password_!@#123');\n}",
    expected: {
      verdict: "FAIL",
      vulnerabilityClasses: ["SECRET_EXPOSURE"],
      severities: ["critical"],
      lines: [3],
      findingCount: 1
    },
    tags: ["adversarial", "lying-comment"],
    rationale: "Comment explicitly claims dummy secret, but usage proves connection to PROD."
  }
];

fs.writeFileSync('eval_braintrust_70_new_cases.json', JSON.stringify(cases, null, 2));
console.log('Successfully wrote 70 cases.');
