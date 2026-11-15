// @vitest-environment happy-dom

/* Plans an admin assigned (GET /api/assigned): pullAssigned files them as routines in the saved
   state, asks again at most once a minute, does nothing signed out, and an older server (an error)
   changes nothing. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api.js', () => ({ api: vi.fn() }))
vi.mock('./useUI.js', () => ({ useUI: { getState: () => ({ toast: vi.fn() }) } }))

import { api } from '../lib/api.js'
import { DEF, useStore } from './useStore.js'

const clone = value => JSON.parse(JSON.stringify(value))
const plan = (aid, name, at = '2026-11-15T10:00:00.000Z') => ({ aid, by: 'Faraaz', at, customEx: [], routine: { id: 'a-' + aid, name, emoji: 'figureStrength', ex: [{ id: 'bench' }] } })
const reads = () => api.mock.calls.filter(([p]) => p === '/api/assigned')

// The store is one module for the whole file and remembers when it last asked: each test starts
// ten minutes after the one before.
let clock = Date.parse('2026-11-15T10:00:00Z')
beforeEach(() => {
  vi.useFakeTimers()
  clock += 10 * 60 * 1000
  vi.setSystemTime(clock)
  localStorage.clear()
  api.mockReset()
  api.mockResolvedValue({ ok: true })
  useStore.setState({ S: clone(DEF), user: { id: 'user-1' }, ready: true })
})
afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
  useStore.setState({ S: clone(DEF), user: null, ready: false })
})

describe('pullAssigned', () => {
  it('a pull-down asks at once, inside the minute', async () => {
    api.mockImplementation(async p => (p === '/api/assigned' ? { plans: [plan('x1', 'Push')] } : { ok: true }))
    await useStore.getState().pullAssigned()
    await useStore.getState().pullAssigned()
    expect(reads()).toHaveLength(1)
    await useStore.getState().pullAssigned(true)
    expect(reads()).toHaveLength(2)
  })

  it('files the plans as routines of their own', async () => {
    api.mockImplementation(async p => (p === '/api/assigned' ? { plans: [plan('x1', 'Push')] } : { ok: true }))
    await useStore.getState().pullAssigned()
    const r = useStore.getState().S.routines.find(x => x.id === 'a-x1')
    expect(r.name).toBe('Push')
    expect(r.assigned).toEqual({ aid: 'x1', by: 'Faraaz', at: '2026-11-15T10:00:00.000Z' })
  })

  it('asks again only after a minute, and then picks up an update', async () => {
    api.mockImplementation(async p => (p === '/api/assigned' ? { plans: [plan('x1', 'Push')] } : { ok: true }))
    await useStore.getState().pullAssigned()
    await useStore.getState().pullAssigned()
    expect(reads()).toHaveLength(1)
    vi.setSystemTime(clock + 61 * 1000)
    api.mockImplementation(async p => (p === '/api/assigned' ? { plans: [plan('x1', 'Push v2', '2026-11-15T10:01:00.000Z')] } : { ok: true }))
    await useStore.getState().pullAssigned()
    expect(reads()).toHaveLength(2)
    expect(useStore.getState().S.routines.map(x => x.name)).toEqual(['Push v2'])
  })

  it('does nothing when signed out, and nothing changes when the server has no such route', async () => {
    useStore.setState({ user: null })
    await useStore.getState().pullAssigned()
    expect(api).not.toHaveBeenCalled()
    useStore.setState({ user: { id: 'user-1' } })
    api.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }))
    await useStore.getState().pullAssigned()
    expect(useStore.getState().S.routines).toEqual([])
  })
})
