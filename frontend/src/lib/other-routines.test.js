import { describe, expect, it } from 'vitest'
import { lastDone, otherRoutines } from './other-routines.js'

const r = (id, extra = {}) => ({ id, name: id, ex: [{ id: 'bench' }], ...extra })

describe('other routines', () => {
  it('reads the last day of each routine, from one id or several', () => {
    const w = [{ d: '2026-11-01', routineId: 'push' }, { d: '2026-11-05', routineIds: ['push', 'pull'] }, { d: '2026-11-03', routineId: 'pull' }, { d: '2026-11-09' }]
    expect(lastDone(w)).toEqual({ push: '2026-11-05', pull: '2026-11-05' })
    expect(lastDone(null)).toEqual({})
  })

  it('leaves out today and routines with nothing in them', () => {
    const S = { routines: [r('push'), r('pull'), r('empty', { ex: [] }), r('legs')], workouts: [] }
    expect(otherRoutines(S, ['push']).map(x => x.id)).toEqual(['pull', 'legs'])
  })

  it('puts a trainer\'s plans first, then what has waited longest', () => {
    const S = {
      routines: [r('push'), r('pull'), r('legs'), r('a-x1', { assigned: { aid: 'x1', by: 'Faraaz' } })],
      workouts: [{ d: '2026-11-10', routineId: 'push' }, { d: '2026-11-05', routineId: 'pull' }],
    }
    expect(otherRoutines(S, []).map(x => x.id)).toEqual(['a-x1', 'legs', 'pull', 'push'])
  })

  it('keeps the plan\'s own order on a tie and stops at the limit', () => {
    const S = { routines: ['a', 'b', 'c', 'd', 'e', 'f'].map(i => r(i)), workouts: [] }
    expect(otherRoutines(S, [], 3).map(x => x.id)).toEqual(['a', 'b', 'c'])
    expect(otherRoutines(S, ['a']).map(x => x.id)).toEqual(['b', 'c', 'd', 'e'])
  })

  it('copes with a profile that has no routines', () => {
    expect(otherRoutines({}, [])).toEqual([])
    expect(otherRoutines(null, [])).toEqual([])
  })
})
