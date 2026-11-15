/* An admin hands a routine to another profile: only an admin can, the person fetches it as their
   own, the same plan sent again replaces it, taking it back removes it, and the admin's view of
   the person shows whether they trained it. Real server.js in a child. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = crypto.randomBytes(32).toString('hex');
const ADMIN = 'u_adm_p', USER = 'u_usr_p';
const mint = uid => {
  const payload = `${uid}:${Date.now() + 86400000}:0`;
  return payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
};
const as = uid => ({ Cookie: `gymsid=${mint(uid)}`, 'Content-Type': 'application/json' });

async function start(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-assigned-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  const now = new Date().toISOString();
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({
    users: [{ id: ADMIN, name: 'Boss', created: now, admin: true }, { id: USER, name: 'Sam', created: now }], creds: [], subs: [], invites: []
  }));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN: 'http://localhost:8080', RP_ID: 'localhost', ADMIN_UIDS: ADMIN, TRUST_PROXY: '1' }
  });
  let log = '';
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const port = await boundPort(child, () => log);
  let n = 0;
  const call = async (method, p, body, headers) => {
    const r = await fetch(`http://127.0.0.1:${port}${p}`, {
      method, headers: { 'X-Forwarded-For': `198.51.100.${++n % 250 + 1}`, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  return { call, dataDir };
}

const plan = name => ({ id: USER, routine: { id: 'mine', name, emoji: 'figureStrength', ex: [{ id: 'bench' }, { id: 'squat' }] }, customEx: [] });

test('assign, fetch, update, report, take back', async t => {
  const h = await start(t);
  // Not an admin, not signed in.
  assert.equal((await h.call('POST', '/api/admin/user/plan', plan('Push'), as(USER))).status, 403);
  assert.equal((await h.call('GET', '/api/assigned')).status, 401);
  assert.equal((await h.call('POST', '/api/admin/user/plan', { ...plan('Push'), id: 'nobody' }, as(ADMIN))).status, 404);
  assert.equal((await h.call('POST', '/api/admin/user/plan', { id: USER, routine: { name: 'x', ex: [] } }, as(ADMIN))).status, 400);

  const a = await h.call('POST', '/api/admin/user/plan', plan('Push'), as(ADMIN));
  assert.equal(a.status, 200);
  const got = await h.call('GET', '/api/assigned', undefined, as(USER));
  assert.equal(got.body.plans.length, 1);
  assert.equal(got.body.plans[0].routine.id, 'a-' + a.body.aid);
  assert.equal(got.body.plans[0].by, 'Boss');
  assert.deepEqual((await h.call('GET', '/api/assigned', undefined, as(ADMIN))).body.plans, []);

  // Updating keeps the same plan, with a new name.
  const u = await h.call('POST', '/api/admin/user/plan', { ...plan('Push v2'), aid: a.body.aid }, as(ADMIN));
  assert.equal(u.body.aid, a.body.aid);
  const after = (await h.call('GET', '/api/assigned', undefined, as(USER))).body.plans;
  assert.equal(after.length, 1);
  assert.equal(after[0].routine.name, 'Push v2');

  // The admin's view: not trained yet, then one workout with it.
  let d = await h.call('GET', `/api/admin/user?id=${USER}`, undefined, as(ADMIN));
  assert.equal(d.body.assigned[0].sessions, 0);
  const day = new Date().toISOString().slice(0, 10);
  const put = await h.call('PUT', '/api/data', { state: { workouts: [{ id: 'w1', d: day, routineId: 'a-' + a.body.aid, entries: [] }] } }, as(USER));
  assert.equal(put.status, 200);
  d = await h.call('GET', `/api/admin/user?id=${USER}`, undefined, as(ADMIN));
  assert.equal(d.body.assigned[0].sessions, 1);
  assert.equal(d.body.assigned[0].lastTrained, day);

  // Taking it back.
  assert.equal((await h.call('POST', '/api/admin/user/plan/remove', { id: USER, aid: 'nope' }, as(ADMIN))).status, 404);
  assert.equal((await h.call('POST', '/api/admin/user/plan/remove', { id: USER, aid: a.body.aid }, as(ADMIN))).status, 200);
  assert.deepEqual((await h.call('GET', '/api/assigned', undefined, as(USER))).body.plans, []);
});
