import { useEffect, useRef } from 'react'
import { useStore } from '../store/useStore.js'
import { api } from '../lib/api.js'
import { t } from '../lib/i18n.js'
import { confirmSheet } from '../sheets.jsx'
import { needsAck, wantsSimpleDefault } from '../lib/trainer-notice.js'

const setTrainer = myTrainer => useStore.setState(s => (s.user ? { user: { ...s.user, myTrainer } } : {}))

// The account row's action: leave the trainer. The plans they gave stay.
export function leaveTrainer(name) {
  confirmSheet({
    title: t('Leave {0}?', name),
    message: t('{0} no longer sees your workouts, body weight or body measurements. The plans they gave you stay.', name),
    confirmText: t('Leave trainer'), danger: true,
    onConfirm: () => api('/api/trainer/leave', { method: 'POST', body: '{}' })
      .then(() => setTrainer(null)).catch(() => {})
  })
}

// Runs once the app is up. An admin can move someone to a trainer after they signed up, so the
// first time they open the app afterwards they are told whose it is and what is seen, before
// the trainer sees anything (api/trainer.js canSee waits for this answer).
export default function useTrainerNotice(ready) {
  const user = useStore(s => s.user)
  const S = useStore(s => s.S)
  const asked = useRef(false)
  useEffect(() => {
    if (!ready || asked.current || !needsAck(user)) return
    asked.current = true
    const name = user.myTrainer.name
    confirmSheet({
      title: t('Your trainer is now {0}', name),
      message: t('Your trainer can see your workouts, body weight and body measurements. Not your progress photos.'),
      confirmText: t('OK'), cancelText: t('Leave trainer'), locked: true,
      onConfirm: () => api('/api/trainer/ack', { method: 'POST', body: '{}' }).then(d => setTrainer(d.myTrainer || null)).catch(() => { asked.current = false }),
      onCancel: () => api('/api/trainer/leave', { method: 'POST', body: '{}' }).then(() => setTrainer(null)).catch(() => {})
    })
  }, [ready, user])
  useEffect(() => {
    if (ready && wantsSimpleDefault(user, S)) useStore.getState().update(s => { s.simple = true })
  }, [ready, user?.myTrainer, S.simple])
}
