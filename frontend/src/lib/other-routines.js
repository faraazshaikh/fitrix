// "Or start one of these" on Home (v1.4.13): the routines you could do instead of today's, one tap
// each. The ones a trainer or admin gave you come first (lib/assigned-plan.js marks them
// `assigned`), then whichever you have gone longest without. A routine with no exercises is not
// offered. Rotation has its own row of chips (components/QueueRow.jsx), so this is for a week.
//
// Pure: takes the saved state.

const idsOf = w => (Array.isArray(w?.routineIds) && w.routineIds.length ? w.routineIds : [w?.routineId]).filter(Boolean)

/** The day each routine was last logged: { [routineId]: 'YYYY-MM-DD' }. */
export function lastDone(workouts) {
  const out = {}
  for (const w of Array.isArray(workouts) ? workouts : []) {
    if (!w || !w.d) continue
    for (const id of idsOf(w)) if (!out[id] || w.d > out[id]) out[id] = w.d
  }
  return out
}

/**
 * Up to `max` routines other than `skipIds` (today's), assigned plans first, then never done, then
 * longest since. Ties keep the order of the plan.
 */
export function otherRoutines(S, skipIds = [], max = 4) {
  const skip = new Set(skipIds)
  const last = lastDone(S?.workouts)
  const list = (Array.isArray(S?.routines) ? S.routines : [])
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r && r.id && !skip.has(r.id) && Array.isArray(r.ex) && r.ex.length > 0)
  list.sort((a, b) => {
    const as = a.r.assigned ? 0 : 1, bs = b.r.assigned ? 0 : 1
    if (as !== bs) return as - bs
    const ad = last[a.r.id] || '', bd = last[b.r.id] || ''
    if (ad !== bd) return ad < bd ? -1 : 1
    return a.i - b.i
  })
  return list.slice(0, max).map(x => x.r)
}
