// @vitest-environment happy-dom
// "Or start one of these" (lib/other-routines.js): on a planned day the other routines are one tap
// away, a trainer's plans first. Not in rotation (it has its own chips) and not mid-session.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'
import { startFlow } from '../sheets.jsx'
import Home from './Home.jsx'

const nav = vi.fn()
vi.mock('react-router-dom', () => ({ useNavigate: () => nav }))
vi.mock('../sheets.jsx', () => ({
  starterPlanSheet: vi.fn(), bwSheet: vi.fn(), goalSheet: vi.fn(), dayOverrideSheet: vi.fn(),
  calendarSheet: vi.fn(), startFlow: vi.fn(), bwDeltaColor: () => '', weighInsSheet: vi.fn(),
}))

const ex = [{ id: '0025' }]
const routines = [
  { id: 'r1', name: 'Push', ex }, { id: 'r2', name: 'Pull', ex }, { id: 'r3', name: 'Legs', ex },
  { id: 'a-x1', name: 'Coach day', ex, assigned: { aid: 'x1', by: 'Faraaz', at: '2026-11-15T10:00:00.000Z' } },
]
let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  nav.mockClear(); startFlow.mockClear()
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })

const setS = (over = {}) => useStore.setState(s => ({
  S: { ...s.S, routines, dayPlan: {}, workouts: [], active: null, weighIn: false, scheduleMode: null, queue: null,
    week: { 0: ['r1'], 1: ['r1'], 2: ['r1'], 3: ['r1'], 4: ['r1'], 5: ['r1'], 6: ['r1'] }, ...over },
  user: null,
}))
const mount = () => act(() => root.render(<Home />))
const chips = () => [...host.querySelectorAll('.other-routines .chip')].map(b => b.textContent)

describe('Home, other routines', () => {
  it('lists the others, a trainer\'s plan first, and not today\'s', () => {
    setS(); mount()
    expect(chips()).toEqual(['Coach day', 'Pull', 'Legs'])
  })

  it('one tap starts that routine', () => {
    setS(); mount()
    act(() => { host.querySelector('.other-routines .chip').dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(startFlow).toHaveBeenCalledWith(['a-x1'])
  })

  it('is there on a rest day too', () => {
    setS({ week: {} }); mount()
    expect(chips().length).toBe(4)
  })

  it('is not there while a session runs', () => {
    setS({ active: { id: 'a', name: 'Push', start: Date.now(), cur: 0, entries: [] } }); mount()
    expect(host.querySelector('.other-routines')).toBeNull()
  })

  it('is not there with a single routine', () => {
    setS({ routines: [routines[0]] }); mount()
    expect(host.querySelector('.other-routines')).toBeNull()
  })
})
