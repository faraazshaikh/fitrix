// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const connectToServer = vi.fn()
const state = { user: null, connectToServer }
vi.mock('../store/useStore.js', () => {
  const useStore = sel => (typeof sel === 'function' ? sel(state) : state)
  useStore.getState = () => state
  return { useStore }
})
const openSheet = vi.fn()
const toast = vi.fn()
vi.mock('../store/useUI.js', () => ({ useUI: { getState: () => ({ openSheet, toast }) } }))
vi.mock('../sheets.jsx', () => ({ askAddDeviceData: vi.fn() }))

import { OpenInAppButton, PairLinkSheet, openPairLink, _resetPairLinksForTests } from './PairLink.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
const setUA = ua => Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
const mounted = []
async function mount(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push({ root, host })
  await act(async () => { root.render(el) })
  return host
}
beforeEach(() => { setUA(CHROME_ANDROID); state.user = null; connectToServer.mockReset(); openSheet.mockReset(); toast.mockReset(); _resetPairLinksForTests() })
afterEach(() => { act(() => { mounted.splice(0).forEach(({ root, host }) => { root.unmount(); host.remove() }) }) })

describe('the Open in the Fitrix app button', () => {
  it('shows in an Android browser', async () => {
    const page = await mount(<OpenInAppButton code="AB12CD34" />)
    expect(page.textContent).toContain('Open in the Fitrix app')
  })
  it('is not there on a computer or an iPhone', async () => {
    setUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36')
    expect((await mount(<OpenInAppButton code="AB12CD34" />)).querySelector('[data-testid="open-in-app"]')).toBeNull()
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1')
    expect((await mount(<OpenInAppButton code="AB12CD34" />)).querySelector('[data-testid="open-in-app"]')).toBeNull()
  })
})

describe('the pairing sheet in the app', () => {
  it('names the server and connects only on the tap', async () => {
    connectToServer.mockResolvedValue({ name: 'Digital' })
    const close = vi.fn()
    const page = await mount(<PairLinkSheet server="https://fit.example.com" code="AB12CD34" close={close} />)
    expect(page.textContent).toContain('fit.example.com')
    expect(connectToServer).not.toHaveBeenCalled()
    await act(async () => { page.querySelector('button.primary').click() })
    expect(connectToServer).toHaveBeenCalledWith('https://fit.example.com', 'AB12CD34', expect.any(Function))
    expect(close).toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith('Connected')
  })
  it('says why when the code does not work', async () => {
    connectToServer.mockRejectedValue(new Error('invalid or expired code'))
    const close = vi.fn()
    const page = await mount(<PairLinkSheet server="https://fit.example.com" code="AB12CD34" close={close} />)
    await act(async () => { page.querySelector('button.primary').click() })
    expect(page.textContent).toContain('invalid or expired code')
    expect(close).not.toHaveBeenCalled()
  })
  it('opens once for a link that arrives twice', () => {
    const link = { server: 'https://fit.example.com', code: 'AB12CD34' }
    expect(openPairLink(link, 1000)).toBe(true)
    expect(openPairLink(link, 2000)).toBe(false)
    expect(openPairLink(link, 9000)).toBe(true)
    expect(openPairLink(null)).toBe(false)
  })
})
