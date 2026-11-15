// Trainers (docs/dev/trainers.md). Three kinds of people on one server: an admin sees every
// profile, a trainer sees only their own trainees, everyone else sees only themselves.
//
// Everything a trainer may reach rests on one rule, canTrain(), asked on every request against the
// live records in db.json. Nothing here is cached and nothing is granted by a token: a trainer who
// is demoted, disabled or past their end date loses their trainees on the very next request.
//
// What a trainer is shown of a trainee is an allow-list (traineeView): a field that is not named
// below never leaves the server, whatever a later version adds to a profile.
// Kept as a small module with no imports so it can be unit-tested without booting the server.

export const MAX_OPEN_INVITES = 25;      // unused invites one trainer can have at a time
export const MAX_MOVE = 200;             // trainees one admin request can move

const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
const num = v => typeof v === 'number' && Number.isFinite(v);
const record = x => !!x && typeof x === 'object' && !Array.isArray(x);
const records = v => (Array.isArray(v) ? v.filter(record) : []);
const never = () => false;

export const isTrainer = u => !!u && u.trainer === true;

/** The one rule. `caller` trains `target`: the flag, the link, and never oneself. */
export const canTrain = (caller, target) =>
  isTrainer(caller) && !!target && typeof caller.id === 'string' && !!caller.id &&
  target.trainerId === caller.id && target.id !== caller.id;

/** canTrain, and the trainee has been told who their trainer is: only then is their data shown. */
export const canSee = (caller, target) => canTrain(caller, target) && target.trainerAck === caller.id;

/** The profile with this id when it is a trainer who can act right now, or null. */
export function activeTrainer(db, id, isLocked = never) {
  if (typeof id !== 'string' || !id) return null;
  const t = (db.users || []).find(x => x.id === id);
  return t && isTrainer(t) && !isLocked(t) ? t : null;
}

/** Who trains `u` right now, or null: no link, or a trainer who is gone, demoted or locked out. */
export function effectiveTrainer(db, u, isLocked = never) {
  if (!u || !u.trainerId || u.trainerId === u.id) return null;
  return activeTrainer(db, u.trainerId, isLocked);
}

export const traineesOf = (db, trainerId) =>
  (typeof trainerId === 'string' && trainerId ? (db.users || []).filter(u => u.trainerId === trainerId && u.id !== trainerId) : []);

/** What a trainee's own app is told about their trainer: the name, and whether they have seen it. */
export function myTrainer(db, u, isLocked = never) {
  const t = effectiveTrainer(db, u, isLocked);
  return t ? { name: str(t.name, 40), ack: u.trainerAck === t.id } : null;
}

/**
 * For the admin's banner: everyone who had a trainer and has none that can act now, with how
 * they got there. Access never reads this; it is derived for display only.
 */
export function unassigned(db, isLocked = never) {
  const out = [];
  for (const u of db.users || []) {
    if (effectiveTrainer(db, u, isLocked)) continue;
    if (u.trainerId) {
      const t = (db.users || []).find(x => x.id === u.trainerId);
      out.push({ id: u.id, name: u.name, why: !t ? 'deleted' : !isTrainer(t) ? 'demoted' : 'locked', trainerName: t ? t.name : null, at: null });
    } else if (record(u.trainerGone)) {
      out.push({ id: u.id, name: u.name, why: str(u.trainerGone.why, 20) || 'gone', trainerName: u.trainerGone.name || null, at: u.trainerGone.at || null });
    }
  }
  return out;
}

/* ---------- changes to the link ---------- */

/** Put `u` under a trainer. A different trainer than before has to be shown to them again. */
export function setTrainer(u, trainerId) {
  if (u.trainerId !== trainerId) { delete u.trainerAck; delete u.trainerAckAt; }
  u.trainerId = trainerId;
  delete u.trainerGone;
}

/** The trainee has been shown who their trainer is. Kept with its date: it is their consent. */
export function ackTrainer(u, trainerId, now = Date.now()) {
  if (u.trainerId !== trainerId || u.trainerAck === trainerId) return;
  u.trainerAck = trainerId;
  u.trainerAckAt = new Date(now).toISOString();
}

/** Take `u` out from under their trainer. `why` keeps them on the admin's banner; none clears it. */
export function clearTrainer(u, why = null, trainerName = null, now = Date.now()) {
  delete u.trainerId;
  delete u.trainerAck;
  delete u.trainerAckAt;
  if (why) u.trainerGone = { why, at: new Date(now).toISOString(), ...(trainerName ? { name: str(trainerName, 40) } : {}) };
  else delete u.trainerGone;
}

/** An invite a trainer made for themselves, as opposed to one an admin made. */
export const ownInvite = (inv, trainerId) => !!inv && !!trainerId && inv.createdBy === trainerId && inv.trainerId === trainerId;

/**
 * A trainer stops being one (demoted or deleted): their trainees go to "no trainer" and their
 * unused invites go, so nothing points at them any more. Returns how many trainees were let go.
 */
export function trainerLeaves(db, trainer, why, now = Date.now()) {
  const mine = traineesOf(db, trainer.id);
  for (const u of mine) clearTrainer(u, why, trainer.name, now);
  db.invites = (db.invites || []).filter(i => !(ownInvite(i, trainer.id) && !i.usedBy));
  return mine.length;
}

/* ---------- invites ---------- */

/**
 * What role and trainer an invite may carry for this caller. A trainer's invite is always a
 * trainee of their own: `role` and `trainerId` in their request are never read.
 */
export function inviteRole(caller, body, { as = 'trainer', db = { users: [] }, isLocked = never } = {}) {
  if (as !== 'admin') return isTrainer(caller) ? { trainerId: caller.id } : { error: 'not a trainer' };
  const b = record(body) ? body : {};
  const role = b.role === undefined || b.role === null || b.role === '' ? 'trainee' : b.role;
  if (role !== 'trainee' && role !== 'trainer') return { error: 'role must be trainee or trainer' };
  const out = role === 'trainer' ? { role: 'trainer' } : {};
  if (b.trainerId !== undefined && b.trainerId !== null && b.trainerId !== '') {
    const t = activeTrainer(db, b.trainerId, isLocked);
    if (!t) return { error: 'that trainer is not available' };
    out.trainerId = t.id;
  }
  return out;
}

/**
 * Whether an invite still lets someone in. One a trainer made for themselves only works while
 * that trainer can act, so disabling a trainer also closes the codes they handed out.
 */
export function inviteLive(db, inv, { isLocked = never, isAdmin = never } = {}) {
  if (!inv) return false;
  if (!inv.trainerId || inv.createdBy !== inv.trainerId) return true;
  const maker = (db.users || []).find(x => x.id === inv.createdBy);
  return !!maker && !isLocked(maker) && (isTrainer(maker) || isAdmin(maker));
}

export const openInvitesOf = (db, trainerId) => (db.invites || []).filter(i => ownInvite(i, trainerId) && !i.usedBy && !i.revoked);

/**
 * What a new profile gets from the invite it signed up with. The role and the trainer come from
 * the stored invite only. `seen` says the sign-up screen showed who the trainer is.
 */
export function inviteGrants(db, inv, { isLocked = never, seen = false, now = Date.now() } = {}) {
  const out = {};
  if (!inv) return out;
  if (inv.role === 'trainer') out.trainer = true;
  if (inv.trainerId) {
    const t = activeTrainer(db, inv.trainerId, isLocked);
    if (t) { out.trainerId = t.id; if (seen) { out.trainerAck = t.id; out.trainerAckAt = new Date(now).toISOString(); } }
    else {
      const gone = (db.users || []).find(x => x.id === inv.trainerId);
      out.trainerGone = { why: 'invite', at: new Date(now).toISOString(), ...(gone ? { name: str(gone.name, 40) } : {}) };
    }
  }
  return out;
}

/** An invite as its trainer sees it: no account ids. */
export const inviteForTrainer = i => ({
  code: i.code, name: i.name || i.note || '', ...(i.email ? { email: i.email } : {}), created: i.created || null,
  used: !!i.usedBy, usedAt: i.usedAt || null
});

/* ---------- what a trainer sees ---------- */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** A dated reading with its numbers and nothing else (no source, no notes). */
function reading(e) {
  const out = { d: str(e.d, 10) };
  for (const [k, v] of Object.entries(e)) if (k !== 'd' && num(v)) out[k] = v;
  return out;
}
const UNITS = ['cm', 'in', '%', 'kg', 'lb', 'none'];
function measurement(e) {
  const out = reading(e);
  out.other = records(e.other).map(o => ({
    id: str(String(o.id ?? ''), 80), name: str(o.name, 60), value: num(o.value) ? o.value : null,
    ...(UNITS.includes(o.unit) ? { unit: o.unit } : {})
  })).filter(o => o.id);
  return out;
}
// A logged workout without its photos and videos (`media`) and without what a watch measured
// (`hr`): neither is part of what a trainee was told their trainer sees.
const WORKOUT_KEYS = ['id', 'd', 'start', 'end', 'routineIds', 'routineId', 'name', 'bw', 'entries', 'prs', 'excludeFromProgression', 'note', 'rpe', 'gym'];
function workout(w) {
  const out = {};
  for (const k of WORKOUT_KEYS) if (w[k] !== undefined) out[k] = w[k];
  return out;
}
const lastSyncOf = (u, S) => Math.max((S && num(S._ts) && S._ts) || 0, (num(u.lastPull) && u.lastPull) || 0) || null;
const lastDay = ws => ws.reduce((m, w) => (typeof w.d === 'string' && (!m || w.d > m) ? w.d : m), null);

/** A row of the trainer's list. A trainee who has not been told yet shows by name only. */
export function traineeRow(user, state, plans = 0, waiting = false) {
  const base = { id: user.id, name: user.name, plans };
  if (waiting) return { ...base, waiting: true };
  const S = record(state) ? state : {};
  return { ...base, lastWorkout: lastDay(records(S.workouts)), lastSync: lastSyncOf(user, S), expiresAt: user.expiresAt || null };
}

/**
 * One trainee as their trainer sees them. `assigned` is the report of the plans they hold
 * (assigned-plan.js). `waiting` (the trainee has not been told yet) gives the name and the plans
 * handed out, and nothing the trainee logged.
 */
export function traineeView(user, state, assigned = [], waiting = false) {
  if (waiting) {
    return {
      user: { id: user.id, name: user.name }, waiting: true,
      assigned: assigned.map(({ aid, name, emoji, by, at, exercises }) => ({ aid, name, emoji, by, at, exercises }))
    };
  }
  const S = record(state) ? state : {};
  const workouts = records(S.workouts);
  return {
    user: { id: user.id, name: user.name, created: user.created || null, expiresAt: user.expiresAt || null },
    unit: S.unit === 'lb' ? 'lb' : 'kg',
    lengthUnit: S.lengthUnit === 'cm' ? 'cm' : 'in',
    lastSync: lastSyncOf(user, S),
    lastWorkout: lastDay(workouts),
    routines: records(S.routines).map(r => ({ id: r.id, name: r.name, emoji: r.emoji, count: records(r.ex).length })),
    assigned,
    workouts: workouts.map(workout).reverse(),
    bodyweight: records(S.bodyweight).filter(e => DAY.test(e.d || '')).map(reading),
    measurements: records(S.measurements).filter(e => DAY.test(e.d || '')).map(measurement)
  };
}
