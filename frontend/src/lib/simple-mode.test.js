import { describe, expect, it } from 'vitest'
import { isSimple, rootLayout, SIMPLE_HUBS } from './simple-mode.js'

const ORDER = ['workouts', 'plan-equipment', 'appearance', 'health', 'data-backup']

describe('simple settings', () => {
  it('is on only when the profile says so', () => {
    expect(isSimple({ simple: true })).toBe(true)
    expect(isSimple({ simple: false })).toBe(false)
    expect(isSimple({})).toBe(false)
    expect(isSimple(null)).toBe(false)
    expect(isSimple({ simple: 'yes' })).toBe(false)
  })

  it('leaves the root as it was for a profile without it', () => {
    expect(rootLayout(ORDER, {}, false)).toEqual({ hubs: ORDER, reminders: false, more: false })
  })

  it('keeps the basics and offers the rest', () => {
    const l = rootLayout(ORDER, { simple: true }, false)
    expect(l.hubs).toEqual(['appearance', 'data-backup'])
    expect(l.reminders).toBe(true)
    expect(l.more).toBe(true)
  })

  it('lists everything once "All settings" has been opened', () => {
    expect(rootLayout(ORDER, { simple: true }, true)).toEqual({ hubs: ORDER, reminders: false, more: false })
  })

  it('only ever names groups the root has', () => {
    for (const h of SIMPLE_HUBS) expect(ORDER).toContain(h)
  })
})
