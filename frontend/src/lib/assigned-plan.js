// Plans an admin assigned to this profile (GET /api/assigned, api/assigned-plan.js), filed into the
// state as ordinary routines. A routine that came this way carries `assigned: { aid, by, at }`:
// `at` is when the admin last sent it, so a newer one replaces the copy here and the same one
// leaves it alone (the person may have changed it since, until the admin sends it again). A plan
// the admin took back goes too. Pure: it works on the draft the store's update() hands it.
import { deleteRoutine } from './routines.js'

const valid = p => p && typeof p.aid === 'string' && p.routine && typeof p.routine.id === 'string' && Array.isArray(p.routine.ex)

/** Whether applying `plans` to `S` would change anything: the store only saves when it would. */
export function assignedChanges(S, plans) {
  const list = (Array.isArray(plans) ? plans : []).filter(valid)
  const mine = (S.routines || []).filter(r => r && r.assigned)
  if (mine.some(r => !list.some(p => p.aid === r.assigned.aid))) return true
  return list.some(p => (S.routines || []).find(r => r && r.id === p.routine.id)?.assigned?.at !== p.at)
}

/** File the plans into the draft `S`. Returns what happened, for a toast. */
export function applyAssigned(S, plans) {
  const list = (Array.isArray(plans) ? plans : []).filter(valid)
  S.routines = S.routines || []
  S.customEx = S.customEx || []
  const out = { added: [], updated: [], removed: [] }
  for (const r of S.routines.filter(x => x && x.assigned && !list.some(p => p.aid === x.assigned.aid))) {
    out.removed.push(r.name)
    deleteRoutine(S, r.id)
  }
  for (const p of list) {
    for (const c of Array.isArray(p.customEx) ? p.customEx : []) {
      if (c && c.id && !S.customEx.some(x => x && x.id === c.id)) S.customEx.push(c)
    }
    const next = { ...p.routine, assigned: { aid: p.aid, by: p.by, at: p.at } }
    const i = S.routines.findIndex(r => r && r.id === next.id)
    if (i < 0) { S.routines.push(next); out.added.push(next.name) }
    else if (S.routines[i].assigned?.at !== p.at) { S.routines[i] = next; out.updated.push(next.name) }
  }
  return out
}
