import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { getChannel } from '../lib/channel.js'
import { checkForUpdate, resetUpdateCheck } from '../lib/update.js'
import { PULL_MAX, mostlyDown, pullAllowed, pullDistance, pullMayStart, pullPhase } from '../lib/pull-refresh.js'
import Icon from './Icon.jsx'

// Pull down at the top of a screen to ask for anything new: the profile's copy on the server, plans
// a trainer or admin gave you, and a newer version of the app. The page scrolls in the window, so
// "at the top" is scrollY 0. Touch listeners are passive: the page is never held back, the
// indicator just follows the finger. The thresholds are in lib/pull-refresh.js.
export const REFRESH_EVENT = 'fitrix-refresh'

export async function refreshAll() {
  const st = useStore.getState()
  let update = null
  await Promise.allSettled([
    st.syncNow(),
    st.pullAssigned(true),
    // The installed app (the download, not a store) offers its own update: look again, now.
    (async () => {
      if ((await getChannel()) !== 'sideload') return
      resetUpdateCheck()
      update = await checkForUpdate()
    })(),
    // The web app: the browser fetches a new build when its service worker is told to look.
    (async () => { const reg = await navigator.serviceWorker?.getRegistration?.(); await reg?.update?.() })(),
  ])
  window.dispatchEvent(new Event(REFRESH_EVENT))
  return { update: !!update?.hasUpdate }
}

export default function PullToRefresh() {
  const { pathname } = useLocation()
  const [dist, setDist] = useState(0)
  const [busy, setBusy] = useState(false)
  const g = useRef({ on: false, x: 0, y: 0, d: 0 })
  const run = useRef(false)

  useEffect(() => {
    if (!pullAllowed(pathname)) return
    const reset = () => { g.current.on = false; g.current.d = 0; setDist(0) }
    const start = e => {
      if (run.current || e.touches.length !== 1) return
      if (!pullMayStart({ scrollY: window.scrollY, sheets: useUI.getState().sheets.length, target: e.target })) return
      g.current = { on: true, x: e.touches[0].clientX, y: e.touches[0].clientY, d: 0 }
    }
    const move = e => {
      const s = g.current
      if (!s.on) return
      const dy = e.touches[0].clientY - s.y, dx = e.touches[0].clientX - s.x
      // Scrolled away from the top, or turned sideways or back up: not a pull.
      if (window.scrollY > 0 || (dy > 12 && !mostlyDown(dx, dy)) || dy < -4) { reset(); return }
      s.d = pullDistance(dy)
      setDist(s.d)
    }
    const end = async () => {
      const s = g.current
      const ready = s.on && pullPhase(s.d) === 'ready'
      reset()
      if (!ready || run.current) return
      run.current = true
      setBusy(true)
      try {
        const { update } = await refreshAll()
        useUI.getState().toast(update ? t('Update available. Check the bell on Home.') : t('Up to date'))
      } finally { run.current = false; setBusy(false) }
    }
    document.addEventListener('touchstart', start, { passive: true })
    document.addEventListener('touchmove', move, { passive: true })
    document.addEventListener('touchend', end, { passive: true })
    document.addEventListener('touchcancel', reset, { passive: true })
    return () => {
      document.removeEventListener('touchstart', start)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', end)
      document.removeEventListener('touchcancel', reset)
    }
  }, [pathname])

  if (!busy && dist <= 0) return null
  const shown = busy ? 56 : Math.min(dist, PULL_MAX)
  return <div className={'ptr' + (busy ? ' busy' : pullPhase(dist) === 'ready' ? ' ready' : '')} role="status" aria-live="polite"
    style={{ transform: `translate(-50%, ${shown - 48}px)` }}>
    <Icon name="reset" style={busy ? undefined : { transform: `rotate(${Math.min(dist, 72) * 3}deg)` }} />
  </div>
}
