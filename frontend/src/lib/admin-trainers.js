// The admin dashboard's trainer logic, kept out of the screen so a test can hold it. The server
// decides who may do what (api/trainer.js); this only chooses what to list and show.

/** Who can be picked as someone's trainer: trainers who can act (not disabled, access not ended). */
export const trainerChoices = (users, exceptId = null) =>
  (users || []).filter(u => u.trainer && !u.disabled && !u.expired && u.id !== exceptId)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))

/**
 * The people list under a filter: 'all', 'trainers', 'trainees' (has a trainer), 'none' (the
 * "no trainer" list: had one and lost it), or a trainer's id (that trainer's trainees).
 */
export function filterUsers(users, filter) {
  const list = users || []
  switch (filter) {
    case undefined: case null: case '': case 'all': return list
    case 'trainers': return list.filter(u => u.trainer)
    case 'trainees': return list.filter(u => u.trainerId)
    case 'none': return list.filter(u => u.noTrainer)
    default: return list.filter(u => u.trainerId === filter)
  }
}

const WHY = {
  demoted: 'their trainer is no longer a trainer', deleted: 'their trainer was deleted', locked: 'their trainer is disabled',
  released: 'their trainer released them', left: 'they left their trainer', invite: 'their trainer’s invite stopped working'
}
/** One line for the "no trainer" list. */
export const noTrainerWhy = u => {
  const why = WHY[u.why] || 'no trainer can act for them now'
  return u.trainerName ? why + ' (' + u.trainerName + ')' : why
}

/** The body for POST /api/admin/invites/new: a trainer's invite carries no trainer of its own. */
export function inviteBody({ name, email, months, role, trainerId }) {
  const b = { name, email, months }
  if (role === 'trainer') b.role = 'trainer'
  else if (trainerId) b.trainerId = trainerId
  return b
}
