import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { api } from '../lib/api.js'
import { fmtDate } from '../lib/format.js'
import { confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button, TextField } from '../components/ui.jsx'
import { AssignedPlans } from '../components/AssignedPlans.jsx'
import { InviteCreatedSheet } from '../components/InviteShare.jsx'
import '../admin.css'

// A trainer's own page: their trainees, the plans they gave them, and the codes that bring new
// people in. The server decides everything (api/trainer.js canTrain); this only asks. Like the
// admin dashboard it is English-only and stays out of the per-language string packs.

const rel = ts => {
  if (!ts) return 'never'
  const s = Math.max(0, (Date.now() - ts) / 1000)
  if (s < 3600) return Math.max(1, Math.floor(s / 60)) + ' min ago'
  if (s < 86400) return Math.floor(s / 3600) + ' h ago'
  return Math.floor(s / 86400) + ' d ago'
}
const day = d => (d ? fmtDate(d, true) : 'no workouts yet')
const lastOf = (list, k) => { const e = (list || []).length ? list[list.length - 1] : null; return e && typeof e[k] === 'number' ? e : null }

function TraineeSheet({ id, onChanged, close }) {
  const toast = useUI(s => s.toast)
  const [d, setD] = useState(null)
  const [err, setErr] = useState(null)
  const load = () => api('/api/trainer/trainee?id=' + encodeURIComponent(id)).then(setD).catch(e => setErr(e.message))
  useEffect(() => { load() }, [id])
  if (err) return <><h3>Could not load</h3><div className="adm-lead">{err}</div></>
  if (!d) return <div className="adm-empty">Loading…</div>
  const u = d.user
  const release = () => confirmSheet({
    title: 'Release ' + u.name + '?',
    message: 'They stay in Fitrix with the plans you gave them, and you no longer see anything of theirs. Only the admin can put them back with a trainer.',
    confirmText: 'Release', danger: true,
    onConfirm: () => api('/api/trainer/trainee/release', { method: 'POST', body: JSON.stringify({ id }) })
      .then(() => { toast(u.name + ' is released'); onChanged(); close() }).catch(e => toast(e.message)),
  })
  const reloadAll = () => { load(); onChanged() }
  const bw = lastOf(d.bodyweight, 'kg') || lastOf(d.bodyweight, 'lb')
  const workouts = d.workouts || []
  return <>
    <h3>{u.name}</h3>
    {d.waiting && <div className="adm-hint" style={{ marginTop: 0 }}>{u.name} has not opened Fitrix since they were moved to you, so you cannot see their training yet. You can still give them a plan.</div>}
    {!d.waiting && <>
      <div className="tiles" style={{ margin: '8px 0 12px' }}>
        <div className="tile"><div className="l">Workouts</div><div className="v">{workouts.length}</div></div>
        <div className="tile"><div className="l">Last workout</div><div className="v" style={{ fontSize: 'var(--fs-body)' }}>{day(d.lastWorkout)}</div></div>
        <div className="tile"><div className="l">Body weight</div><div className="v" style={{ fontSize: 'var(--fs-body)' }}>{bw ? (bw.kg ?? bw.lb) + ' ' + (bw.kg != null ? 'kg' : 'lb') : '–'}</div></div>
        <div className="tile"><div className="l">Synced</div><div className="v" style={{ fontSize: 'var(--fs-body)' }}>{rel(d.lastSync)}</div></div>
      </div>
      <h4 className="sec">Recent workouts</h4>
      {workouts.length ? <div className="list" style={{ gap: 0 }}>
        {workouts.slice(0, 8).map(w => <div key={w.id || w.d + w.start} className="row between" style={{ padding: '7px 2px', borderBottom: '1px solid var(--sep)' }}>
          <div className="small" style={{ fontWeight: 600 }}>{w.name || 'Workout'}</div>
          <div className="dim" style={{ fontSize: 'var(--fs-caption2)' }}>{fmtDate(w.d, true)} · {(w.entries || []).length} {(w.entries || []).length === 1 ? 'exercise' : 'exercises'}</div>
        </div>)}
      </div> : <div className="adm-empty">Nothing logged yet.</div>}
    </>}
    <AssignedPlans user={u} assigned={d.assigned || []} reload={reloadAll}
      giveUrl="/api/trainer/trainee/plan" removeUrl="/api/trainer/trainee/plan/remove" />
    <div style={{ height: 14 }} />
    <button className="btn danger" onClick={release}>Release {u.name}</button>
    <div className="adm-hint">You see their workouts, body weight and body measurements. Never their progress photos.</div>
  </>
}

function NewTraineeInvite({ done, close }) {
  const toast = useUI(s => s.toast)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const okEmail = !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const make = () => {
    setBusy(true)
    api('/api/trainer/invites/new', { method: 'POST', body: JSON.stringify({ name: name.trim(), ...(email.trim() ? { email: email.trim() } : {}) }) })
      .then(({ invite }) => { done(); close(); useUI.getState().openSheet(c => <InviteCreatedSheet invite={invite} close={c} />, { locked: true }) })
      .catch(e => { setBusy(false); toast(e.message) })
  }
  return <>
    <h3>Invite a trainee</h3>
    <div className="adm-lead">Make a code for one person. They become your trainee when they sign up, and they are shown what you can see before they agree.</div>
    <div className="adm-field"><label>Name</label>
      <TextField value={name} onChange={e => setName(e.target.value)} placeholder="Alex" maxLength={60} autoCapitalize="words" /></div>
    <div className="adm-field"><label>Email (optional)</label>
      <TextField value={email} onChange={e => setEmail(e.target.value)} placeholder="alex@example.com" inputMode="email" autoCapitalize="none" autoCorrect="off" /></div>
    <div className="adm-hint">With an email, the code only works with that address.</div>
    <div style={{ height: 12 }} />
    <Button variant="primary" disabled={busy || !name.trim() || !okEmail} onClick={make}>Create invite</Button>
  </>
}

export default function Trainer() {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const openSheet = useUI(s => s.openSheet)
  const toast = useUI(s => s.toast)
  const [list, setList] = useState(null)
  const [invites, setInvites] = useState(null)
  const [max, setMax] = useState(25)
  const [err, setErr] = useState(null)
  const loadList = () => api('/api/trainer/trainees').then(d => { setList(d.trainees || []); setErr(null) }).catch(e => setErr(e.message || 'Failed to load'))
  const loadInvites = () => api('/api/trainer/invites').then(d => { setInvites(d.invites || []); if (d.max) setMax(d.max) }).catch(() => {})
  useEffect(() => { if (user?.trainer) { loadList(); loadInvites() } }, [])
  if (!user?.trainer) return null
  const open = id => openSheet(close => <TraineeSheet id={id} onChanged={loadList} close={close} />)
  const revoke = code => confirmSheet({
    title: 'Revoke code ' + code + '?', message: 'Nobody can use it any more. People who already signed up with it are not affected.',
    confirmText: 'Revoke', danger: true,
    onConfirm: () => api('/api/trainer/invites/revoke', { method: 'POST', body: JSON.stringify({ code }) })
      .then(() => { toast('Code revoked'); loadInvites() }).catch(e => toast(e.message))
  })
  const unused = (invites || []).filter(i => !i.used)
  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/settings/account" onClick={() => nav('/settings/account')} aria-label="Back"><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1 style={{ margin: 0 }}>My trainees</h1>
        <div className="sub">{list ? list.length + (list.length === 1 ? ' person' : ' people') : err ? 'Could not load' : 'Loading…'}</div></div>
      <button className="iconbtn" onClick={() => { loadList(); loadInvites() }} aria-label="refresh">↻</button>
    </div>
    {err && <div className="card" role="alert" style={{ borderColor: 'var(--red)' }}>
      <div className="row between"><h2 style={{ margin: 0 }}>Could not load</h2><Button size="sm" icon="reset" onClick={loadList}>Try again</Button></div>
      <div className="adm-lead" style={{ marginBottom: 0 }}>{err}</div></div>}
    <div className="card">
      <div className="row between"><h2 style={{ margin: 0 }}>Trainees</h2>
        <Button variant="primary" size="sm" icon="plus" onClick={() => openSheet(close => <NewTraineeInvite done={loadInvites} close={close} />)}>Invite</Button></div>
      <div className="adm-lead">Tap a person to see how they are training and to give them a plan.</div>
      {list && list.length ? list.map(t => <div key={t.id} className="item" onClick={() => open(t.id)} style={{ padding: '9px 2px', borderBottom: '1px solid var(--sep)' }}>
        <div className="grow"><div className="tt">{t.name}</div>
          <div className="ss">{t.waiting ? 'has not opened the app since they were moved to you' : 'last workout ' + (t.lastWorkout ? fmtDate(t.lastWorkout, true) : 'none yet') + ' · ' + t.plans + (t.plans === 1 ? ' plan' : ' plans')}</div></div>
        {t.waiting && <span className="adm-pill">waiting</span>}
        <Icon name="chevronRight" />
      </div>) : list && <div className="adm-empty">No trainees yet. "Invite" makes a code to send them.</div>}
    </div>
    <div className="card">
      <h2 style={{ margin: 0 }}>Your invite codes</h2>
      <div className="adm-lead">A code works once and has no end date. You can have {max} unused at a time.</div>
      {unused.length ? unused.map(i => <div key={i.code} className="row between" style={{ padding: '6px 0', borderBottom: 'var(--hair) solid var(--sep)' }}>
        <div>
          <button className="adm-code" onClick={() => openSheet(close => <InviteCreatedSheet invite={i} close={close} />)} aria-label={'share ' + i.code}>{i.code}</button>
          <div className="dim" style={{ fontSize: 'var(--fs-caption2)', marginTop: 3 }}>{[i.name, i.email].filter(Boolean).join(' · ')}</div>
        </div>
        <button className="iconbtn adm-iconbtn" style={{ color: 'var(--red)' }} onClick={() => revoke(i.code)} aria-label="revoke"><Icon name="trash" /></button>
      </div>) : <div className="adm-empty">No unused codes.</div>}
    </div>
  </div>
}
