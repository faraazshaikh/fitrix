/* The trainer rules as pure functions (trainer.js): who may train whom, who counts as having no
   trainer, what an invite may carry, and exactly which fields of a trainee a trainer is shown. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isTrainer, canTrain, canSee, activeTrainer, effectiveTrainer, traineesOf, myTrainer, unassigned,
  setTrainer, ackTrainer, clearTrainer, trainerLeaves, inviteRole, inviteLive, inviteGrants, openInvitesOf,
  inviteForTrainer, traineeRow, traineeView
} from '../trainer.js';

const isLocked = u => !!(u && (u.disabled || (u.expiresAt && Date.parse(u.expiresAt) <= Date.now())));
const world = () => ({
  users: [
    { id: 'adm', name: 'Boss', admin: true },
    { id: 't1', name: 'Tara', trainer: true },
    { id: 't2', name: 'Tom', trainer: true },
    { id: 'a', name: 'Ann', trainerId: 't1', trainerAck: 't1' },
    { id: 'b', name: 'Bob', trainerId: 't2', trainerAck: 't2' },
    { id: 'c', name: 'Cy' }
  ],
  invites: []
});
const by = (db, id) => db.users.find(u => u.id === id);

test('1. canTrain: the flag and the matching link, never oneself, never by a stale or forged link', () => {
  const db = world();
  assert.equal(canTrain(by(db, 't1'), by(db, 'a')), true);
  assert.equal(canTrain(by(db, 't1'), by(db, 'b')), false, "another trainer's trainee");
  assert.equal(canTrain(by(db, 't1'), by(db, 'c')), false, 'someone with no trainer');
  assert.equal(canTrain(by(db, 't1'), by(db, 't1')), false, 'oneself');
  assert.equal(canTrain(by(db, 'adm'), by(db, 'a')), false, 'an admin is not a trainer by being an admin');
  assert.equal(canTrain(by(db, 'a'), by(db, 'b')), false, 'a trainee');
  // A profile that points at itself, or a trainer whose own link says they train themselves.
  by(db, 't1').trainerId = 't1';
  assert.equal(canTrain(by(db, 't1'), by(db, 't1')), false);
  // Demoted: the link is still there, the flag is not.
  delete by(db, 't1').trainer;
  assert.equal(canTrain(by(db, 't1'), by(db, 'a')), false, 'a demoted trainer');
  // The flag has to be exactly true.
  for (const v of ['true', 1, {}, []]) assert.equal(canTrain({ id: 't1', trainer: v }, by(db, 'a')), false);
  // No ids at all must not match each other.
  assert.equal(canTrain({ trainer: true }, { id: 'x' }), false);
  assert.equal(canTrain({ trainer: true, id: '' }, { id: 'x', trainerId: '' }), false);
  assert.equal(canTrain(null, by(db, 'a')), false);
  assert.equal(canTrain(by(db, 't2'), null), false);
});

test('canSee: only once the trainee has been told about this trainer', () => {
  const db = world();
  assert.equal(canSee(by(db, 't1'), by(db, 'a')), true);
  by(db, 'a').trainerAck = 't2';
  assert.equal(canSee(by(db, 't1'), by(db, 'a')), false, 'told about someone else');
  delete by(db, 'a').trainerAck;
  assert.equal(canSee(by(db, 't1'), by(db, 'a')), false);
  assert.equal(canSee(by(db, 't1'), by(db, 'b')), false);
});

test('2. effectiveTrainer: null for a missing, demoted, disabled or expired trainer', () => {
  const db = world();
  assert.equal(effectiveTrainer(db, by(db, 'a'), isLocked).id, 't1');
  assert.equal(effectiveTrainer(db, by(db, 'c'), isLocked), null);
  by(db, 't1').disabled = true;
  assert.equal(effectiveTrainer(db, by(db, 'a'), isLocked), null, 'disabled');
  delete by(db, 't1').disabled;
  by(db, 't1').expiresAt = '2020-01-01T00:00:00.000Z';
  assert.equal(effectiveTrainer(db, by(db, 'a'), isLocked), null, 'expired');
  delete by(db, 't1').expiresAt;
  delete by(db, 't1').trainer;
  assert.equal(effectiveTrainer(db, by(db, 'a'), isLocked), null, 'demoted');
  db.users = db.users.filter(u => u.id !== 't1');
  assert.equal(effectiveTrainer(db, by(db, 'a'), isLocked), null, 'deleted');
  assert.equal(activeTrainer(db, 't2', isLocked).id, 't2');
  assert.equal(activeTrainer(db, 'a', isLocked), null);
  assert.equal(activeTrainer(db, { id: 't2' }, isLocked), null, 'only a string id');
  assert.equal(myTrainer(db, by(db, 'b'), isLocked).name, 'Tom');
  assert.equal(myTrainer(db, by(db, 'a'), isLocked), null);
  assert.deepEqual(Object.keys(myTrainer(db, by(db, 'b'), isLocked)), ['name', 'ack'], 'never the trainer id');
});

test('traineesOf and unassigned', () => {
  const db = world();
  assert.deepEqual(traineesOf(db, 't1').map(u => u.id), ['a']);
  assert.deepEqual(traineesOf(db, undefined), [], 'no id lists nobody, not everybody without a trainer');
  assert.deepEqual(unassigned(db, isLocked), []);
  by(db, 't1').disabled = true;
  assert.deepEqual(unassigned(db, isLocked).map(x => [x.id, x.why, x.trainerName]), [['a', 'locked', 'Tara']]);
  delete by(db, 't1').disabled;
  assert.equal(trainerLeaves(db, by(db, 't1'), 'demoted'), 1);
  assert.equal(by(db, 'a').trainerId, undefined);
  assert.equal(by(db, 'a').trainerAck, undefined);
  assert.deepEqual(unassigned(db, isLocked).map(x => [x.id, x.why, x.trainerName]), [['a', 'demoted', 'Tara']]);
  // Given a new trainer: off the banner, and to be told again.
  setTrainer(by(db, 'a'), 't2');
  assert.deepEqual(unassigned(db, isLocked), []);
  assert.equal(by(db, 'a').trainerAck, undefined);
  // The same trainer again keeps what they were told.
  by(db, 'a').trainerAck = 't2';
  setTrainer(by(db, 'a'), 't2');
  assert.equal(by(db, 'a').trainerAck, 't2');
  // Being told is dated, once; a move to someone else forgets it, and so does leaving.
  setTrainer(by(db, 'a'), 't1');
  assert.equal(by(db, 'a').trainerAck, undefined);
  ackTrainer(by(db, 'a'), 't2', 0);
  assert.equal(by(db, 'a').trainerAck, undefined, 'only for the trainer they have');
  ackTrainer(by(db, 'a'), 't1', 0);
  ackTrainer(by(db, 'a'), 't1', 5000);
  assert.deepEqual([by(db, 'a').trainerAck, by(db, 'a').trainerAckAt], ['t1', '1970-01-01T00:00:00.000Z']);
  setTrainer(by(db, 'a'), 't2');
  assert.deepEqual([by(db, 'a').trainerAck, by(db, 'a').trainerAckAt], [undefined, undefined]);
  ackTrainer(by(db, 'a'), 't2', 0);
  // An admin's "no trainer" takes them off the banner.
  clearTrainer(by(db, 'a'));
  assert.deepEqual(unassigned(db, isLocked), []);
  assert.deepEqual([by(db, 'a').trainerId, by(db, 'a').trainerAck, by(db, 'a').trainerAckAt], [undefined, undefined, undefined]);
});

test('trainerLeaves drops only that trainer\'s own unused invites', () => {
  const db = world();
  db.invites = [
    { code: 'MINE', createdBy: 't1', trainerId: 't1' },
    { code: 'USED', createdBy: 't1', trainerId: 't1', usedBy: 'a' },
    { code: 'ADMIN', createdBy: 'adm', trainerId: 't1' },
    { code: 'OTHER', createdBy: 't2', trainerId: 't2' }
  ];
  assert.deepEqual(openInvitesOf(db, 't1').map(i => i.code), ['MINE']);
  trainerLeaves(db, by(db, 't1'), 'deleted');
  assert.deepEqual(db.invites.map(i => i.code), ['USED', 'ADMIN', 'OTHER']);
});

test('4. inviteRole: a trainer can never make a trainer, or bind an invite to anyone else', () => {
  const db = world();
  const t1 = by(db, 't1');
  for (const body of [{}, { role: 'trainer' }, { trainerId: 't2' }, { role: 'trainer', trainerId: 't2' }, { role: 'admin', trainerId: 'adm' }, null, 'x']) {
    assert.deepEqual(inviteRole(t1, body, { as: 'trainer', db, isLocked }), { trainerId: 't1' });
    assert.deepEqual(inviteRole(t1, body), { trainerId: 't1' }, 'and that is the default');
  }
  assert.ok(inviteRole(by(db, 'a'), {}, { as: 'trainer', db }).error, 'not a trainer');
  assert.ok(inviteRole(by(db, 'adm'), { role: 'trainer' }, { as: 'trainer', db }).error, 'an admin on the trainer route is no trainer either');
  // An admin's invite.
  const adm = by(db, 'adm');
  assert.deepEqual(inviteRole(adm, {}, { as: 'admin', db, isLocked }), {});
  assert.deepEqual(inviteRole(adm, { role: 'trainee' }, { as: 'admin', db, isLocked }), {});
  assert.deepEqual(inviteRole(adm, { role: 'trainer' }, { as: 'admin', db, isLocked }), { role: 'trainer' });
  assert.deepEqual(inviteRole(adm, { trainerId: 't2' }, { as: 'admin', db, isLocked }), { trainerId: 't2' });
  assert.ok(inviteRole(adm, { role: 'owner' }, { as: 'admin', db, isLocked }).error);
  assert.ok(inviteRole(adm, { trainerId: 'a' }, { as: 'admin', db, isLocked }).error, 'not a trainer');
  assert.ok(inviteRole(adm, { trainerId: 'nobody' }, { as: 'admin', db, isLocked }).error);
  by(db, 't2').disabled = true;
  assert.ok(inviteRole(adm, { trainerId: 't2' }, { as: 'admin', db, isLocked }).error, 'a locked trainer');
});

test('inviteLive: a trainer\'s own invite only works while that trainer can act', () => {
  const db = world();
  const isAdmin = u => u.admin === true;
  const mine = { code: 'M', createdBy: 't1', trainerId: 't1' };
  const admins = { code: 'A', createdBy: 'adm', trainerId: 't1' };
  const plain = { code: 'P', createdBy: 'adm' };
  assert.equal(inviteLive(db, mine, { isLocked, isAdmin }), true);
  by(db, 't1').disabled = true;
  assert.equal(inviteLive(db, mine, { isLocked, isAdmin }), false);
  assert.equal(inviteLive(db, admins, { isLocked, isAdmin }), true, "an admin's invite stays good");
  assert.equal(inviteLive(db, plain, { isLocked, isAdmin }), true);
  delete by(db, 't1').disabled;
  delete by(db, 't1').trainer;
  assert.equal(inviteLive(db, mine, { isLocked, isAdmin }), false, 'demoted');
  db.users = db.users.filter(u => u.id !== 't1');
  assert.equal(inviteLive(db, mine, { isLocked, isAdmin }), false, 'deleted');
  assert.equal(inviteLive(db, null), false);
});

test('inviteGrants: role and trainer from the stored invite, the trainer only while active', () => {
  const db = world();
  assert.deepEqual(inviteGrants(db, null), {});
  assert.deepEqual(inviteGrants(db, { code: 'P' }, { isLocked }), {});
  assert.deepEqual(inviteGrants(db, { role: 'trainer' }, { isLocked }), { trainer: true });
  assert.deepEqual(inviteGrants(db, { role: 'admin' }, { isLocked }), {}, 'no other role exists');
  assert.deepEqual(inviteGrants(db, { trainerId: 't1' }, { isLocked, seen: true, now: 0 }), { trainerId: 't1', trainerAck: 't1', trainerAckAt: '1970-01-01T00:00:00.000Z' });
  assert.deepEqual(inviteGrants(db, { trainerId: 't1' }, { isLocked }), { trainerId: 't1' }, 'not shown: to be told on first open');
  delete by(db, 't1').trainer;
  const g = inviteGrants(db, { trainerId: 't1' }, { isLocked, seen: true, now: 0 });
  assert.equal(g.trainerId, undefined);
  assert.equal(g.trainerAck, undefined);
  assert.deepEqual(g.trainerGone, { why: 'invite', at: '1970-01-01T00:00:00.000Z', name: 'Tara' });
});

test('3. traineeView holds only the allow-listed keys', () => {
  const user = {
    id: 'a', name: 'Ann', created: '2026-01-01T00:00:00.000Z', expiresAt: '2027-01-01T00:00:00.000Z', lastPull: 5,
    email: 'ann@example.org', pw: { h: 'hash' }, pwReset: { exp: 1 }, invitedBy: 'CODE', trainerId: 't1', trainerAck: 't1', admin: true, sv: 3, disabled: false
  };
  const state = {
    _ts: 9, unit: 'lb', lengthUnit: 'cm',
    routines: [{ id: 'r1', name: 'Push', emoji: 'x', ex: [{ id: 'bench' }], secret: 'no' }],
    workouts: [
      { id: 'w1', d: '2026-11-01', start: 1, end: 2, routineId: 'r1', routineIds: ['r1'], name: 'Push', bw: 80, entries: [{ id: 'bench', sets: [{ w: 60, r: 5, media: [{ hash: 'abc', poster: { hash: 'abc' } }] }, { sides: { L: { w: 20, r: 8 }, R: { w: 20, r: 7 } } }], target: { w: 62.5 } }], prs: [], note: 'ok', gym: { id: 'g', name: 'Gym' }, media: [{ hash: 'abc' }], hr: { avg: 140 }, loc: { lat: 1 } },
      { id: 'w2', d: '2026-11-03', entries: [] }, null, 'x'
    ],
    bodyweight: [{ d: '2026-11-01', w: 80.5, t: 1, src: 'scale', note: 'private' }, { d: 'bad', w: 1 }],
    measurements: [{ d: '2026-11-02', t: 2, waist: 81, bodyFat: 19.9, note: 'private', photo: { hash: 'abc' }, other: [{ id: 'c1', name: 'Muscle ratio', value: 40, unit: '%', extra: 'no' }, { name: 'no id' }] }],
    customEx: [{ id: 'cx', media: { hash: 'abc' } }], coach: { chats: ['secret'] }, integrations: { x: 1 }, profile: { height: 180 }, gymCards: [{ id: 1 }]
  };
  const report = [{ aid: 'p1', name: 'Push', emoji: null, by: 'Tara', at: 'x', exercises: 2, sessions: 1, lastTrained: '2026-11-01' }];
  const v = traineeView(user, state, report);
  // The snapshot of the key list: adding a field to what a trainer sees is a deliberate act.
  assert.deepEqual(Object.keys(v), ['user', 'unit', 'lengthUnit', 'lastSync', 'lastWorkout', 'routines', 'assigned', 'workouts', 'bodyweight', 'measurements']);
  assert.deepEqual(v.user, { id: 'a', name: 'Ann', created: user.created, expiresAt: user.expiresAt });
  assert.deepEqual(v.routines, [{ id: 'r1', name: 'Push', emoji: 'x', count: 1 }]);
  assert.equal(v.unit, 'lb');
  assert.equal(v.lengthUnit, 'cm');
  assert.equal(v.lastSync, 9);
  assert.equal(v.lastWorkout, '2026-11-03');
  assert.deepEqual(v.workouts.map(w => w.id), ['w2', 'w1'], 'newest first, broken rows dropped');
  assert.deepEqual(Object.keys(v.workouts[1]), ['id', 'd', 'start', 'end', 'routineIds', 'routineId', 'name', 'bw', 'entries', 'prs', 'note', 'gym']);
  // A set's own form video is dropped; what was lifted, side sets and targets included, is kept.
  assert.deepEqual(v.workouts[1].entries, [{ id: 'bench', sets: [{ w: 60, r: 5 }, { sides: { L: { w: 20, r: 8 }, R: { w: 20, r: 7 } } }], target: { w: 62.5 } }]);
  assert.deepEqual(state.workouts[0].entries[0].sets[0].media.length, 1, 'the stored workout is not touched');
  assert.deepEqual(v.bodyweight, [{ d: '2026-11-01', w: 80.5, t: 1 }]);
  assert.deepEqual(v.measurements, [{ d: '2026-11-02', t: 2, waist: 81, bodyFat: 19.9, other: [{ id: 'c1', name: 'Muscle ratio', value: 40, unit: '%' }] }]);
  assert.equal(v.assigned, report);
  // Nothing of the account, and no photo or video reference anywhere in the answer.
  const flat = JSON.stringify(v);
  for (const leak of ['ann@example.org', 'hash', 'CODE', 'secret', 'private', 'abc', 'height', 'gymCards', 'media', '"hr"', 'loc', 'trainerAck', 'pwReset']) {
    assert.ok(!flat.includes(leak), `leaks ${leak}`);
  }
  // An empty or unreadable profile is an empty view, not a throw.
  for (const s of [null, undefined, 'x', []]) assert.deepEqual(traineeView(user, s).workouts, []);
});

test('a trainee who has not been told yet shows by name and handed-out plans only', () => {
  const user = { id: 'a', name: 'Ann', created: 'c', expiresAt: 'e', lastPull: 5 };
  const state = { _ts: 9, workouts: [{ id: 'w', d: '2026-11-01' }], bodyweight: [{ d: '2026-11-01', w: 80 }] };
  const report = [{ aid: 'p1', name: 'Push', emoji: null, by: 'Tara', at: 'x', exercises: 2, sessions: 3, lastTrained: '2026-11-01' }];
  assert.deepEqual(traineeView(user, state, report, true), {
    user: { id: 'a', name: 'Ann' }, waiting: true,
    assigned: [{ aid: 'p1', name: 'Push', emoji: null, by: 'Tara', at: 'x', exercises: 2 }]
  });
  assert.deepEqual(traineeRow(user, state, 1, true), { id: 'a', name: 'Ann', plans: 1, waiting: true });
  assert.deepEqual(traineeRow(user, state, 1, false), { id: 'a', name: 'Ann', plans: 1, lastWorkout: '2026-11-01', lastSync: 9, expiresAt: 'e' });
});

test('an invite as its trainer sees it carries no account id', () => {
  const row = inviteForTrainer({ code: 'C', name: 'Ann', email: 'a@b.c', created: 'x', createdBy: 't1', trainerId: 't1', usedBy: 'uid-of-ann', usedAt: 'y', months: null });
  assert.deepEqual(row, { code: 'C', name: 'Ann', email: 'a@b.c', created: 'x', used: true, usedAt: 'y' });
  assert.equal(isTrainer({ trainer: true }), true);
  assert.equal(isTrainer({ trainer: 'yes' }), false);
});
