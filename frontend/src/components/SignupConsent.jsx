// The two things a sign-up asks besides a name (lib/signup-consent.js): the 18+ box, and, under
// a trainer's invite, the line that says who will see what, with a yes or no.
import { t } from '../lib/i18n.js'
import { useUI } from '../store/useUI.js'
import { confirmSheet } from '../sheets.jsx'

export function AdultBox({ checked, onChange }) {
  return <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', textAlign: 'start', cursor: 'pointer' }}>
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ marginTop: 3 }} />
    <span className="small">{t('I am 18 or older')}</span>
  </label>
}

export const ADULT_NEEDED = () => t('Confirm that you are 18 or older.')

// Resolves true when they agree, false when they decline or close the sheet.
export function askTrainerConsent(trainer) {
  return new Promise(resolve => {
    confirmSheet({
      title: t('Sign up under {0}?', trainer || t('a trainer')),
      message: t('Your trainer can see your workouts, body weight and body measurements. Not your progress photos.'),
      confirmText: t('I agree'),
      cancelText: t('Cancel'),
      locked: true,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false)
    })
  })
}
export const toastNeedAdult = () => useUI.getState().toast(ADULT_NEEDED())
