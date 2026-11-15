import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { MOBILE } from '../lib/mobile.js'
import { APP_DOWNLOAD } from '../lib/update.js'
import { canOpenInApp, pairIntentLink, parsePairLink, serverOf } from '../lib/pair-link.js'
import { hostOf } from './ServerSync.jsx'
import { askAddDeviceData } from '../sheets.jsx'
import { plainHttp } from '../views/MobileOnboarding.jsx'
import { Button } from './ui.jsx'

// One-tap pairing, both ends (rules in lib/pair-link.js). English only, like the landing page and
// the Android card: the server owner's copy.

/** In the browser, under the pairing code: opens the Fitrix app with the code filled in. */
export function OpenInAppButton({ code }) {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (!canOpenInApp({ ua, mobile: MOBILE })) return null
  const open = () => {
    window.location.href = pairIntentLink({ server: serverOf(window.location), code, fallback: APP_DOWNLOAD })
  }
  return <div data-testid="open-in-app" style={{ marginTop: 12 }}>
    <Button variant="primary" icon="qr" onClick={open}>Open in the Fitrix app</Button>
    <div className="dim small" style={{ marginTop: 8, lineHeight: 1.45 }}>
      Opens the app with this code ready. If the app is not installed yet, it downloads it instead.
    </div>
  </div>
}

/** In the app: what a pairing link asks. Nothing connects until the tap. */
export function PairLinkSheet({ server, code, close }) {
  const user = useStore(s => s.user)
  const { connectToServer } = useStore()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const go = async () => {
    setBusy(true)
    setError('')
    try { await connectToServer(server, code, askAddDeviceData); close(); useUI.getState().toast('Connected') }
    catch (e) { setError(e?.message || 'Could not connect') }
    finally { setBusy(false) }
  }
  return <>
    <h3>Connect this phone?</h3>
    <div className="muted small" style={{ marginBottom: 12, lineHeight: 1.5 }}>
      This link came from a Fitrix site. Connect only if you just tapped it yourself, on your own site.
    </div>
    <div className="card" dir="ltr" style={{ textAlign: 'center', fontWeight: 700, padding: '14px 8px', overflowWrap: 'anywhere' }}>
      {hostOf(server)}
    </div>
    {plainHttp(server) && <div className="dim small" role="note" style={{ marginTop: 8, lineHeight: 1.45 }}>
      Plain http:// isn’t encrypted. Fine on your home network, but use https:// if your server is reachable from the internet.
    </div>}
    {user && <div className="dim small" style={{ marginTop: 8, lineHeight: 1.45 }}>
      This phone is already connected as {user.name}. Connecting again switches it to the account on this site.
    </div>}
    {error && <div className="small" role="alert" style={{ color: 'var(--red)', marginTop: 10, lineHeight: 1.45, overflowWrap: 'anywhere' }}>{error}</div>}
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={go} disabled={busy}>{busy ? 'Connecting…' : 'Connect'}</Button>
    <div style={{ height: 8 }} />
    <Button onClick={close} disabled={busy}>Not now</Button>
  </>
}

let lastOpened = { key: '', at: 0 }
/** Opens the sheet for a link. Resolves true when it opened. */
export function openPairLink(link, now = Date.now()) {
  if (!link) return false
  // The cold-start link can arrive twice (getLaunchUrl and the retained appUrlOpen event).
  const key = link.server + ' ' + link.code
  if (lastOpened.key === key && now - lastOpened.at < 5000) return false
  lastOpened = { key, at: now }
  useUI.getState().openSheet(close => <PairLinkSheet server={link.server} code={link.code} close={close} />)
  return true
}
export function _resetPairLinksForTests() { lastOpened = { key: '', at: 0 } }

/**
 * Listens for opengym://pair?... in the phone app, while it is running or when it was started by
 * the link. One that arrives before the app has started up waits until `ready`.
 */
export function usePairLinks(ready) {
  const readyRef = useRef(ready)
  const pending = useRef(null)
  readyRef.current = ready
  useEffect(() => {
    if (!MOBILE) return
    const got = url => {
      const link = parsePairLink(url)
      if (!link) return
      if (readyRef.current) openPairLink(link)
      else pending.current = link
    }
    const handles = []
    let gone = false
    import('@capacitor/app').then(({ App }) => {
      Promise.resolve(App.addListener('appUrlOpen', e => { if (e?.url) got(String(e.url)) }))
        .then(h => { if (gone) h?.remove?.(); else handles.push(h) }).catch(() => {})
      Promise.resolve(App.getLaunchUrl?.()).then(r => { if (!gone && r?.url) got(String(r.url)) }).catch(() => {})
    }).catch(() => {})
    return () => {
      gone = true
      handles.splice(0).forEach(h => { try { h?.remove?.() } catch { /* gone already */ } })
    }
  }, [])
  useEffect(() => {
    if (!ready || !pending.current) return
    const link = pending.current
    pending.current = null
    setTimeout(() => openPairLink(link), 0)
  }, [ready])
}
