// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AndroidAppBanner from './AndroidAppBanner.jsx'
import { BANNER_KEY } from '../lib/android-web.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
const mounted = []
async function mount() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push({ root, host })
  await act(async () => { root.render(<AndroidAppBanner />) })
  return host
}
const setUA = ua => Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
beforeEach(() => { localStorage.clear(); setUA(CHROME_ANDROID) })
afterEach(() => { act(() => { mounted.splice(0).forEach(({ root, host }) => { root.unmount(); host.remove() }) }); vi.restoreAllMocks() })

describe('the Android app banner', () => {
  it('shows in an Android browser, with a download button', async () => {
    const page = await mount()
    expect(page.textContent).toContain('Get the Fitrix app for Android')
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    page.querySelector('button.primary').click()
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/\/releases\/latest\/download\/Fitrix\.apk$/), '_blank', 'noopener')
  })

  it('goes away on Not now and stays away on this device', async () => {
    const page = await mount()
    await act(async () => { [...page.querySelectorAll('button')].find(b => b.textContent === 'Not now').click() })
    expect(page.querySelector('[data-testid="android-banner"]')).toBeNull()
    expect(localStorage.getItem(BANNER_KEY)).toBe('1')
    const again = await mount()
    expect(again.querySelector('[data-testid="android-banner"]')).toBeNull()
  })

  it('is not there on an iPhone or a computer', async () => {
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1')
    expect((await mount()).querySelector('[data-testid="android-banner"]')).toBeNull()
    setUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36')
    expect((await mount()).querySelector('[data-testid="android-banner"]')).toBeNull()
  })
})
