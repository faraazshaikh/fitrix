// One-tap pairing of the Android app from the browser. In Chrome, "Open in the Fitrix app" (on the
// pairing code screen) sends an intent link; Android opens the app with opengym://pair?server=...
// &code=...; the app asks "Connect this phone to <server>?" and, on a tap, redeems the code just as
// typing it would. If the app is not installed, Chrome goes to the download instead. Pure rules
// here; the screens are components/PairLink.jsx. See docs/MOBILE.md.
import { normalizeServerUrl } from './remote.js'
import { isAndroid } from './android-web.js'

// The app id of the build the download link serves (the debug-signed test build, see
// .github/workflows/android-test-apk.yml).
export const APP_ID = 'ch.duartesantos.opengym.test'
export const PAIR_SCHEME = 'opengym'

const CODE_RE = /^[A-Za-z0-9]{4,12}$/

/** The link Chrome on Android opens: the app if it is there, `fallback` (the download) if not. */
export function pairIntentLink({ server, code, fallback, appId = APP_ID }) {
  const q = new URLSearchParams({ server, code }).toString()
  const fb = fallback ? `;S.browser_fallback_url=${encodeURIComponent(fallback)}` : ''
  return `intent://pair?${q}#Intent;scheme=${PAIR_SCHEME};package=${appId}${fb};end`
}

/** The web address of this site as the app should reach it: the origin, nothing after it. */
export const serverOf = loc => (loc && loc.origin && loc.origin !== 'null' ? loc.origin : '')

/** Whether the "Open in the Fitrix app" button belongs here: an Android browser, not the app. */
export const canOpenInApp = ({ ua, mobile = false } = {}) => isAndroid(ua) && !mobile

/**
 * Reads opengym://pair?server=...&code=... Returns { server, code } or null for anything else
 * (another link, no code, a code with odd characters, an address that is not a web address).
 */
export function parsePairLink(url) {
  const m = /^opengym:\/\/pair\/?\?([^#]*)/i.exec(String(url || '').trim())
  if (!m) return null
  let p
  try { p = new URLSearchParams(m[1]) } catch { return null }
  const code = String(p.get('code') || '').trim()
  const server = normalizeServerUrl(p.get('server'))
  if (!CODE_RE.test(code) || !server || !/^https?:\/\//.test(server)) return null
  return { server, code: code.toUpperCase() }
}
