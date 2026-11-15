// The "get the Android app" card on Home: for people using Fitrix in an Android browser. Pure
// rules here; the card is components/AndroidAppBanner.jsx. It never shows in the installed app, in
// the web app added to the home screen, on an iPhone or on a computer, and once someone closes it
// it stays closed on that device.

export const BANNER_KEY = 'fitrix_android_banner_closed'

export const isAndroid = ua => /Android/i.test(ua || '')

/** @param {{ ua?: string, mobile?: boolean, standalone?: boolean, closed?: boolean }} input */
export const showAndroidBanner = ({ ua, mobile = false, standalone = false, closed = false } = {}) =>
  isAndroid(ua) && !mobile && !standalone && !closed

// The browser's own storage can throw (private tabs, blocked storage): a failure reads as "not
// closed" and a close that cannot be saved just lasts until the page is reloaded.
export function bannerClosed(storage = globalThis.localStorage) {
  try { return storage.getItem(BANNER_KEY) === '1' } catch { return false }
}
export function closeBanner(storage = globalThis.localStorage) {
  try { storage.setItem(BANNER_KEY, '1') } catch { /* nothing to do */ }
}

// Added to the home screen from Chrome: the web app runs without the browser bar.
export const isStandalone = (win = globalThis) => {
  try { return !!(win.matchMedia?.('(display-mode: standalone)').matches || win.navigator?.standalone) } catch { return false }
}
