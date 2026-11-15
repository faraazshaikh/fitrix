import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { api } from '../lib/api.js'
import { fmtDate } from '../lib/format.js'
import { confirmSheet } from '../sheets.jsx'
import Icon from './Icon.jsx'
import '../admin.css'

// Shared by the admin's person sheet and a trainer's trainee screen: the two differ only in the
// routes they call (the server decides who may). English-only like the admin dashboard.
// One of your own routines to hand to someone: it is copied (with the custom exercises it uses) into
// their assigned plans, and shows in their Plan tab. With `aid` it replaces the plan they have.
function GivePlanSheet({ user, aid, nameHint, done, close, giveUrl }) {
  const S = useStore(s => s.S)
  const toast = useUI(s => s.toast)
  const [busy, setBusy] = useState(false)
  const own = (S.routines || []).filter(r => r && r.id && !r.assigned && Array.isArray(r.ex) && r.ex.length)
  const list = own.slice().sort((a, b) => (b.name === nameHint) - (a.name === nameHint))
  const send = r => {
    if (busy) return
    setBusy(true)
    const used = new Set(r.ex.map(e => e && e.id))
    const customEx = (S.customEx || []).filter(c => c && used.has(c.id))
    api(giveUrl, { method: 'POST', body: JSON.stringify({ id: user.id, aid: aid || undefined, routine: r, customEx }) })
      .then(() => { toast(aid ? user.name + ' gets the update' : r.name + ' is on its way to ' + user.name); done(); close() })
      .catch(e => { setBusy(false); toast(e.message) })
  }
  return <>
    <h3>{aid ? 'Update the plan' : 'Give ' + user.name + ' a plan'}</h3>
    <div className="adm-hint" style={{ marginTop: 0 }}>Pick one of your routines. {user.name} gets a copy in their Plan tab the next time the app syncs{aid ? ', replacing the one they have' : ''}.</div>
    {list.length ? <div className="list" style={{ gap: 0, marginTop: 10 }}>
      {list.map(r => <div key={r.id} className="item" onClick={() => send(r)} style={busy ? { opacity: .55 } : null}>
        <div className="grow"><div className="tt">{r.name}</div><div className="ss">{r.ex.length} {r.ex.length === 1 ? 'exercise' : 'exercises'}</div></div>
        <Icon name="chevronRight" />
      </div>)}
    </div> : <div className="adm-empty">You have no routines yet. Make one in your Plan tab first.</div>}
  </>
}

// The plans you gave this person, whether they trained each, and the way to give, update or take one back.
export function AssignedPlans({ user, assigned, reload, giveUrl = '/api/admin/user/plan', removeUrl = '/api/admin/user/plan/remove' }) {
  const toast = useUI(s => s.toast)
  const openSheet = useUI(s => s.openSheet)
  const give = (aid, nameHint) => openSheet(close => <GivePlanSheet user={user} aid={aid} nameHint={nameHint} done={reload} close={close} giveUrl={giveUrl} />)
  const take = p => confirmSheet({
    title: 'Take back ' + p.name + '?',
    message: user.name + ' loses it from their Plan tab on their next sync. The workouts they logged with it stay.',
    confirmText: 'Take back', danger: true,
    onConfirm: () => api(removeUrl, { method: 'POST', body: JSON.stringify({ id: user.id, aid: p.aid }) })
      .then(() => { toast('Taken back'); reload() }).catch(e => toast(e.message)),
  })
  return <>
    <h4 className="sec">Plan</h4>
    {assigned.length ? <div className="list" style={{ gap: 0 }}>
      {assigned.map(p => <div key={p.aid} style={{ padding: '9px 2px', borderBottom: '1px solid var(--sep)' }}>
        <div className="row between">
          <div><div className="small" style={{ fontWeight: 600 }}>{p.name}</div>
            <div className="dim" style={{ fontSize: 'var(--fs-caption2)' }}>{p.exercises} {p.exercises === 1 ? 'exercise' : 'exercises'} · sent {fmtDate(p.at.slice(0, 10), true)}</div></div>
          <span className={'adm-pill' + (p.sessions ? ' acc' : '')}>{p.sessions ? 'trained ' + p.sessions + (p.sessions === 1 ? ' time' : ' times') : 'not trained yet'}</span>
        </div>
        {p.lastTrained && <div className="dim" style={{ fontSize: 'var(--fs-caption2)' }}>last trained {fmtDate(p.lastTrained, true)}</div>}
        <div className="row" style={{ gap: 8, margin: '6px 0 2px' }}>
          <button className="btn" onClick={() => give(p.aid, p.name)}>Update</button>
          <button className="btn danger" onClick={() => take(p)}>Take back</button>
        </div>
      </div>)}
    </div> : <div className="adm-empty">No plan given yet.</div>}
    <button className="btn" style={{ margin: '10px 0 4px' }} onClick={() => give(null, null)}>Give a plan</button>
    <div className="adm-hint">Copies one of your routines into their Plan tab. Send it again from here to change it for them.</div>
  </>
}
