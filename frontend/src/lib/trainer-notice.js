// What the app owes a trainee about their trainer, as plain decisions the screen only carries out.
// Pure so a test can hold it (components/TrainerNotice.jsx does the asking and the calls).

/** The trainee has a trainer they have not been told about yet (an admin moved them there). */
export const needsAck = user => !!user?.myTrainer && user.myTrainer.ack === false
