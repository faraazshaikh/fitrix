// What the app owes a trainee about their trainer, as plain decisions the screen only carries out.
// Pure so a test can hold it (components/TrainerNotice.jsx does the asking and the calls).

/** The trainee has a trainer they have not been told about yet (an admin moved them there). */
export const needsAck = user => !!user?.myTrainer && user.myTrainer.ack === false

/**
 * A profile that is brand new under a trainer starts with Simple settings on, once: a person
 * a trainer brought in wants the basics first. Never touches a choice made (simple set either
 * way) or a profile that already has history.
 */
export function wantsSimpleDefault(user, S) {
  if (!user?.myTrainer) return false
  if (!S || S.simple !== undefined) return false
  const has = k => Array.isArray(S[k]) && S[k].length > 0
  return !has('workouts') && !has('bodyweight') && !has('measurements')
}
