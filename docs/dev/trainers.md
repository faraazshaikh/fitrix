# Trainers (design, not built yet)

Status: spec for v1.5.0. Nothing here is in the code until this is approved.

## What it is

Three kinds of people on one server:

| Who | Sees | Can do |
| --- | --- | --- |
| **Admin** (today's admin, the owner included) | every profile | everything the admin dashboard does today, plus make and unmake trainers and move a trainee from one trainer to another |
| **Trainer** | only their own trainees | invite trainees, see their workouts and body weight, give, update and take back plans, release a trainee |
| **Trainee** (every other profile) | only themselves, and the name of their trainer | train, leave their trainer |

A trainer never sees another trainer's trainees, their invites, or that they exist.

## Decisions already taken

1. Only an admin creates trainers. A trainer invites trainees only.
2. A trainee is told, in plain words, that their trainer can see their workouts and body weight.
3. The app is for adults: sign-up asks for an 18+ confirmation.
4. An admin can change trainee to trainer and back at any time.
5. When a trainer leaves, their trainees keep the app and go to the admin as "no trainer" until the admin gives them a new one.

## Data model (db.json, no new files)

On a user record:

- `trainer: true` when the person is a trainer. Absent otherwise. Same shape as `admin: true`. A person can be both admin and trainer.
- `trainerId: '<uid>'` on a trainee: who trains them. Absent = no trainer.
- `trainerAck: '<uid>'` the trainer id the trainee has been told about (see "Consent").
- `adult: '<ISO date>'` when they confirmed 18+.

On an invite (`db.invites[]`), next to the fields it has (`code`, `name`, `email`, `months`, `createdBy`):

- `role: 'trainer'` only when an admin made it for a trainer. Absent = trainee.
- `trainerId: '<uid>'` whose trainee the new profile becomes. Set by the server from the session for a trainer's invite, never read from a trainer's request body.

`db.assigned[uid]` (assigned-plan.js) is unchanged. Entries keep `by` (a display name). Who may change an entry is decided by the trainee relationship at the time of the request, not by who wrote the entry, so moving a trainee moves control of their plans with no data change.

### The one rule everything rests on

```
canTrain(caller, target) =
  caller.trainer === true
  && target.trainerId === caller.id
  && target.id !== caller.id
```

Checked on every request against the live records. `sessionUser()` already loads the user from db.json on every request and refuses locked accounts, so a demoted, disabled or expired trainer loses access on their very next request with no token to revoke.

"No trainer" is derived, never stored: a profile has no effective trainer when `trainerId` is absent, or points at a profile that is gone, is no longer a trainer, or is locked. Clean-up of stale `trainerId` values is housekeeping only. If the clean-up were ever skipped, access still fails closed.

## Server

### New module `api/trainer.js` (pure, unit-tested, added to the Dockerfile COPY line)

- `isTrainer(u)`
- `canTrain(caller, target)`
- `effectiveTrainer(db, u)` returns the active trainer's record or null
- `traineesOf(db, trainerId)`
- `unassigned(db)` profiles whose trainer is gone, demoted or locked, plus (for the banner only) how they got there
- `traineeView(user, state, db)` the allow-list below
- `inviteRole(caller, body)` what role and trainerId an invite may carry for this caller

### Guard

One function in server.js, used by `/api/trainer/trainee` and every `/api/trainer/trainee/...` route (the ones that take a trainee id), and nothing else:

```
function requireTrainee(req, res, id)   // -> { trainer, trainee } or null after replying
  401 when not signed in
  404 { error: 'not found' } when the caller is not a trainer
  404 { error: 'not found' } when the id does not exist
  404 { error: 'not found' } when the id exists but is not this trainer's trainee
```

The same body and status for all three 404s, so a trainer cannot use the answer to learn whether an account id exists. A refusal for a real id that belongs to someone else is written to the activity log (`trainer.denied`), the way `admin.denied` is.

### Routes

Trainer, own trainees only:

| Route | Does |
| --- | --- |
| `GET /api/trainer/trainees` | the list: id, name, last workout date, last sync, access end date, plan count, `waiting` when the trainee has not yet been told (see Consent) |
| `GET /api/trainer/trainee?id=` | `traineeView` for one trainee |
| `POST /api/trainer/trainee/plan` | body as `POST /api/admin/user/plan`; same `assignPlan` |
| `POST /api/trainer/trainee/plan/remove` | same `unassignPlan` |
| `POST /api/trainer/trainee/release` | the trainer lets a trainee go: `trainerId` cleared, they go to "no trainer" |
| `GET /api/trainer/invites` | only invites with `createdBy === caller.id` |
| `POST /api/trainer/invites/new` | makes a trainee invite bound to the caller; `role` and `trainerId` in the body are ignored |
| `POST /api/trainer/invites/revoke` | only the caller's own, only unused |

Trainee:

| Route | Does |
| --- | --- |
| `POST /api/trainer/ack` | records that the trainee has seen who their trainer is |
| `POST /api/trainer/leave` | clears `trainerId` and `trainerAck`; assigned plans stay on their phone |

Admin (existing guard `requireAdmin`):

| Route | Change |
| --- | --- |
| `POST /api/admin/user/trainer-role` | new. `{ id, trainer: true|false }`. Demoting leaves the trainees with no effective trainer at once |
| `POST /api/admin/user/trainer` | new. `{ ids: [...], trainerId: '<uid>' | null }` moves one or many trainees. The target must be an active trainer and not one of the ids. A move to a different trainer clears `trainerAck`, also when someone is moved away and later back |
| `POST /api/admin/invites/new` | accepts `role: 'trainee' | 'trainer'` and an optional `trainerId` |
| `GET /api/admin/users`, `GET /api/admin/user` | each row gains `trainer`, `trainerId`, `trainerName`, `noTrainer` |
| `GET /api/me` (`publicUser`) | gains `trainer: true` for a trainer, and `myTrainer: { name, ack }` for a trainee. Never the trainer's id or anything else about them |

Every new route gets its entry in `api/openapi.yaml` (the route test compares them) and `website/api.html` is regenerated.

### What a trainer sees of a trainee (`traineeView`, an allow-list)

- name, created date, access end date
- last sync, last workout date
- routines: id, name, emoji, exercise count
- assigned plans with sessions and last trained (`assignedReport`)
- workouts, without their photos and videos (as the admin view already strips them)
- body weight log

Never: e-mail, whether a password is set, passkeys, invite code, recovery or reset codes, body measurements other than weight, progress photos, Coach chats, integrations, push subscriptions, the activity log.

A trainer cannot: disable, delete, extend access, reset a password, make a recovery code, change roles, read the activity log, or call any `/api/admin/*` route (those stay `requireAdmin`, and a trainer is not an admin).

### Sign-up changes (both `/api/register/verify` and `/api/register/password`)

- Today the invite is only looked up when `INVITE_ONLY` is on. Change: a valid code is always resolved and burned when one is sent, so its role and trainer apply on an open instance too. An invalid code is still only an error when `INVITE_ONLY` is on.
- New profile gets `trainer: true` if `invite.role === 'trainer'`, `trainerId` if the invite carries one **and that trainer is still active at this moment** (otherwise the profile starts with no trainer), and `trainerAck = trainerId` because the sign-up screen showed the consent line.
- `adult: true` is required in the body. Without it: 400 `{ code: 'adult' }`. The web app is always current; an old APK gets "update the app".
- The invite's role is read from the stored invite, never from the sign-up body.

### When a trainer goes

One code path for all of these: demoted, disabled, expired, deleted by an admin, deleted by themselves.

- Their trainees have no effective trainer from that request on (derived rule above).
- `removeAccount()` and the demote route also clear `trainerId` and `trainerAck` on their trainees and drop their unused invites, so nothing dangles.
- Disabled or expired trainers keep their `trainerId` links: if the admin enables them again, they get their trainees back. Meanwhile the trainees show under "no trainer".
- Trainees are never locked out, and the plans they were given stay.
- Admin dashboard shows "N people have no trainer" with a Move button.

### Consent

- Invite sign-up screen, when the invite is bound to a trainer: "Your trainer <name> and the Fitrix admin can see your workouts and body weight. You can leave your trainer at any time in You." Shown before the account is created.
- When an admin moves a trainee to a different trainer, the new trainer gets the trainee in their list as `waiting`, with the name only. Workouts and body weight open up once the trainee has opened the app and seen "Your trainer is now <name>" (`POST /api/trainer/ack`). Giving plans works straight away, since that reads nothing.
- You, Account shows the trainer's name and a "Leave trainer" button.

This is a product decision, not legal advice. Body weight is personal data about health under UK and Indian law, so before real customers use it the privacy wording should be checked by someone qualified.

### Limits

- 25 unused invites per trainer at a time.
- 12 assigned plans per trainee (already there).
- Trainer invites carry no access end date unless decided otherwise (open question 1).

### Activity log

`trainer.invite.create`, `trainer.invite.revoke`, `trainer.plan.assign`, `trainer.plan.remove`, `trainer.release`, `trainer.leave`, `trainer.denied`, `admin.trainer.grant`, `admin.trainer.revoke`, `admin.trainer.move`. Labels go into `frontend/src/lib/audit.js`.

## App

- `views/Trainer.jsx`, route `/trainer`: the list, a trainee's page (plans, workouts, weight), invites. Reached from You as "My trainees", shown only when `user.trainer`.
- `GivePlanSheet` and `AssignedPlans` move out of `views/Admin.jsx` into `components/` and take the API calls as props, so the admin and the trainer screens share them.
- `views/Admin.jsx`: Trainee / Trainer choice and an optional "Trainer" picker on the invite form; a Trainer switch and a "Trainer" picker on each person; the "no trainer" banner with Move; a trainer filter on the user list.
- Sign-up: the consent line and the 18+ box.
- You, Account: trainer name and Leave trainer.
- New strings are plain English, like the admin screen's.

## Tests (the release is blocked on these)

`api/test/trainer.test.js`, pure functions:

1. `canTrain` true only for trainer flag + matching `trainerId`; false for self, for a demoted trainer, for a stale `trainerId`.
2. `effectiveTrainer` null for missing, demoted, disabled, expired trainer.
3. `traineeView` holds only allow-listed keys (snapshot of the key list, so adding a field is a deliberate act).
4. `inviteRole`: a trainer caller can never produce `role: 'trainer'` or another trainer's id.

`api/test/server-trainer.test.js`, real server process. Cast: Admin, T1, T2, A (T1's trainee), B (T2's trainee), C (no trainer).

Isolation:

5. T1 `GET trainee?id=B` is 404, byte-identical to an id that does not exist.
6. T1 plan assign, plan remove, release on B: 404, and B's data is unchanged.
7. T1 `GET trainees` lists A only. T1 `GET invites` lists T1's only.
8. T1 revoking T2's invite code: 404, invite still there.
9. T1 on every `/api/admin/*` route: 403.
10. A (a trainee) on every `/api/trainer/*` trainer route: 404.
11. Nobody signed in on every `/api/trainer/*` route: 401.
12. **Sweep test**: read `/api/trainer/trainee` and every path under `/api/trainer/trainee/` from `openapi.yaml` and assert T2 gets 404 with A's id. A route added later without the guard fails this test without anyone remembering to write a case for it.

Invites and sign-up:

13. T1's invite with `role: 'trainer'` and `trainerId: T2` in the body creates a plain trainee of T1.
14. Signing up with T1's invite gives `trainerId: T1`, no trainer flag, ack set.
15. An admin trainer-invite gives `trainer: true`.
16. Sign-up body carrying `trainer: true` or `trainerId` is ignored.
17. Invite used after its trainer was demoted: the profile is created with no trainer.
18. Sign-up without `adult: true` is refused.
19. The 26th open invite for one trainer is refused.

Lifecycle:

20. Admin moves A from T1 to T2: T1 gets 404 on A at once; T2 sees A as `waiting` with no workouts; after A's ack T2 sees them. Moved back to T1 without an ack: T1 sees `waiting` too.
21. T1 demoted: every T1 trainee route is 404 with the session T1 already holds; A shows under "no trainer".
22. T1 disabled then enabled: A is T1's again.
23. T1 deletes their own account: A has no trainer, T1's unused invites are gone, A can still sign in and still has the plan.
24. A leaves: T1 gets 404 on A; A's `GET /api/assigned` still returns the plan.
25. Moving to a target that is not an active trainer, or to the trainee themselves: 400.
26. T1 updates a plan the admin gave A (allowed: control follows the relationship). T1 cannot after A is moved.

Frontend: `Trainer.test.jsx` (list, give plan, waiting state), `Admin.test.jsx` additions (invite role choice, move, banner), sign-up consent and 18+ box.

## Ways to break it that were considered

| Attack or slip | Why it fails |
| --- | --- |
| Trainer guesses another trainee's id | ids are 96 random bits; and the guard answers 404 either way |
| Trainer sends `trainerId` or `role` in an invite or plan body | never read from a trainer's body |
| New user sends `trainer: true` at sign-up | role comes only from the stored invite |
| Demoted trainer keeps using an open session | role is read from db.json on every request |
| Stale `trainerId` after a delete | access needs a live trainer record with the flag; clean-up is not load-bearing |
| A new trainer route forgets the guard | sweep test 12 |
| Trainer reads data through an existing route | checked in server.js: every existing data route serves only the caller's own profile (`/api/data`, `/api/media`, `/api/assigned`, watch, push, passkeys); admin routes need `requireAdmin`. The one cross-profile feature, the Coach's "compare with others here", is off unless the admin enables it and each person opts in, and it only gives medians of three or more people |
| Trainer learns which accounts exist from error differences | one 404 for all cases |
| Admin moves someone without telling them | the new trainer sees no data until the trainee has been shown the change |
| Trainer floods invites | 25 open at a time. Note the consequence that is by design: on an invite-only server every trainer is now a way in. The admin's invite list shows every code, who made it and who used it |
| Trainee moved T1 to T2 and back to T1 | ack was cleared on the first move, so T1 waits for the trainee again |
| Trainer invite used on an open (not invite-only) server is ignored | invite is now always resolved when sent |
| Two trainers train each other | allowed and harmless: access is one hop, each sees only the other's workouts and weight, by an admin's deliberate move |

Known gaps, accepted for v1.5.0:

- A custom exercise's photo does not travel with an assigned plan (media is served only from the owner's folder). True today for admin plans too.
- The trainee's copy of a plan says "From <name>" with the name at the time it was sent.
- No push notification when a plan arrives. Worth adding with pull to refresh.
- An admin can see everything. That is said in the consent line, not hidden.

## Open questions

1. **Access length on a trainer's invite.** Default here: none (indefinite), and only an admin sets or extends an end date. Alternative: the admin sets one default length that every trainer invite carries.
2. **May a trainer release a trainee themselves?** Default here: yes, they go to "no trainer".
3. **May a trainer see body measurements (waist, body fat) as well as weight?** Default here: no, weight only, to match the consent line. Trainers will probably ask for it, and the consent line would then need to say so.

## What this leaves room for

- Step 3 (intake, AI draft, trainer review): a draft is a plan that exists only on the trainer's side until sent, so it needs a `db.drafts[trainerId]` list and the same `requireTrainee` guard. Nothing above changes.
- Step 4 (meal plans): another entry kind in `db.assigned[uid]`, same guard, same copy-to-the-phone path.

## Build order inside v1.5.0

1. `api/trainer.js` + unit tests.
2. Guard, trainer routes, admin routes, sign-up changes, openapi, server tests 5 to 26.
3. Shared plan components, `Trainer.jsx`, Admin changes, sign-up and You changes, frontend tests.
4. Docs (SELF_HOSTING paragraph, CHANGELOG), version bump, release, phone check.
