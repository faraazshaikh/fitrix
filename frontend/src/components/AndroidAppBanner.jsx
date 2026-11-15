import { useState } from 'react'
import { MOBILE } from '../lib/mobile.js'
import { APP_DOWNLOAD } from '../lib/update.js'
import { bannerClosed, closeBanner, isStandalone, showAndroidBanner } from '../lib/android-web.js'

// On Home, for people using Fitrix in an Android browser: the app is one tap away. The rules are in
// lib/android-web.js. English only, like the landing page and the bell: the server owner's copy.
export default function AndroidAppBanner() {
  const [closed, setClosed] = useState(() => bannerClosed())
  const show = showAndroidBanner({
    ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    mobile: MOBILE, standalone: isStandalone(), closed,
  })
  if (!show) return null
  return <div className="card" data-testid="android-banner" style={{ margin: '0 0 14px', textAlign: 'start' }}>
    <div style={{ fontWeight: 600 }}>Get the Fitrix app for Android</div>
    <div className="muted small" style={{ margin: '4px 0 0', lineHeight: 1.5 }}>
      It opens faster and can read your steps, sleep and calories from Health Connect. Install it, then pair it from Settings.
    </div>
    <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
      {/* window.open, as the update row in Settings does. */}
      <button className="btn primary" onClick={() => window.open(APP_DOWNLOAD, '_blank', 'noopener')}>Download the app</button>
      <button className="btn" onClick={() => { closeBanner(); setClosed(true) }}>Not now</button>
    </div>
  </div>
}
