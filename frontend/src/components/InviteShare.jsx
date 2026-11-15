import { useUI } from '../store/useUI.js'
import { remoteAuth, appBase } from '../lib/api.js'
import { MOBILE } from '../lib/mobile.js'
import { copyText } from '../lib/clipboard.js'
import { inviteMessage } from '../lib/invite-message.js'
import { Button } from './ui.jsx'
import '../admin.css'

// The invite sheet an admin and a trainer both use after making a code. English-only like the
// admin dashboard.
const monthsText = m => (m ? m + (m === 1 ? ' month' : ' months') : 'Indefinite')

// The server's own address, as the person will type it: the paired server in the phone app, this
// site in a browser.
const serverBase = () => (remoteAuth()?.base || appBase()).replace(/\/+$/, '')

// The phone's share sheet (WhatsApp, SMS, mail...) in the app, the browser's where it has one,
// else the clipboard.
async function shareText(text, title) {
  const dismissed = e => e?.name === 'AbortError' || /cancel/i.test(String(e?.message || e?.errorMessage || ''))
  if (MOBILE) {
    try { const { Share } = await import('@capacitor/share'); await Share.share({ title, text, dialogTitle: title }); return true } catch (e) { if (dismissed(e)) return true }
  } else if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try { await navigator.share({ title, text }); return true } catch (e) { if (dismissed(e)) return true }
  }
  return false
}

// One invite: the code, and what to send the person with it. The message holds the link that fills
// the code in on the sign-up page, where the app download is.
export function InviteCreatedSheet({ invite, close }) {
  const toast = useUI(s => s.toast)
  const message = inviteMessage({ base: serverBase(), invite })
  const copy = async text => toast((await copyText(text)) ? 'Copied' : 'Could not copy')
  const share = async () => { if (!(await shareText(message, 'Fitrix invite'))) copy(message) }
  return <>
    <h3>Invite for {invite.name || 'them'}</h3>
    <div className="adm-lead">Send {invite.name || 'them'} the message below. Its link opens the sign-up page with the code filled in and the app to download. They sign up with <b>{invite.email || 'any name'}</b>. It works once, for {invite.months ? monthsText(invite.months) + ' from the day they sign up' : 'as long as you keep the account (indefinite)'}.</div>
    <button className="adm-code" style={{ fontSize: 'var(--fs-title2)', width: '100%', padding: '14px 0' }} onClick={() => copy(invite.code)} aria-label="copy code">{invite.code}</button>
    <pre className="adm-hint" style={{ whiteSpace: 'pre-wrap', margin: '12px 0', fontFamily: 'inherit', userSelect: 'text' }}>{message}</pre>
    <Button variant="primary" onClick={share}>Share invite</Button>
    <div style={{ height: 8 }} />
    <div className="row" style={{ gap: 8 }}>
      <button className="btn" style={{ flex: 1 }} onClick={() => copy(message)}>Copy message</button>
      <button className="btn" style={{ flex: 1 }} onClick={() => copy(invite.code)}>Copy code</button>
    </div>
    <div style={{ height: 8 }} />
    <Button variant="ghost" onClick={close}>Done</Button>
  </>
}
