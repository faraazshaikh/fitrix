// What a sign-up owes the server besides a name: the 18+ confirmation, and, under a trainer's
// invite, the trainee's yes to "your trainer can see ..." after being shown whose it is. The
// server enforces both (api/server.js: ADULT, trainerConsent). The first try under a trainer's
// code is answered 409 { code: 'trainer-consent', trainer }; the screen shows the line and the
// same request goes again with trainerSeen. Pure, so a test can drive it without a screen.

export const isTrainerConsent = e => e?.status === 409 && e?.data?.code === 'trainer-consent'

// `send(extra)` makes the sign-up request with `extra` merged in. `ask(trainerName)` resolves
// true when the person agrees. Declining ends it with an AbortError, which the sign-up screens
// already treat as "they backed out" and stay quiet about.
export async function withTrainerConsent(send, ask) {
  try { return await send({}) }
  catch (e) {
    if (!isTrainerConsent(e)) throw e
    if (!(await ask(String(e.data.trainer || '')))) { const a = new Error('declined'); a.name = 'AbortError'; throw a }
    return send({ trainerSeen: true })
  }
}
