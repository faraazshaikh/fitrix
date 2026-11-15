import { describe, it, expect } from 'vitest'
import { needsAck, wantsSimpleDefault } from './trainer-notice.js'

describe('needsAck', () => {
  it('asks only when a trainer exists and has not been acknowledged', () => {
    expect(needsAck(null)).toBe(false)
    expect(needsAck({})).toBe(false)
    expect(needsAck({ myTrainer: { name: 'Tara', ack: true } })).toBe(false)
    expect(needsAck({ myTrainer: { name: 'Tara', ack: false } })).toBe(true)
  })
})

describe('wantsSimpleDefault', () => {
  const user = { myTrainer: { name: 'Tara', ack: true } }
  it('turns on for a new profile under a trainer', () => {
    expect(wantsSimpleDefault(user, { workouts: [], bodyweight: [] })).toBe(true)
  })
  it('leaves a chosen setting alone, either way', () => {
    expect(wantsSimpleDefault(user, { simple: false })).toBe(false)
    expect(wantsSimpleDefault(user, { simple: true })).toBe(false)
  })
  it('leaves a profile with history alone', () => {
    expect(wantsSimpleDefault(user, { workouts: [{ id: 'w' }] })).toBe(false)
    expect(wantsSimpleDefault(user, { bodyweight: [{ d: '2026-01-01' }] })).toBe(false)
  })
  it('does nothing without a trainer', () => {
    expect(wantsSimpleDefault({}, {})).toBe(false)
  })
})
