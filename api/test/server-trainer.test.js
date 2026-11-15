/* Trainers on a real server.js in a child (docs/dev/trainers.md, tests 5 to 26). The point of the
   whole file is isolation: a trainer reaches their own trainees and nothing else, whatever they
   send, and loses that reach the moment the relationship or their role changes.

   Cast: Admin; trainers T1 (Tara) and T2 (Tom); A is T1's trainee, B is T2's, C has no trainer;
   T3 is a trainer whose access has ended, with trainee D. */
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
const ADMIN = 'u_adm_t', T1 = 'u_tr1_t', T2 = 'u_tr2_t', T3 = 'u_tr3_t', A = 'u_aaa_t', B = 'u_bbb_t', C = 'u_ccc_t', D = 'u_ddd_t';
const PW = 'correct horse battery 1';
const token = uid => {
  const payload = `${uid}:${Date.now() + 86400000}:0`;
  return payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
};
const as = uid => ({ Cookie: `gymsid=${token(uid)}`, 'Content-Type': 'application/json' });
const bearer = uid => ({ Authorization: `Bearer ${token(uid)}`, 'Content-Type': 'application/json' });
const day = new Date().toISOString().slice(0, 10);

const stateOf = name => ({
  _ts: 1700000000000, unit: 'kg', lengthUnit: 'cm',
  routines: [{ id: 'r1', name: name + ' routine', emoji: 'x', ex: [{ id: 'bench' }] }],
  workouts: [{ id: 'w-' + name, d: day, start: 1, end: 2, entries: [{ id: 'bench', sets: [{ w: 60, r: 5 }] }], media: [{ hash: 'f'.repeat(64) }], hr: { avg: 150 } }],
  bodyweight: [{ d: day, w: 81.5, t: 1 }],
  measurements: [{ d: day, t: 1, waist: 84, bodyFat: 19.9, photo: { hash: 'e'.repeat(64) } }],
  coach: { chats: [`${name}-private-chat`] }
});

async function start(t, env = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-trainer-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  const now = new Date().toISOString();
  const u = (id, name, more = {}) => ({ id, name, created: now, adult: now, ...more });
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({
    users: [
      u(ADMIN, 'Boss', { admin: true }),
      u(T1, 'Tara', { trainer: true }),
      u(T2, 'Tom', { trainer: true }),
      u(T3, 'Theo', { trainer: true, expiresAt: '2020-01-01T00:00:00.000Z' }),
      u(A, 'Ann', { trainerId: T1, trainerAck: T1, email: 'ann@example.org' }),
      u(B, 'Bob', { trainerId: T2, trainerAck: T2, email: 'bob@example.org' }),
      u(C, 'Cy'),
      u(D, 'Dee', { trainerId: T3, trainerAck: T3 })
    ],
    creds: [], subs: [], invites: []
  }));
  for (const [id, name] of [[A, 'Ann'], [B, 'Bob'], [C, 'Cy']]) fs.writeFileSync(path.join(dataDir, `state-${id}.json`), JSON.stringify(stateOf(name)));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN: 'http://localhost:8080', RP_ID: 'localhost', ADMIN_UIDS: ADMIN, TRUST_PROXY: '1', INVITE_ONLY: '1', PASSWORD_LOGIN: '1', ...env }
  });
  let log = '';
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const port = await boundPort(child, () => log);
  let n = 0;
  // The raw answer: status and the body exactly as sent, so two refusals can be compared byte for byte.
  const raw = async (method, p, body, headers) => {
    const r = await fetch(`http://127.0.0.1:${port}${p}`, {
      method, headers: { 'X-Forwarded-For': `198.51.100.${++n % 250 + 1}`, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: r.status, text: await r.text() };
  };
  const call = async (...a) => { const r = await raw(...a); let body = {}; try { body = JSON.parse(r.text); } catch { /* not json */ } return { status: r.status, body }; };
  const db = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8'));
  const user = id => db().users.find(x => x.id === id);
  const byName = name => db().users.find(x => x.name === name);
  const signUp = (body, extra = {}) => call('POST', '/api/register/password', { adult: true, password: PW, ...body, ...extra }, { 'Content-Type': 'application/json' });
  return { raw, call, db, user, byName, signUp, log: () => log };
}

const plan = (id, name = 'Push', more = {}) => ({ id, routine: { id: 'mine', name, emoji: 'figureStrength', ex: [{ id: 'bench' }, { id: 'squat' }] }, customEx: [], ...more });
const NOT_FOUND = '{"error":"not found"}';

/** "METHOD /path" for every operation in openapi.yaml whose path starts with `prefix`. */
function documented(prefix) {
  const out = [];
  let current = null;
  for (const line of fs.readFileSync(path.join(API, 'openapi.yaml'), 'utf8').split('\n')) {
    const p = /^ {2}(\/[^:]*):/.exec(line);
    if (p) { current = p[1]; continue; }
    const m = /^ {4}(get|post|put|delete):/.exec(line);
    if (m && current && current.startsWith(prefix)) out.push([m[1].toUpperCase(), current]);
  }
  return out;
}
// A request for a documented route about the profile `id`: in the query for a GET, in the body otherwise.
const ask = (h, [method, p], id, headers) => (method === 'GET'
  ? h.raw('GET', `${p}?id=${encodeURIComponent(id)}`, undefined, headers)
  : h.raw(method, p, plan(id, 'Sweep', { aid: 'x', code: 'x' }), headers));
const TRAINEE_ROUTES = () => documented('/api/trainer/trainee').filter(([, p]) => p === '/api/trainer/trainee' || p.startsWith('/api/trainer/trainee/'));
const TRAINER_ONLY = () => documented('/api/trainer/').filter(([, p]) => !['/api/trainer/ack', '/api/trainer/leave'].includes(p));

test('5 to 8, 12. a trainer reaches their own trainees and invites, and nobody else\'s', async t => {
  const h = await start(t);
  // Something of B's to protect: a plan from the admin.
  const given = await h.call('POST', '/api/admin/user/plan', plan(B, 'Bob plan'), as(ADMIN));
  assert.equal(given.status, 200);
  const before = JSON.stringify([h.user(B), h.db().assigned[B], h.user(A)]);

  // 5. Someone else's trainee is answered exactly like an id that does not exist.
  const none = await h.raw('GET', '/api/trainer/trainee?id=nobody-at-all', undefined, as(T1));
  assert.deepEqual(none, { status: 404, text: NOT_FOUND });
  for (const id of [B, C, D, ADMIN, T2, T1, '', '../' + A, A + ' ', A.toUpperCase()]) {
    assert.deepEqual(await h.raw('GET', `/api/trainer/trainee?id=${encodeURIComponent(id)}`, undefined, as(T1)), none, `id ${id}`);
  }
  assert.deepEqual(await h.raw('GET', '/api/trainer/trainee', undefined, as(T1)), none, 'no id at all');
  assert.deepEqual(await h.raw('GET', `/api/trainer/trainee?id=${A}&id=${B}`, undefined, as(T2)), none, 'two ids: the first decides, and it is not theirs');
  // Their own trainee: the allow-list and nothing else.
  const mine = await h.call('GET', `/api/trainer/trainee?id=${A}`, undefined, as(T1));
  assert.equal(mine.status, 200);
  assert.deepEqual(Object.keys(mine.body), ['user', 'unit', 'lengthUnit', 'lastSync', 'lastWorkout', 'routines', 'assigned', 'workouts', 'bodyweight', 'measurements']);
  assert.deepEqual(Object.keys(mine.body.user), ['id', 'name', 'created', 'expiresAt']);
  assert.equal(mine.body.workouts[0].id, 'w-Ann');
  assert.deepEqual(mine.body.bodyweight, [{ d: day, w: 81.5, t: 1 }]);
  assert.deepEqual(mine.body.measurements, [{ d: day, t: 1, waist: 84, bodyFat: 19.9, other: [] }]);
  const flat = JSON.stringify(mine.body);
  for (const leak of ['ann@example.org', 'private-chat', 'f'.repeat(64), 'e'.repeat(64), '"hr"', 'trainerAck', T1]) assert.ok(!flat.includes(leak), `leaks ${leak}`);
  // The same through a paired phone's token.
  assert.equal((await h.call('GET', `/api/trainer/trainee?id=${A}`, undefined, bearer(T1))).status, 200);
  assert.deepEqual(await h.raw('GET', `/api/trainer/trainee?id=${B}`, undefined, bearer(T1)), none);

  // 6. Plan assign, plan remove and release on someone else's trainee: 404, nothing changed.
  assert.deepEqual(await h.raw('POST', '/api/trainer/trainee/plan', plan(B), as(T1)), none);
  assert.deepEqual(await h.raw('POST', '/api/trainer/trainee/plan', plan(B, 'Hijack', { aid: given.body.aid }), as(T1)), none);
  assert.deepEqual(await h.raw('POST', '/api/trainer/trainee/plan/remove', { id: B, aid: given.body.aid }, as(T1)), none);
  assert.deepEqual(await h.raw('POST', '/api/trainer/trainee/release', { id: B }, as(T1)), none);
  // An id that is not a plain string never matches anyone.
  for (const id of [[A], { id: A }, 7, null, true]) assert.deepEqual(await h.raw('POST', '/api/trainer/trainee/release', { id }, as(T2)), none);
  assert.equal(JSON.stringify([h.user(B), h.db().assigned[B], h.user(A)]), before);
  assert.equal((await h.call('GET', '/api/assigned', undefined, as(B))).body.plans[0].routine.name, 'Bob plan');

  // 12. The sweep: every documented route about one trainee refuses another trainer, so a route
  // added later without the guard fails here without anyone writing a case for it.
  const routes = TRAINEE_ROUTES();
  assert.ok(routes.length >= 4, `only ${routes.length} trainee routes found in openapi.yaml`);
  for (const r of routes) assert.deepEqual(await ask(h, r, A, as(T2)), none, `${r.join(' ')} as another trainer`);
  for (const r of routes) assert.deepEqual(await ask(h, r, A, as(ADMIN)), none, `${r.join(' ')} as an admin who is no trainer`);
  for (const r of routes) assert.deepEqual(await ask(h, r, A, as(A)), none, `${r.join(' ')} as the trainee`);
  assert.equal(JSON.stringify([h.user(B), h.db().assigned[B], h.user(A)]), before);
  assert.equal(h.db().assigned[A], undefined);
  // Not vacuous: the GET does answer the trainer it belongs to.
  assert.equal((await ask(h, ['GET', '/api/trainer/trainee'], A, as(T1))).status, 200);

  // 7. The list is theirs alone.
  const l1 = await h.call('GET', '/api/trainer/trainees', undefined, as(T1));
  assert.deepEqual(l1.body.trainees.map(x => x.id), [A]);
  assert.deepEqual(Object.keys(l1.body.trainees[0]), ['id', 'name', 'plans', 'lastWorkout', 'lastSync', 'expiresAt']);
  assert.deepEqual((await h.call('GET', '/api/trainer/trainees', undefined, as(T2))).body.trainees.map(x => x.id), [B]);
  const i1 = await h.call('POST', '/api/trainer/invites/new', { name: 'For T1' }, as(T1));
  const i2 = await h.call('POST', '/api/trainer/invites/new', { name: 'For T2' }, as(T2));
  await h.call('POST', '/api/admin/invites/new', { name: 'Admin for T2', trainerId: T2 }, as(ADMIN));
  await h.call('POST', '/api/admin/invites/new', { name: 'Plain' }, as(ADMIN));
  assert.equal(i1.status, 200);
  assert.deepEqual(Object.keys(i1.body.invite), ['code', 'name', 'created', 'used', 'usedAt']);
  const mineInv = await h.call('GET', '/api/trainer/invites', undefined, as(T1));
  assert.deepEqual(mineInv.body.invites.map(i => i.name), ['For T1']);
  assert.equal(mineInv.body.max, 25);
  assert.deepEqual((await h.call('GET', '/api/trainer/invites', undefined, as(T2))).body.invites.map(i => i.name), ['For T2']);

  // 8. Revoking another trainer's code: the answer for a code that does not exist, and it stays.
  const noCode = await h.raw('POST', '/api/trainer/invites/revoke', { code: 'NOSUCHCODE' }, as(T1));
  assert.equal(noCode.status, 404);
  assert.deepEqual(await h.raw('POST', '/api/trainer/invites/revoke', { code: i2.body.invite.code }, as(T1)), noCode);
  const adminCode = h.db().invites.find(i => i.name === 'Admin for T2').code;
  assert.deepEqual(await h.raw('POST', '/api/trainer/invites/revoke', { code: adminCode }, as(T2)), noCode, 'an admin\'s invite is not the trainer\'s to revoke');
  assert.equal(h.db().invites.length, 4);
  assert.equal((await h.call('POST', '/api/trainer/invites/revoke', { code: i1.body.invite.code.toLowerCase() }, as(T1))).status, 200);
  assert.deepEqual(h.db().invites.map(i => i.name), ['For T2', 'Admin for T2', 'Plain']);

  // A refusal for a real profile that is someone else's is in the activity log.
  const log = await h.call('GET', '/api/admin/audit', undefined, as(ADMIN));
  const denied = (log.body.events || log.body.rows || []).filter(e => e.ev === 'trainer.denied');
  assert.ok(denied.some(e => e.uid === T1 && e.tgt === B), 'trainer.denied for T1 on B');
  assert.ok(!denied.some(e => e.tgt === 'nobody-at-all'));
});

test('9 to 11. roles: a trainer is no admin, a trainee is no trainer, nobody is anybody without a session', async t => {
  const h = await start(t);
  // 9. Every admin route refuses a trainer.
  const admin = documented('/api/admin/');
  assert.ok(admin.length >= 20, `only ${admin.length} admin routes found in openapi.yaml`);
  for (const [method, p] of admin) {
    const r = await (method === 'GET' ? h.call('GET', `${p}?id=${A}`, undefined, as(T1)) : h.call(method, p, { id: A, ids: [A], trainerId: T1, trainer: true, admin: true, months: null, code: 'X' }, as(T1)));
    assert.equal(r.status, 403, `${method} ${p} as a trainer`);
  }
  assert.equal(h.user(T1).admin, undefined);
  assert.equal(h.user(A).trainerId, T1);
  assert.equal(h.db().invites.length, 0);

  // 10. A trainee, someone with no trainer and an admin who is not a trainer: every trainer route
  // answers as if it were not there.
  const trainerOnly = TRAINER_ONLY();
  assert.ok(trainerOnly.length >= 8, `only ${trainerOnly.length} trainer routes found in openapi.yaml`);
  for (const who of [A, C, ADMIN]) {
    for (const r of trainerOnly) {
      for (const id of [B, who, A]) assert.deepEqual(await ask(h, r, id, as(who)), { status: 404, text: NOT_FOUND }, `${r.join(' ')} as ${who} about ${id}`);
    }
  }
  assert.equal(h.db().invites.length, 0, 'no invite was made');
  assert.equal(h.user(B).trainerId, T2);

  // 11. No session: 401 on every trainer route, the trainee's own two included.
  for (const r of documented('/api/trainer/')) {
    assert.equal((await ask(h, r, A, { 'Content-Type': 'application/json' })).status, 401, `${r.join(' ')} signed out`);
    assert.equal((await ask(h, r, A, { Cookie: 'gymsid=' + token(T1).slice(0, -2) + 'xx', 'Content-Type': 'application/json' })).status, 401, `${r.join(' ')} with a forged cookie`);
  }
  // A trainer whose access has ended is locked out like anyone else, and their trainee has no trainer.
  assert.equal((await h.call('GET', '/api/trainer/trainees', undefined, as(T3))).status, 401);
  assert.equal((await h.call('GET', '/api/me', undefined, as(D))).body.user.myTrainer, undefined);
  const row = (await h.call('GET', '/api/admin/users', undefined, as(ADMIN))).body;
  assert.deepEqual(row.unassigned.map(x => [x.id, x.why, x.trainerName]), [[D, 'locked', 'Theo']]);
  assert.equal(row.users.find(x => x.id === D).noTrainer, true);
  assert.equal(row.users.find(x => x.id === A).trainerName, 'Tara');
  assert.equal(row.users.find(x => x.id === T1).trainees, 1);
});

test('13 to 19. invites and sign-up: the role and the trainer come from the stored invite only', async t => {
  const h = await start(t);

  // 18. No 18+ confirmation, no profile; the invite stays good.
  const plainInv = (await h.call('POST', '/api/admin/invites/new', { name: 'Plain' }, as(ADMIN))).body.invite;
  for (const adult of [undefined, false, 'true', 1]) {
    const r = await h.call('POST', '/api/register/password', { name: 'Kid', password: PW, code: plainInv.code, adult }, { 'Content-Type': 'application/json' });
    assert.equal(r.status, 400); assert.equal(r.body.code, 'adult');
  }
  assert.equal((await h.call('POST', '/api/register/options', { name: 'Kid', code: plainInv.code }, { 'Content-Type': 'application/json' })).body.code, 'adult');
  assert.equal(h.byName('Kid'), undefined);

  // 16. What the sign-up request says about roles is ignored.
  const forged = await h.signUp({ name: 'Mallory', code: plainInv.code }, { trainer: true, trainerId: T1, trainerAck: T1, admin: true, owner: true, role: 'trainer', trainerSeen: true });
  assert.equal(forged.status, 200);
  const mal = h.byName('Mallory');
  for (const k of ['trainer', 'trainerId', 'trainerAck', 'admin', 'owner', 'role']) assert.equal(mal[k], undefined, k);
  assert.ok(mal.adult);
  assert.equal(forged.body.user.trainer, undefined);
  assert.equal((await h.call('GET', '/api/trainer/trainees', undefined, as(mal.id))).status, 404);

  // 13. A trainer's invite is a trainee of their own, whatever the request asks for.
  const made = await h.call('POST', '/api/trainer/invites/new', { name: 'New one', role: 'trainer', trainerId: T2, months: 1, createdBy: T2, code: 'MYCODE' }, as(T1));
  assert.equal(made.status, 200);
  const stored = h.db().invites.find(i => i.code === made.body.invite.code);
  assert.equal(stored.role, undefined);
  assert.equal(stored.trainerId, T1);
  assert.equal(stored.createdBy, T1);
  assert.equal(stored.months, null);
  assert.notEqual(stored.code, 'MYCODE');

  // 14. Signing up with it: first the consent line with the trainer's name, and no profile yet.
  const first = await h.signUp({ name: 'Nina', code: stored.code });
  assert.equal(first.status, 409);
  assert.deepEqual([first.body.code, first.body.trainer], ['trainer-consent', 'Tara']);
  assert.equal(h.byName('Nina'), undefined);
  assert.equal(h.db().invites.find(i => i.code === stored.code).usedBy, undefined);
  const pk = await h.call('POST', '/api/register/options', { name: 'Nina', code: stored.code, adult: true }, { 'Content-Type': 'application/json' });
  assert.deepEqual([pk.status, pk.body.code, pk.body.trainer], [409, 'trainer-consent', 'Tara']);
  const ok = await h.signUp({ name: 'Nina', code: stored.code, trainerSeen: true });
  assert.equal(ok.status, 200);
  const nina = h.byName('Nina');
  assert.equal(nina.trainerId, T1);
  assert.equal(nina.trainerAck, T1);
  assert.ok(nina.trainerAckAt);
  assert.equal(nina.trainer, undefined);
  assert.equal(nina.expiresAt, undefined, 'a trainer\'s invite carries no end date');
  assert.deepEqual(ok.body.user.myTrainer, { name: 'Tara', ack: true });
  assert.ok(!JSON.stringify(ok.body).includes(T1), 'the trainer id is never sent to the trainee');
  assert.deepEqual((await h.call('GET', '/api/trainer/trainees', undefined, as(T1))).body.trainees.map(x => x.name), ['Ann', 'Nina']);
  assert.deepEqual((await h.call('GET', '/api/trainer/trainees', undefined, as(T2))).body.trainees.map(x => x.name), ['Bob']);
  // The code is spent.
  assert.equal((await h.signUp({ name: 'Nina2', code: stored.code, trainerSeen: true })).status, 403);

  // 15. Only an admin's invite makes a trainer.
  const tInv = await h.call('POST', '/api/admin/invites/new', { name: 'New trainer', role: 'trainer' }, as(ADMIN));
  assert.equal(tInv.body.invite.role, 'trainer');
  assert.equal((await h.call('POST', '/api/admin/invites/new', { role: 'owner' }, as(ADMIN))).status, 400);
  assert.equal((await h.call('POST', '/api/admin/invites/new', { trainerId: C }, as(ADMIN))).status, 400, 'not a trainer');
  assert.equal((await h.call('POST', '/api/admin/invites/new', { trainerId: T3 }, as(ADMIN))).status, 400, 'a trainer whose access ended');
  const tess = await h.signUp({ name: 'Tess', code: tInv.body.invite.code });
  assert.equal(tess.status, 200);
  assert.equal(tess.body.user.trainer, true);
  assert.equal(h.byName('Tess').trainer, true);
  assert.equal((await h.call('GET', '/api/trainer/trainees', undefined, as(h.byName('Tess').id))).status, 200);

  // 17. An invite bound to a trainer who is demoted before it is used: the profile has no trainer.
  const forT2 = (await h.call('POST', '/api/admin/invites/new', { name: 'For Tom', trainerId: T2 }, as(ADMIN))).body.invite;
  assert.equal(forT2.trainerId, T2);
  const t2own = (await h.call('POST', '/api/trainer/invites/new', { name: 'Tom own' }, as(T2))).body.invite;
  assert.equal((await h.call('POST', '/api/admin/user/trainer-role', { id: T2, trainer: false }, as(ADMIN))).status, 200);
  const late = await h.signUp({ name: 'Olga', code: forT2.code });
  assert.equal(late.status, 200, 'no consent step: there is no trainer to consent to');
  assert.equal(h.byName('Olga').trainerId, undefined);
  assert.equal(late.body.user.myTrainer, undefined);
  assert.ok((await h.call('GET', '/api/admin/users', undefined, as(ADMIN))).body.unassigned.some(x => x.name === 'Olga' && x.why === 'invite' && x.trainerName === 'Tom'));
  // The code the demoted trainer made themselves is gone, so on an invite-only server it lets nobody in.
  assert.equal(h.db().invites.some(i => i.code === t2own.code), false);
  assert.equal((await h.signUp({ name: 'Pat', code: t2own.code, trainerSeen: true })).status, 403);
  // A disabled trainer's own codes stop working, and work again once they are enabled.
  const own = (await h.call('POST', '/api/trainer/invites/new', { name: 'Later' }, as(T1))).body.invite;
  await h.call('POST', '/api/admin/user/disable', { id: T1, disabled: true }, as(ADMIN));
  assert.equal((await h.signUp({ name: 'Quin', code: own.code, trainerSeen: true })).status, 403);
  await h.call('POST', '/api/admin/user/disable', { id: T1, disabled: false }, as(ADMIN));
  assert.equal((await h.signUp({ name: 'Quin', code: own.code, trainerSeen: true })).status, 200);
  assert.equal(h.byName('Quin').trainerId, T1);

  // 19. Twenty-five unused invites at a time; the next is refused until one is used or revoked.
  const tessId = h.byName('Tess').id;
  let last;
  for (let i = 0; i < 25; i++) { last = await h.call('POST', '/api/trainer/invites/new', { name: 'n' + i }, as(tessId)); assert.equal(last.status, 200, 'invite ' + (i + 1)); }
  const over = await h.call('POST', '/api/trainer/invites/new', { name: 'one too many' }, as(tessId));
  assert.deepEqual([over.status, over.body.code], [400, 'invite-limit']);
  assert.equal((await h.call('POST', '/api/trainer/invites/new', {}, as(T1))).status, 200, 'another trainer is not affected');
  assert.equal((await h.call('POST', '/api/trainer/invites/revoke', { code: last.body.invite.code }, as(tessId))).status, 200);
  assert.equal((await h.call('POST', '/api/trainer/invites/new', { name: 'fits again' }, as(tessId))).status, 200);
  assert.equal((await h.call('POST', '/api/trainer/invites/new', { email: 'not an address' }, as(T1))).status, 400);
});

test('an invite code applies on an open server too', async t => {
  const h = await start(t, { INVITE_ONLY: '0' });
  const inv = (await h.call('POST', '/api/trainer/invites/new', { name: 'Open' }, as(T1))).body.invite;
  assert.equal((await h.signUp({ name: 'Rae', code: inv.code })).status, 409);
  assert.equal((await h.signUp({ name: 'Rae', code: inv.code, trainerSeen: true })).status, 200);
  assert.equal(h.byName('Rae').trainerId, T1);
  // No code, or one that is not known: an ordinary profile, as before.
  assert.equal((await h.signUp({ name: 'Sol' })).status, 200);
  assert.equal((await h.signUp({ name: 'Uma', code: 'NOTACODE', trainerSeen: true })).status, 200);
  assert.equal(h.byName('Sol').trainerId, undefined);
  assert.equal(h.byName('Uma').trainerId, undefined);
});

test('20, 25, 26. an admin moves a trainee: the old trainer is out at once, the new one waits to be introduced', async t => {
  const h = await start(t);
  const fromAdmin = await h.call('POST', '/api/admin/user/plan', plan(A, 'From admin'), as(ADMIN));
  // 26. Whoever trains them now may update any plan they hold.
  assert.equal((await h.call('POST', '/api/trainer/trainee/plan', plan(A, 'T1 edit', { aid: fromAdmin.body.aid }), as(T1))).status, 200);
  assert.equal((await h.call('GET', '/api/assigned', undefined, as(A))).body.plans[0].routine.name, 'T1 edit');
  assert.equal((await h.call('GET', '/api/assigned', undefined, as(A))).body.plans[0].by, 'Tara');

  // 25. Moves that are refused change nothing.
  const bad = [
    [{ ids: [A], trainerId: C }, 400], [{ ids: [A], trainerId: 'nobody' }, 400], [{ ids: [A], trainerId: T3 }, 400],
    [{ ids: [A], trainerId: A }, 400], [{ ids: [T2], trainerId: T2 }, 400], [{ ids: [A, T2], trainerId: T2 }, 400],
    [{ ids: [A, 'nobody'], trainerId: T2 }, 404], [{ ids: [], trainerId: T2 }, 400], [{ ids: [A, A], trainerId: T2 }, 400],
    [{ ids: A, trainerId: T2 }, 400], [{ id: A, trainerId: T2 }, 400], [{ ids: [A] }, 400], [{ ids: [A], trainerId: [T2] }, 400],
    [{ ids: [{ id: A }], trainerId: T2 }, 400]
  ];
  for (const [body, status] of bad) assert.equal((await h.call('POST', '/api/admin/user/trainer', body, as(ADMIN))).status, status, JSON.stringify(body));
  assert.deepEqual([h.user(A).trainerId, h.user(A).trainerAck], [T1, T1]);

  // 20. The move.
  const moved = await h.call('POST', '/api/admin/user/trainer', { ids: [A, C], trainerId: T2 }, as(ADMIN));
  assert.deepEqual([moved.status, moved.body.moved], [200, 2]);
  assert.deepEqual(await h.raw('GET', `/api/trainer/trainee?id=${A}`, undefined, as(T1)), { status: 404, text: NOT_FOUND });
  assert.deepEqual((await h.call('GET', '/api/trainer/trainees', undefined, as(T1))).body.trainees, []);
  // 26, second half: the old trainer can no longer touch the plan.
  assert.equal((await h.call('POST', '/api/trainer/trainee/plan', plan(A, 'T1 again', { aid: fromAdmin.body.aid }), as(T1))).status, 404);
  assert.equal((await h.call('POST', '/api/trainer/trainee/plan/remove', { id: A, aid: fromAdmin.body.aid }, as(T1))).status, 404);
  assert.equal((await h.call('GET', '/api/assigned', undefined, as(A))).body.plans[0].routine.name, 'T1 edit');

  // The new trainer: the name, and nothing A logged, until A has been told.
  const list = (await h.call('GET', '/api/trainer/trainees', undefined, as(T2))).body.trainees;
  assert.deepEqual(list.find(x => x.id === A), { id: A, name: 'Ann', plans: 1, waiting: true });
  assert.deepEqual(list.find(x => x.id === C), { id: C, name: 'Cy', plans: 0, waiting: true });
  const waiting = await h.call('GET', `/api/trainer/trainee?id=${A}`, undefined, as(T2));
  assert.equal(waiting.status, 200);
  assert.deepEqual(Object.keys(waiting.body), ['user', 'waiting', 'assigned']);
  assert.deepEqual(waiting.body.user, { id: A, name: 'Ann' });
  assert.deepEqual(Object.keys(waiting.body.assigned[0]), ['aid', 'name', 'emoji', 'by', 'at', 'exercises']);
  assert.ok(!JSON.stringify(waiting.body).includes('w-Ann'));
  // Giving a plan reads nothing, so it works straight away.
  assert.equal((await h.call('POST', '/api/trainer/trainee/plan', plan(A, 'T2 edit', { aid: fromAdmin.body.aid }), as(T2))).status, 200);

  // A is told, by name only, and says so.
  assert.deepEqual((await h.call('GET', '/api/me', undefined, as(A))).body.user.myTrainer, { name: 'Tom', ack: false });
  // Nobody else can say it for them.
  await h.call('POST', '/api/trainer/ack', { id: A }, as(T2));
  await h.call('POST', '/api/trainer/ack', { id: A }, as(B));
  assert.equal(h.user(A).trainerAck, undefined);
  const ack = await h.call('POST', '/api/trainer/ack', {}, as(A));
  assert.deepEqual(ack.body, { ok: true, myTrainer: { name: 'Tom', ack: true } });
  assert.equal(h.user(A).trainerAck, T2);
  assert.equal((await h.call('GET', `/api/trainer/trainee?id=${A}`, undefined, as(T2))).body.workouts[0].id, 'w-Ann');
  assert.equal((await h.call('GET', '/api/trainer/trainees', undefined, as(T2))).body.trainees.find(x => x.id === A).lastWorkout, day);
  // C has not opened the app: still name only.
  assert.equal((await h.call('GET', `/api/trainer/trainee?id=${C}`, undefined, as(T2))).body.waiting, true);

  // Back to T1 without A being told again: T1 waits too, though A once knew them.
  assert.equal((await h.call('POST', '/api/admin/user/trainer', { ids: [A], trainerId: T1 }, as(ADMIN))).status, 200);
  assert.equal((await h.call('GET', `/api/trainer/trainee?id=${A}`, undefined, as(T1))).body.waiting, true);
  assert.equal((await h.call('GET', `/api/trainer/trainee?id=${A}`, undefined, as(T2))).status, 404);
  // Moving someone to the trainer they already have keeps what they were told.
  await h.call('POST', '/api/trainer/ack', {}, as(A));
  await h.call('POST', '/api/admin/user/trainer', { ids: [A], trainerId: T1 }, as(ADMIN));
  assert.equal(h.user(A).trainerAck, T1);
  // To nobody.
  assert.equal((await h.call('POST', '/api/admin/user/trainer', { ids: [A], trainerId: null }, as(ADMIN))).status, 200);
  assert.deepEqual([h.user(A).trainerId, h.user(A).trainerAck, h.user(A).trainerAckAt], [undefined, undefined, undefined]);
  assert.equal((await h.call('GET', `/api/trainer/trainee?id=${A}`, undefined, as(T1))).status, 404);
  assert.equal((await h.call('GET', '/api/admin/users', undefined, as(ADMIN))).body.unassigned.some(x => x.id === A), false, 'an admin\'s own "no trainer" is not on the banner');
  assert.equal((await h.call('GET', '/api/assigned', undefined, as(A))).body.plans.length, 1, 'the plan stays');
});

test('21, 22. a trainer demoted or disabled loses their trainees with the session they already hold', async t => {
  const h = await start(t);
  const session = as(T1);                    // made before anything changes
  assert.equal((await h.call('GET', `/api/trainer/trainee?id=${A}`, undefined, session)).status, 200);
  const inv = (await h.call('POST', '/api/trainer/invites/new', { name: 'Open' }, session)).body.invite;

  // 22. Disabled: locked out, the trainee shows as having no trainer; enabled again: theirs again.
  await h.call('POST', '/api/admin/user/disable', { id: T1, disabled: true }, as(ADMIN));
  for (const r of TRAINER_ONLY()) assert.equal((await ask(h, r, A, session)).status, 401, `${r.join(' ')} while disabled`);
  assert.equal((await h.call('GET', '/api/me', undefined, as(A))).body.user.myTrainer, undefined);
  assert.ok((await h.call('GET', '/api/admin/users', undefined, as(ADMIN))).body.unassigned.some(x => x.id === A && x.why === 'locked'));
  assert.equal((await h.call('POST', '/api/admin/user/trainer-role', { id: T1, trainer: true }, as(ADMIN))).status, 400, 'no role for a locked account');
  await h.call('POST', '/api/admin/user/disable', { id: T1, disabled: false }, as(ADMIN));
  assert.equal((await h.call('GET', `/api/trainer/trainee?id=${A}`, undefined, session)).body.workouts.length, 1, 'no new consent needed: the same trainer');
  assert.deepEqual((await h.call('GET', '/api/me', undefined, as(A))).body.user.myTrainer, { name: 'Tara', ack: true });

  // 21. Demoted.
  assert.equal((await h.call('POST', '/api/admin/user/trainer-role', { id: T1, trainer: 'no' }, as(ADMIN))).status, 400);
  assert.equal((await h.call('POST', '/api/admin/user/trainer-role', { id: 'nobody', trainer: false }, as(ADMIN))).status, 404);
  const off = await h.call('POST', '/api/admin/user/trainer-role', { id: T1, trainer: false }, as(ADMIN));
  assert.deepEqual([off.status, off.body.trainer, off.body.released], [200, false, 1]);
  for (const r of TRAINER_ONLY()) assert.deepEqual(await ask(h, r, A, session), { status: 404, text: NOT_FOUND }, `${r.join(' ')} after the demotion`);
  assert.equal((await h.call('GET', '/api/me', undefined, session)).body.user.trainer, undefined);
  assert.deepEqual([h.user(A).trainerId, h.user(A).trainerAck], [undefined, undefined]);
  assert.ok((await h.call('GET', '/api/admin/users', undefined, as(ADMIN))).body.unassigned.some(x => x.id === A && x.why === 'demoted' && x.trainerName === 'Tara'));
  assert.equal(h.db().invites.some(i => i.code === inv.code), false, 'their unused invite went with the role');
  // Made a trainer again: they do not get their old trainees back by themselves.
  assert.equal((await h.call('POST', '/api/admin/user/trainer-role', { id: T1, trainer: true }, as(ADMIN))).status, 200);
  assert.deepEqual((await h.call('GET', '/api/trainer/trainees', undefined, session)).body.trainees, []);
  assert.equal((await h.call('GET', `/api/trainer/trainee?id=${A}`, undefined, session)).status, 404);
});

test('23, 24. a trainer who leaves, a trainee who leaves, a trainee let go: nobody is locked out and plans stay', async t => {
  const h = await start(t);
  const p = await h.call('POST', '/api/trainer/trainee/plan', plan(A, 'Kept'), as(T1));
  assert.equal(p.status, 200);
  const unused = (await h.call('POST', '/api/trainer/invites/new', { name: 'Unused' }, as(T1))).body.invite;
  const used = (await h.call('POST', '/api/trainer/invites/new', { name: 'Used' }, as(T1))).body.invite;
  assert.equal((await h.signUp({ name: 'Vic', code: used.code, trainerSeen: true })).status, 200);
  const vic = h.byName('Vic').id;

  // 24. Vic leaves: the trainer is out, the admin sees it, Vic keeps going.
  await h.call('POST', '/api/trainer/trainee/plan', plan(vic, 'Vic plan'), as(T1));
  assert.equal((await h.call('POST', '/api/trainer/leave', { id: A }, as(vic))).status, 200);
  assert.equal(h.user(vic).trainerId, undefined);
  assert.equal(h.user(A).trainerId, T1, 'leaving is for oneself only');
  assert.deepEqual(await h.raw('GET', `/api/trainer/trainee?id=${vic}`, undefined, as(T1)), { status: 404, text: NOT_FOUND });
  assert.equal((await h.call('POST', '/api/trainer/trainee/plan', plan(vic, 'After'), as(T1))).status, 404);
  assert.equal((await h.call('GET', '/api/assigned', undefined, as(vic))).body.plans[0].routine.name, 'Vic plan');
  assert.ok((await h.call('GET', '/api/admin/users', undefined, as(ADMIN))).body.unassigned.some(x => x.id === vic && x.why === 'left' && x.trainerName === 'Tara'));
  assert.equal((await h.call('POST', '/api/trainer/leave', {}, as(vic))).status, 200, 'safe to repeat');
  assert.equal((await h.call('POST', '/api/trainer/ack', {}, as(vic))).body.myTrainer, null);

  // A trainer lets a trainee go (T2 and B).
  assert.equal((await h.call('POST', '/api/trainer/trainee/release', { id: B }, as(T2))).status, 200);
  assert.equal(h.user(B).trainerId, undefined);
  assert.equal((await h.call('GET', `/api/trainer/trainee?id=${B}`, undefined, as(T2))).status, 404);
  assert.ok((await h.call('GET', '/api/admin/users', undefined, as(ADMIN))).body.unassigned.some(x => x.id === B && x.why === 'released'));

  // 23. T1 deletes their own account.
  const gone = await h.call('POST', '/api/account/delete', { name: 'Tara' }, bearer(T1));
  assert.equal(gone.status, 200, JSON.stringify(gone.body));
  assert.equal(h.user(T1), undefined);
  assert.deepEqual([h.user(A).trainerId, h.user(A).trainerAck], [undefined, undefined]);
  assert.equal(h.db().invites.some(i => i.code === unused.code), false, 'the unused invite is gone');
  assert.equal(h.db().invites.some(i => i.code === used.code), true, 'the used one stays burned');
  assert.equal((await h.signUp({ name: 'Wes', code: unused.code, trainerSeen: true })).status, 403);
  const me = await h.call('GET', '/api/me', undefined, as(A));
  assert.equal(me.status, 200, 'the trainee can still sign in');
  assert.equal(me.body.user.myTrainer, undefined);
  assert.equal((await h.call('GET', '/api/assigned', undefined, as(A))).body.plans[0].routine.name, 'Kept');
  assert.ok((await h.call('GET', '/api/admin/users', undefined, as(ADMIN))).body.unassigned.some(x => x.id === A && x.why === 'deleted' && x.trainerName === 'Tara'));
  // The dead session is nobody.
  assert.equal((await h.call('GET', '/api/trainer/trainees', undefined, as(T1))).status, 401);

  // An admin deleting a trainer ends the same way; then the admin gives everyone a new trainer.
  await h.call('POST', '/api/admin/user/trainer-role', { id: C, trainer: true }, as(ADMIN));
  await h.call('POST', '/api/admin/user/trainer', { ids: [B], trainerId: T2 }, as(ADMIN));
  assert.equal((await h.call('POST', '/api/admin/user/delete', { id: T2 }, as(ADMIN))).status, 200);
  assert.equal(h.user(B).trainerId, undefined);
  const move = await h.call('POST', '/api/admin/user/trainer', { ids: [A, B, vic], trainerId: C }, as(ADMIN));
  assert.equal(move.body.moved, 3);
  assert.deepEqual((await h.call('GET', '/api/admin/users', undefined, as(ADMIN))).body.unassigned.filter(x => [A, B, vic].includes(x.id)), []);
  assert.deepEqual((await h.call('GET', '/api/trainer/trainees', undefined, as(C))).body.trainees.map(x => [x.name, x.waiting]), [['Ann', true], ['Bob', true], ['Vic', true]]);
});
