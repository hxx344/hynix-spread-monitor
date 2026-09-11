import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readdir, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const directory = await mkdtemp(join(tmpdir(), "hynix-linux-smoke-"));
const probe = createServer();
await new Promise(accept => probe.listen(0, "127.0.0.1", accept));
const port = probe.address().port;
await new Promise(accept => probe.close(accept));
const base = `http://127.0.0.1:${port}`;
const headers = { Authorization: `Basic ${Buffer.from("admin:smoke-test-password").toString("base64")}` };
let child, exited, output = "";
function start() {
  child = spawn(process.execPath, ["--experimental-strip-types", "server/linux.mjs"], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: "production", HOST: "127.0.0.1", PORT: String(port), APP_USERNAME: "admin", APP_PASSWORD: "smoke-test-password", ALERT_DATA_DIR: directory }, stdio: ["ignore", "pipe", "pipe"] });
  for (const stream of [child.stdout, child.stderr]) stream.on("data", data => { output = (output + data.toString()).slice(-16000); });
  exited = new Promise(accept => child.once("exit", accept));
}
async function stop() {
  if (child && child.exitCode === null) child.kill("SIGTERM");
  if (exited) await exited;
}
async function ready() {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Server exited during startup: ${output}`);
    try { if ((await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(1000) })).ok) return; } catch {}
    await delay(250);
  }
  throw new Error(`Server did not become ready: ${output}`);
}
async function state() { return fetch(`${base}/api/alerts`, { headers }).then(response => response.json()); }
try {
  start(); await ready();
  assert.equal((await fetch(base)).status, 401);
  const page = await fetch(base, { headers });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /飞书阈值告警/);
  const initial = await state();
  assert.equal(initial.available, true); assert.equal(initial.config.enabled, false);
  const updated = await fetch(`${base}/api/alerts`, { method: "PUT", headers: { ...headers, "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ enabled: false, cooldownSeconds: 60, hysteresis: 0.5, revision: initial.revision, rules: [{ id: "smoke-above", name: "smoke-above", enabled: true, direction: "above", threshold: 40 }, { id: "smoke-below", name: "smoke-below", enabled: true, direction: "below", threshold: 20 }] }) });
  assert.equal(updated.status, 200);
  let firstCheck = (await state()).status.checkedAt, secondCheck;
  for (let i = 0; i < 70; i++) {
    const current = (await state()).status.checkedAt;
    if (firstCheck && current && current !== firstCheck) { secondCheck = current; break; }
    firstCheck ??= current;
    await delay(500);
  }
  assert.ok(firstCheck && secondCheck, "Background monitor must continue checking without a browser");
  const quoteStatus = (await fetch(`${base}/api/quote`, { headers })).status;
  assert.ok([200, 503].includes(quoteStatus));
  await stop(); start(); await ready();
  const restarted = await state();
  assert.equal(restarted.config.rules.length, 2); assert.equal(restarted.revision, 1);
  console.log(JSON.stringify({ platform: process.platform, node: process.version, page: 200, authentication: "passed", configuration: "persisted across restart", backgroundChecks: [firstCheck, secondCheck], quoteStatus, feishuMessagesSent: 0 }));
} finally {
  await stop();
  const absolute = resolve(directory);
  assert.ok(absolute.startsWith(resolve(tmpdir()) + sep + "hynix-linux-smoke-"));
  for (const file of await readdir(absolute)) await unlink(join(absolute, file));
  await rmdir(absolute);
}
