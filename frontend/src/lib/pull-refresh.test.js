import { describe, expect, it } from 'vitest'
import { PULL_MAX, PULL_THRESHOLD, mostlyDown, pullAllowed, pullDistance, pullMayStart, pullPhase } from './pull-refresh.js'

describe('pull to refresh', () => {
  it('works on the screens you read, not on the ones you act on', () => {
    for (const p of ['/home', '/plan', '/stats', '/history', '/settings', '/settings/workout', '/library']) expect(pullAllowed(p)).toBe(true)
    for (const p of ['/workout', '/coach', '/coach/intake', '/plan/r/abc', '/plan/prog/x', '/admin', '/measurements', '', undefined]) expect(pullAllowed(p)).toBe(false)
  })

  it('ignores a small wobble and resists a long pull', () => {
    expect(pullDistance(0)).toBe(0)
    expect(pullDistance(8)).toBe(0)
    expect(pullDistance(-40)).toBe(0)
    expect(pullDistance(60)).toBeGreaterThan(0)
    expect(pullDistance(60)).toBeLessThan(60)
    expect(pullDistance(2000)).toBe(PULL_MAX)
  })

  it('goes from nothing to pulling to ready', () => {
    expect(pullPhase(0)).toBe('idle')
    expect(pullPhase(PULL_THRESHOLD - 1)).toBe('pulling')
    expect(pullPhase(PULL_THRESHOLD)).toBe('ready')
    expect(pullPhase(PULL_MAX)).toBe('ready')
  })

  it('a ready pull needs a real drag, about 140 px of finger travel', () => {
    expect(pullPhase(pullDistance(100))).toBe('pulling')
    expect(pullPhase(pullDistance(145))).toBe('ready')
  })

  it('only starts at the top, with nothing open, and not on something that scrolls', () => {
    const plain = { closest: () => null }
    expect(pullMayStart({ scrollY: 0, sheets: 0, target: plain })).toBe(true)
    expect(pullMayStart({ scrollY: 1, sheets: 0, target: plain })).toBe(false)
    expect(pullMayStart({ scrollY: 0, sheets: 1, target: plain })).toBe(false)
    expect(pullMayStart({ scrollY: 0, sheets: 0, target: { closest: () => ({}) } })).toBe(false)
  })

  it('a sideways drag is not a pull', () => {
    expect(mostlyDown(5, 80)).toBe(true)
    expect(mostlyDown(80, 40)).toBe(false)
    expect(mostlyDown(0, -30)).toBe(false)
  })
})
