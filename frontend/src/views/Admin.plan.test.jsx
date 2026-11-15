// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Admin from './Admin.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* "Plan" in a user's drill-down: the plans you gave them and whether they trained each, giving one
   of your routines (with the custom exercises it uses), updating a plan they have, taking it back. */
const mocks = vi.hoisted(() => ({ answers: {}, sheets: [], posts: [], S: {}, confirm: vi.fn(), me: { id: 'adm', name: 'Admin', admin: true } }))
vi.mock('../lib/api.js', () => ({
  api: (path, init) => {
    if (init?.method === 'POST') mocks.posts.push({ path, body: JSON.parse(init.body) })
    const key = path.split('?')[0]
    return key in mocks.answers ? Promise.resolve(mocks.answers[key]) : Promise.reject(new Error('not found'))
  }
}))
vi.mock('../store/useStore.js', () => {
  const snap = () => ({ user: mocks.me, S: mocks.S })
  const useStore = selector => selector ? selector(snap()) : snap()
  useStore.getState = snap
  return { useStore }
})
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: () => {}, openSheet: (render, opts) => mocks.sheets.push({ render, opts }) })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('react-router-dom', () => ({ useNavigate: () => () => {}, useLocation: () => ({ state: null }) }))
vi.mock('../sheets.jsx', () => ({ confirmSheet: (...a) => mocks.confirm(...a) }))
vi.mock('./AdminCoach.jsx', () => ({ default: () => null }))

const mounted = []
function render(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(el))
  return host
}
const settle = () => act(() => new Promise(r => setTimeout(r, 0)))
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent === text)

const detail = (extra, assigned = []) => ({
  user: { id: 'u1', name: 'Mallory', created: '2026-09-01T00:00:00Z', disabled: false, admin: false, ...extra },
  unit: 'kg', lastSync: null, routines: [], assigned, bodyweight: [], workouts: []
})
async function openMallory() {
  const page = render(<Admin />)
  await settle()
  act(() => [...page.querySelectorAll('.item')].find(el => el.textContent.includes('Mallory')).click())
  const sheet = render(mocks.sheets.at(-1).render(() => {}))
  await settle()
  return sheet
}

beforeEach(() => {
  document.body.innerHTML = ''
  mocks.sheets.length = 0
  mocks.posts.length = 0
  mocks.confirm.mockClear()
  mocks.me = { id: 'adm', name: 'Admin', admin: true }
  mocks.S = {
    routines: [
      { id: 'r1', name: 'Push day', emoji: 'figureStrength', ex: [{ id: 'bench' }, { id: 'cx1' }] },
      { id: 'r2', name: 'Empty', ex: [] },
      { id: 'r3', name: 'Got from someone', assigned: { aid: 'z' }, ex: [{ id: 'squat' }] },
    ],
    customEx: [{ id: 'cx1', n: 'My curl' }, { id: 'cx2', n: 'Unused' }],
  }
  mocks.answers = {
    '/api/admin/users': { users: [{ id: 'u1', name: 'Mallory', workouts: 0, lastSync: null, disabled: false }], invite_only: false },
    '/api/admin/invites': { invites: [] },
    '/api/admin/audit': { events: [], total: 0, enabled: true, retention: { days: 90 }, ip_mode: 'off' },
    '/api/admin/user/plan': { ok: true, aid: 'a1', at: '2026-11-15T10:00:00.000Z' },
    '/api/admin/user/plan/remove': { ok: true },
  }
})
afterEach(() => { act(() => { mounted.splice(0).forEach(root => root.unmount()) }) })

describe('Admin → Plan', () => {
  it('says so when nothing was given, and offers only routines of your own that have exercises', async () => {
    mocks.answers['/api/admin/user'] = detail()
    const sheet = await openMallory()
    expect(sheet.textContent).toContain('No plan given yet.')
    act(() => button(sheet, 'Give a plan').click())
    const pick = render(mocks.sheets.at(-1).render(() => {}))
    expect(pick.textContent).toContain('Give Mallory a plan')
    expect(pick.textContent).toContain('Push day')
    expect(pick.textContent).not.toContain('Empty')
    expect(pick.textContent).not.toContain('Got from someone')
  })

  it('sends the routine with only the custom exercises it uses', async () => {
    mocks.answers['/api/admin/user'] = detail()
    const sheet = await openMallory()
    act(() => button(sheet, 'Give a plan').click())
    const pick = render(mocks.sheets.at(-1).render(() => {}))
    await act(async () => { [...pick.querySelectorAll('.item')].find(el => el.textContent.includes('Push day')).click() })
    expect(mocks.posts).toHaveLength(1)
    expect(mocks.posts[0].path).toBe('/api/admin/user/plan')
    expect(mocks.posts[0].body.id).toBe('u1')
    expect(mocks.posts[0].body.aid).toBeUndefined()
    expect(mocks.posts[0].body.routine.name).toBe('Push day')
    expect(mocks.posts[0].body.customEx).toEqual([{ id: 'cx1', n: 'My curl' }])
  })

  it('shows whether each plan was trained, updates it under the same aid, takes it back after asking', async () => {
    mocks.answers['/api/admin/user'] = detail({}, [
      { aid: 'a1', name: 'Push day', exercises: 2, at: '2026-11-15T10:00:00.000Z', by: 'Admin', sessions: 2, lastTrained: '2026-11-18' },
      { aid: 'a2', name: 'Legs', exercises: 1, at: '2026-11-15T10:00:00.000Z', by: 'Admin', sessions: 0, lastTrained: null },
    ])
    const sheet = await openMallory()
    expect(sheet.textContent).toContain('trained 2 times')
    expect(sheet.textContent).toContain('not trained yet')
    expect(sheet.textContent).toContain('last trained')

    act(() => button(sheet, 'Update').click())
    const pick = render(mocks.sheets.at(-1).render(() => {}))
    expect(pick.textContent).toContain('Update the plan')
    // The routine named like the plan comes first.
    await act(async () => { pick.querySelector('.item').click() })
    expect(mocks.posts[0].body.aid).toBe('a1')

    act(() => [...sheet.querySelectorAll('button')].filter(b => b.textContent === 'Take back')[1].click())
    const ask = mocks.confirm.mock.calls.at(-1)[0]
    expect(ask.title).toBe('Take back Legs?')
    expect(ask.message).not.toMatch(/—/)
    await act(async () => { await ask.onConfirm() })
    expect(mocks.posts.at(-1)).toEqual({ path: '/api/admin/user/plan/remove', body: { id: 'u1', aid: 'a2' } })
  })

  it('is not offered for a disabled profile', async () => {
    mocks.answers['/api/admin/user'] = detail({ disabled: true })
    expect(button(await openMallory(), 'Give a plan')).toBeUndefined()
  })
})
