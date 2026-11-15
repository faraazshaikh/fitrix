import { describe, expect, it } from 'vitest'
import { APP_ID, canOpenInApp, pairIntentLink, parsePairLink, serverOf } from './pair-link.js'

const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'

describe('pairIntentLink', () => {
  const link = pairIntentLink({ server: 'https://fit.example.com', code: 'AB12CD34', fallback: 'https://example.com/Fitrix.apk' })
  it('is an Android intent for the opengym scheme and the test app', () => {
    expect(link.startsWith('intent://pair?')).toBe(true)
    expect(link).toContain('#Intent;scheme=opengym;package=' + APP_ID)
    expect(link.endsWith(';end')).toBe(true)
  })
  it('carries the server and the code, encoded', () => {
    expect(link).toContain('server=https%3A%2F%2Ffit.example.com')
    expect(link).toContain('code=AB12CD34')
  })
  it('falls back to the download when the app is not installed', () => {
    expect(link).toContain(';S.browser_fallback_url=' + encodeURIComponent('https://example.com/Fitrix.apk'))
  })
  it('leaves the fallback out when there is none', () => {
    expect(pairIntentLink({ server: 'https://a.b', code: 'ABCD' })).not.toContain('browser_fallback_url')
  })
})

describe('parsePairLink', () => {
  it('reads what the app is opened with', () => {
    expect(parsePairLink('opengym://pair?server=https%3A%2F%2Ffit.example.com&code=ab12cd34'))
      .toEqual({ server: 'https://fit.example.com', code: 'AB12CD34' })
  })
  it('round-trips with the intent link', () => {
    const intent = pairIntentLink({ server: 'https://fit.example.com', code: 'AB12CD34' })
    const inner = intent.replace(/^intent:/, 'opengym:').replace(/#Intent.*$/, '')
    expect(parsePairLink(inner)).toEqual({ server: 'https://fit.example.com', code: 'AB12CD34' })
  })
  it('refuses other links, odd codes and addresses that are not web addresses', () => {
    expect(parsePairLink('opengym://r#abc')).toBeNull()
    expect(parsePairLink('https://fit.example.com/?code=AB12CD34')).toBeNull()
    expect(parsePairLink('opengym://pair?server=https%3A%2F%2Ffit.example.com')).toBeNull()
    expect(parsePairLink('opengym://pair?server=https%3A%2F%2Ffit.example.com&code=a%20b')).toBeNull()
    expect(parsePairLink('opengym://pair?server=javascript%3Aalert(1)&code=AB12CD34')).toBeNull()
    expect(parsePairLink('opengym://pair?code=AB12CD34')).toBeNull()
    expect(parsePairLink('')).toBeNull()
    expect(parsePairLink(null)).toBeNull()
  })
})

describe('serverOf and canOpenInApp', () => {
  it('uses the origin of the page', () => {
    expect(serverOf({ origin: 'https://fit.example.com', pathname: '/x' })).toBe('https://fit.example.com')
    expect(serverOf({ origin: 'null' })).toBe('')
    expect(serverOf(null)).toBe('')
  })
  it('is for an Android browser only', () => {
    expect(canOpenInApp({ ua: CHROME_ANDROID })).toBe(true)
    expect(canOpenInApp({ ua: CHROME_ANDROID, mobile: true })).toBe(false)
    expect(canOpenInApp({ ua: IPHONE })).toBe(false)
  })
})
