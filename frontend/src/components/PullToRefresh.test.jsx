// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  syncNow: vi.fn(() => Promise.resolve()), pullAssigned: vi.fn(() => Promise.resolve()),
  toast: vi.fn(), sheets: [], channel: 'sideload',
  check: vi.fn(() => Promise.resolve({ hasUpdate: false })), reset: vi.fn(),
}))
vi.mock('../store/useStore.js', () => ({ useStore: { getState: () => ({ syncNow: mocks.syncNow, pullAssigned: mocks.pullAssigned }) } }))
vi.mock('../store/useUI.js', () => ({ useUI: { getState: () => ({ sheets: mocks.sheets, toast: mocks.toast }) } }))
vi.mock('../lib/channel.js', () => ({ getChannel: () => Promise.resolve(mocks.channel) }))
vi.mock('../lib/update.js', () => ({ checkForUpdate: (...a) => mocks.check(...a), resetUpdateCheck: (...a) => mocks.reset(...a) }))

import PullToRefresh from './PullToRefresh.jsx'

let host, root
beforeEach(() => {
  for (const f of [mocks.syncNow, mocks.pullAssigned, mocks.toast, mocks.check, mocks.reset]) f.mockClear()
  mocks.sheets = []; mocks.channel = 'sideload'
  mocks.check.mockImplementation(() => Promise.resolve({ hasUpdate: false }))
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
})
afterEach(() => { act(() => root.unmount()); host.remove() })

const mount = path => act(() => root.render(<MemoryRouter initialEntries={[path]}><PullToRefresh /></MemoryRouter>))
const touch = (type, y, x = 100) => act(() => {
  const e = new Event(type, { bubbles: true })
  e.touches = type === 'touchend' ? [] : [{ clientX: x, clientY: y }]
  document.body.dispatchEvent(e)
})
const pull = async (to, from = 100) => { touch('touchstart', from); touch('touchmove', to); await act(async () => { touch('touchend', to); await Promise.resolve() }) }
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)) })

describe('pull to refresh', () => {
  it('a long pull at the top syncs, fetches plans, looks for an update and says it is current', async () => {
    mount('/home')
    await pull(330)
    await settle()
    expect(mocks.syncNow).toHaveBeenCalledTimes(1)
    expect(mocks.pullAssigned).toHaveBeenCalledWith(true)
    expect(mocks.reset).toHaveBeenCalled()
    expect(mocks.check).toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenCalledWith('Up to date')
  })

  it('points at the bell when an update is waiting', async () => {
    mocks.check.mockImplementation(() => Promise.resolve({ hasUpdate: true }))
    mount('/plan')
    await pull(330)
    await settle()
    expect(mocks.toast).toHaveBeenCalledWith('Update available. Check the bell on Home.')
  })

  it('does not look for an app update in the web app or a store build', async () => {
    mocks.channel = 'play'
    mount('/home')
    await pull(330)
    await settle()
    expect(mocks.check).not.toHaveBeenCalled()
    expect(mocks.syncNow).toHaveBeenCalled()
  })

  it('a short pull does nothing', async () => {
    mount('/home')
    await pull(150)
    await settle()
    expect(mocks.syncNow).not.toHaveBeenCalled()
  })

  it('does nothing in the workout, over a sheet, or away from the top', async () => {
    mount('/workout'); await pull(330); await settle()
    mount('/home'); mocks.sheets = [{ id: 1 }]; await pull(330); await settle()
    mocks.sheets = []; Object.defineProperty(window, 'scrollY', { value: 40, configurable: true }); await pull(330); await settle()
    expect(mocks.syncNow).not.toHaveBeenCalled()
  })

  it('a sideways drag is a swipe, not a pull', async () => {
    mount('/home')
    touch('touchstart', 100, 100)
    touch('touchmove', 330, 400)
    await act(async () => { touch('touchend', 330, 400); await Promise.resolve() })
    await settle()
    expect(mocks.syncNow).not.toHaveBeenCalled()
  })
})
