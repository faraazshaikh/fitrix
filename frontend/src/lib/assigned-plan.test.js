import { describe, expect, it } from 'vitest'
import { applyAssigned, assignedChanges } from './assigned-plan.js'

const plan = (aid, name, at = '2026-11-15T10:00:00.000Z', extra = {}) => ({
  aid, by: 'Faraaz', at, customEx: [], routine: { id: 'a-' + aid, name, emoji: 'figureStrength', ex: [{ id: 'bench' }], ...extra },
})

describe('applyAssigned', () => {
  it('files a new plan as a routine marked with who sent it', () => {
    const S = { routines: [{ id: 'mine', name: 'Mine', ex: [] }] }
    const out = applyAssigned(S, [plan('x1', 'Push')])
    expect(out).toEqual({ added: ['Push'], updated: [], removed: [] })
    expect(S.routines.map(r => r.id)).toEqual(['mine', 'a-x1'])
    expect(S.routines[1].assigned).toEqual({ aid: 'x1', by: 'Faraaz', at: '2026-11-15T10:00:00.000Z' })
  })

  it('leaves a plan alone when nothing newer was sent, so the person\'s own edits stay', () => {
    const S = { routines: [] }
    applyAssigned(S, [plan('x1', 'Push')])
    S.routines[0].name = 'My push'
    expect(assignedChanges(S, [plan('x1', 'Push')])).toBe(false)
    expect(applyAssigned(S, [plan('x1', 'Push')])).toEqual({ added: [], updated: [], removed: [] })
    expect(S.routines[0].name).toBe('My push')
  })

  it('replaces it in place when the admin sends it again', () => {
    const S = { routines: [] }
    applyAssigned(S, [plan('x1', 'Push'), plan('x2', 'Pull')])
    const later = '2026-11-16T09:00:00.000Z'
    expect(assignedChanges(S, [plan('x1', 'Push v2', later), plan('x2', 'Pull')])).toBe(true)
    const out = applyAssigned(S, [plan('x1', 'Push v2', later), plan('x2', 'Pull')])
    expect(out.updated).toEqual(['Push v2'])
    expect(S.routines.map(r => r.name)).toEqual(['Push v2', 'Pull'])
  })

  it('removes a plan the admin took back, and its place in the week, but not an own routine', () => {
    const S = { routines: [{ id: 'mine', name: 'Mine', ex: [] }], week: { 1: ['a-x1'], 3: ['mine'] } }
    applyAssigned(S, [plan('x1', 'Push')])
    expect(assignedChanges(S, [])).toBe(true)
    const out = applyAssigned(S, [])
    expect(out.removed).toEqual(['Push'])
    expect(S.routines.map(r => r.id)).toEqual(['mine'])
    expect(S.week).toEqual({ 3: ['mine'] })
  })

  it('adds the custom exercises it needs once, by id', () => {
    const S = { routines: [], customEx: [{ id: 'c1', n: 'Mine already' }] }
    applyAssigned(S, [{ ...plan('x1', 'Push'), customEx: [{ id: 'c1', n: 'Theirs' }, { id: 'c2', n: 'New' }] }])
    expect(S.customEx.map(c => c.id)).toEqual(['c1', 'c2'])
    expect(S.customEx[0].n).toBe('Mine already')
  })

  it('ignores junk from the server', () => {
    const S = { routines: [] }
    expect(applyAssigned(S, [null, { aid: 1 }, { aid: 'z', routine: {} }])).toEqual({ added: [], updated: [], removed: [] })
    expect(applyAssigned(S, undefined).added).toEqual([])
    expect(S.routines).toEqual([])
  })
})
