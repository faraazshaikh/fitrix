import { describe, expect, it } from 'vitest'
import { BANNER_KEY, bannerClosed, closeBanner, isStandalone, showAndroidBanner } from './android-web.js'

const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

describe('showAndroidBanner', () => {
  it('shows for an Android browser', () => {
    expect(showAndroidBanner({ ua: CHROME_ANDROID })).toBe(true)
  })
  it('stays away from iPhone and desktop', () => {
    expect(showAndroidBanner({ ua: IPHONE })).toBe(false)
    expect(showAndroidBanner({ ua: DESKTOP })).toBe(false)
    expect(showAndroidBanner({})).toBe(false)
  })
  it('stays away inside the installed app and the home-screen web app', () => {
    expect(showAndroidBanner({ ua: CHROME_ANDROID, mobile: true })).toBe(false)
    expect(showAndroidBanner({ ua: CHROME_ANDROID, standalone: true })).toBe(false)
  })
  it('stays away once it was closed', () => {
    expect(showAndroidBanner({ ua: CHROME_ANDROID, closed: true })).toBe(false)
  })
})

describe('closing it', () => {
  const memory = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) } }
  it('is remembered on the device', () => {
    const s = memory()
    expect(bannerClosed(s)).toBe(false)
    closeBanner(s)
    expect(s.getItem(BANNER_KEY)).toBe('1')
    expect(bannerClosed(s)).toBe(true)
  })
  it('survives storage that throws', () => {
    const broken = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }
    expect(bannerClosed(broken)).toBe(false)
    expect(() => closeBanner(broken)).not.toThrow()
  })
})

describe('isStandalone', () => {
  it('reads the display mode and the iOS flag', () => {
    expect(isStandalone({ matchMedia: () => ({ matches: true }) })).toBe(true)
    expect(isStandalone({ matchMedia: () => ({ matches: false }), navigator: { standalone: true } })).toBe(true)
    expect(isStandalone({ matchMedia: () => ({ matches: false }), navigator: {} })).toBe(false)
    expect(isStandalone({})).toBe(false)
  })
})
