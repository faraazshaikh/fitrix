import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignPlan, unassignPlan, assignedFor, assignedReport, cleanPlan, dropAssigned, MAX_ASSIGNED } from '../assigned-plan.js';

const plan = (name = 'Push day', extra = {}) => ({
  routine: { id: 'adminR1', name, emoji: 'figureStrength', _ts: 5, importKey: 'k', ex: [{ id: 'bench', sets: 3 }, { id: 'cx1', sets: 2 }], ...extra },
  customEx: [{ id: 'cx1', n: 'My curl' }, { id: 'unused', n: 'Not in the routine' }],
});

test('cleanPlan: keeps the routine and only the custom exercises it uses, drops the admin\'s own marks', () => {
  const c = cleanPlan(plan());
  assert.equal(c.routine.name, 'Push day');
  assert.equal(c.routine.id, undefined);
  assert.equal(c.routine._ts, undefined);
  assert.equal(c.routine.importKey, undefined);
  assert.deepEqual(c.customEx, [{ id: 'cx1', n: 'My curl' }]);
});

test('cleanPlan: refuses what cannot be a plan', () => {
  assert.ok(cleanPlan(null).error);
  assert.ok(cleanPlan({ routine: { name: '', ex: [{ id: 'a' }] } }).error);
  assert.ok(cleanPlan({ routine: { name: 'x', ex: [] } }).error);
  assert.ok(cleanPlan({ routine: { name: 'x', ex: [{ nope: 1 }] } }).error);
  assert.ok(cleanPlan({ routine: { name: 'x', ex: Array.from({ length: 61 }, (_, i) => ({ id: 'e' + i })) } }).error);
  assert.ok(cleanPlan({ routine: { name: 'x', ex: [{ id: 'a', blob: 'z'.repeat(70000) }] } }).error);
});

test('assignPlan: stores it, the same aid replaces it, a person keeps at most MAX_ASSIGNED', () => {
  const db = {};
  const a = assignPlan(db, 'u1', 'Faraaz', plan(), Date.parse('2026-11-15T10:00:00Z'));
  assert.equal(a.by, 'Faraaz');
  assert.equal(a.at, '2026-11-15T10:00:00.000Z');
  const b = assignPlan(db, 'u1', 'Faraaz', plan('Push v2'), Date.parse('2026-11-16T10:00:00Z'), a.aid);
  assert.equal(b.aid, a.aid);
  assert.equal(db.assigned.u1.length, 1);
  assert.equal(db.assigned.u1[0].routine.name, 'Push v2');
  assert.ok(assignPlan(db, 'u1', 'Faraaz', plan(), 0, 'missing').error);
  for (let i = 1; i < MAX_ASSIGNED; i++) assert.ok(!assignPlan(db, 'u1', 'F', plan('p' + i)).error);
  assert.ok(assignPlan(db, 'u1', 'F', plan('one too many')).error);
});

test('assignedFor: files the routine under a-<aid>; unassign and drop remove it', () => {
  const db = {};
  const a = assignPlan(db, 'u1', 'Faraaz', plan());
  const got = assignedFor(db, 'u1');
  assert.equal(got[0].routine.id, 'a-' + a.aid);
  assert.deepEqual(assignedFor(db, 'u2'), []);
  assert.equal(unassignPlan(db, 'u1', 'nope'), false);
  assert.equal(unassignPlan(db, 'u1', a.aid), true);
  assert.equal(db.assigned.u1, undefined);
  assignPlan(db, 'u1', 'F', plan());
  dropAssigned(db, 'u1');
  assert.deepEqual(assignedFor(db, 'u1'), []);
});

test('assignedReport: counts the sessions of that routine since it was assigned', () => {
  const db = {};
  const a = assignPlan(db, 'u1', 'Faraaz', plan(), Date.parse('2026-11-15T10:00:00Z'));
  const id = 'a-' + a.aid;
  const r = assignedReport(db, 'u1', [
    { d: '2026-11-10', routineId: id },                 // before it was assigned
    { d: '2026-11-16', routineIds: [id, 'other'] },
    { d: '2026-11-18', routineId: id },
    { d: '2026-11-17', routineId: 'something else' },
  ]);
  assert.deepEqual(r[0], { aid: a.aid, name: 'Push day', emoji: 'figureStrength', by: 'Faraaz', at: '2026-11-15T10:00:00.000Z', exercises: 2, sessions: 2, lastTrained: '2026-11-18' });
  assert.equal(assignedReport(db, 'u1', [])[0].lastTrained, null);
});
