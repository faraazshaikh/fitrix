// A plan an admin hands to another profile. The routine is copied into db.assigned[uid] (db.json,
// next to the invites): the person's own device fetches it (GET /api/assigned) and files it into
// its own state, the way any change of theirs is saved and synced. The server never writes into a
// profile's state document, so the sync stamps and revisions stay as they are.
// Kept as a small module so it can be unit-tested without booting the server.
import crypto from 'node:crypto';

export const MAX_ASSIGNED = 12;          // routines one person can have from an admin at a time
const MAX_BYTES = 64 * 1024;             // one routine with the custom exercises it uses

const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const plain = v => JSON.parse(JSON.stringify(v));

/** The routine and the custom exercises it uses, as plain data, or { error } when it is not usable. */
export function cleanPlan(input) {
  const r = input && input.routine;
  if (!r || typeof r !== 'object' || Array.isArray(r)) return { error: 'routine required' };
  const name = str(r.name, 60);
  if (!name) return { error: 'the routine needs a name' };
  if (!Array.isArray(r.ex) || !r.ex.length) return { error: 'the routine has no exercises' };
  if (r.ex.length > 60) return { error: 'too many exercises' };
  let routine;
  try { routine = plain({ ...r, name }); } catch { return { error: 'routine is not plain data' }; }
  // What identifies it on the person's side is ours, never the admin's own routine id, and the
  // marks of the admin's copy (sync stamps, an import key) stay behind.
  delete routine.id; delete routine._ts; delete routine.assigned; delete routine.importKey;
  if (!routine.ex.every(e => e && typeof e === 'object' && typeof e.id === 'string' && e.id)) return { error: 'every exercise needs an id' };
  const used = new Set(routine.ex.map(e => e.id));
  const customEx = (Array.isArray(input.customEx) ? input.customEx : []).filter(c => c && typeof c.id === 'string' && used.has(c.id));
  let out;
  try { out = { routine, customEx: plain(customEx) }; } catch { return { error: 'exercises are not plain data' }; }
  if (JSON.stringify(out).length > MAX_BYTES) return { error: 'the plan is too large' };
  return out;
}

/** Give `uid` the plan; the same `aid` again replaces it. Returns the stored entry or { error }. */
export function assignPlan(db, uid, by, input, now = Date.now(), aid = null) {
  const clean = cleanPlan(input);
  if (clean.error) return clean;
  db.assigned = db.assigned || {};
  const list = db.assigned[uid] = db.assigned[uid] || [];
  const at = new Date(now).toISOString();
  const existing = aid && list.find(x => x.aid === aid);
  if (aid && !existing) return { error: 'no such assigned plan' };
  if (existing) { Object.assign(existing, { ...clean, by, at }); return existing; }
  if (list.length >= MAX_ASSIGNED) return { error: 'this person already has ' + MAX_ASSIGNED + ' assigned plans' };
  const entry = { aid: crypto.randomBytes(6).toString('base64url'), by, at, ...clean };
  list.push(entry);
  return entry;
}

/** Take a plan back. True when there was one. */
export function unassignPlan(db, uid, aid) {
  const list = db.assigned && db.assigned[uid];
  if (!list) return false;
  const n = list.length;
  db.assigned[uid] = list.filter(x => x.aid !== aid);
  if (!db.assigned[uid].length) delete db.assigned[uid];
  return n !== (db.assigned[uid] || []).length;
}

/** What the person's device gets: ids it can file the routine under, nothing about who else has it. */
export const assignedFor = (db, uid) => ((db.assigned && db.assigned[uid]) || []).map(x => ({
  aid: x.aid, by: x.by, at: x.at, routine: { ...x.routine, id: 'a-' + x.aid }, customEx: x.customEx,
}));

/**
 * For the admin: each assigned plan with whether the person has trained it. A workout counts when
 * it names the routine (routineIds / routineId carry the 'a-<aid>' id the person's copy has).
 */
export function assignedReport(db, uid, workouts) {
  const list = (db.assigned && db.assigned[uid]) || [];
  return list.map(x => {
    const id = 'a-' + x.aid;
    const done = (workouts || []).filter(w => w && (w.routineId === id || (Array.isArray(w.routineIds) && w.routineIds.includes(id))))
      .filter(w => !w.d || w.d >= x.at.slice(0, 10));
    const last = done.reduce((m, w) => (w.d && (!m || w.d > m) ? w.d : m), null);
    return { aid: x.aid, name: x.routine.name, emoji: x.routine.emoji || null, by: x.by, at: x.at, exercises: x.routine.ex.length, sessions: done.length, lastTrained: last };
  });
}

/** Drop everything held for a profile that is being deleted. */
export function dropAssigned(db, uid) { if (db.assigned) delete db.assigned[uid]; }
