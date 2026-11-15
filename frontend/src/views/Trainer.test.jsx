// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Trainer from './Trainer.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* A trainer's page: the people they train, a person's sheet (with the release), and their invite
   codes. The routes are api/trainer.js's; the server decides who may, this only asks. */
const mocks = vi.hoisted(() => ({ answers: {}, sheets: [], posts: [], confirm: vi.fn(), me: { id: 't1', name: 'Tara', trainer: true } }))
vi.mock('../lib/api.js', () => ({
  api: (path, init) => {
    if (init?.method === 'POST') mocks.posts.push({ path, body: JSON.parse(init.body) })
    const key = path.split('?')[0]
    return key in mocks.answers ? Promise.resolve(mocks.answers[key]) : Promise.reject(new Error('not found'))
  },
  remoteAuth: () => null, appBase: () => 'https://fit.example'
}))
vi.mock('../store/useStore.js', () => {
  const snap = () => ({ user: mocks.me, S: { routines: [] } })
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
vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }))
vi.mock('../sheets.jsx', () => ({ confirmSheet: (...a) => mocks.confirm(...a) }))

function render(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  act(() => createRoot(host).render(el))
  return host
}
const settle = () => act(() => new Promise(r => setTimeout(r, 0)))
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent.includes(text))

beforeEach(() => {
  document.body.innerHTML = ''
  mocks.sheets.length = 0; mocks.posts.length = 0; mocks.confirm.mockClear()
  mocks.me = { id: 't1', name: 'Tara', trainer: true }
  mocks.answers = {
    '/api/trainer/trainees': { trainees: [
      { id: 'u1', name: 'Mallory', plans: 1, lastWorkout: '2026-11-10', lastSync: Date.now() },
      { id: 'u2', name: 'Newbie', plans: 0, waiting: true }
    ] },
    '/api/trainer/invites': { invites: [{ code: 'ABC123', name: 'Sam', used: false }, { code: 'USED1', used: true }], max: 25 },
    '/api/trainer/trainee': {
      user: { id: 'u1', name: 'Mallory' }, unit: 'kg', lastSync: Date.now(), lastWorkout: '2026-11-10',
      routines: [], assigned: [], workouts: [{ id: 'w1', d: '2026-11-10', name: 'Push', entries: [{ sets: [] }] }],
      bodyweight: [{ d: '2026-11-09', kg: 81.5 }], measurements: []
    }
  }
})

describe('Trainer', () => {
  it('renders nothing for someone who is not a trainer', async () => {
    mocks.me = { id: 'x', name: 'Xan' }
    const page = render(<Trainer />)
    await settle()
    expect(page.textContent).toBe('')
  })

  it('lists trainees, marks one still waiting, and lists only unused codes', async () => {
    const page = render(<Trainer />)
    await settle()
    expect(page.textContent).toContain('Mallory')
    expect(page.textContent).toContain('Newbie')
    expect(page.textContent).toContain('waiting')
    expect(page.textContent).toContain('ABC123')
    expect(page.textContent).not.toContain('USED1')
  })

  it('opens a person: what they logged, and releasing asks first', async () => {
    const page = render(<Trainer />)
    await settle()
    act(() => [...page.querySelectorAll('.item')].find(el => el.textContent.includes('Mallory')).click())
    const sheet = render(mocks.sheets.at(-1).render(() => {}))
    await settle()
    expect(sheet.textContent).toContain('Push')
    expect(sheet.textContent).toContain('81.5 kg')
    expect(sheet.textContent).toContain('Never their progress photos')
    act(() => button(sheet, 'Release Mallory').click())
    expect(mocks.confirm).toHaveBeenCalledTimes(1)
    const opts = mocks.confirm.mock.calls[0][0]
    expect(opts.danger).toBe(true)
    mocks.answers['/api/trainer/trainee/release'] = { ok: true }
    opts.onConfirm()
    await settle()
    expect(mocks.posts.at(-1)).toEqual({ path: '/api/trainer/trainee/release', body: { id: 'u1' } })
  })

  it('a waiting trainee shows no training, only the plans', async () => {
    mocks.answers['/api/trainer/trainee'] = { user: { id: 'u2', name: 'Newbie' }, waiting: true, assigned: [] }
    const page = render(<Trainer />)
    await settle()
    act(() => [...page.querySelectorAll('.item')].find(el => el.textContent.includes('Newbie')).click())
    const sheet = render(mocks.sheets.at(-1).render(() => {}))
    await settle()
    expect(sheet.textContent).toContain('has not opened Fitrix')
    expect(sheet.textContent).not.toContain('Recent workouts')
  })

  it('an invite for a trainee sends a name, and never a role or a trainer', async () => {
    mocks.answers['/api/trainer/invites/new'] = { invite: { code: 'NEW1', name: 'Alex' } }
    const page = render(<Trainer />)
    await settle()
    act(() => button(page, 'Invite').click())
    const sheet = render(mocks.sheets.at(-1).render(() => {}))
    const name = sheet.querySelector('input')
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(name, 'Alex')
      name.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => button(sheet, 'Create invite').click())
    await settle()
    expect(mocks.posts.at(-1)).toEqual({ path: '/api/trainer/invites/new', body: { name: 'Alex' } })
  })
})
