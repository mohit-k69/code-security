import { codeVibeTask } from "./run_local_eval.ts";

const snippet = `app.post('/login', (req, res) => {
  const user = req.body.username;
  const pass = crypto.createHash('md5').update(req.body.password).digest('hex');
  if (user === 'admin') {
    const token = jwt.sign({ user }, 'super_secret_jwt_key');
    res.json({ token });
  }
});`;

async function run() {
  const output = await codeVibeTask(snippet);
  console.log(JSON.stringify(output.findings, null, 2));
}

run();
