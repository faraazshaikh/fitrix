import { describe, it, expect } from 'vitest'
import { needsAck } from './trainer-notice.js'

describe('needsAck', () => {
  it('asks only when a trainer exists and has not been acknowledged', () => {
    expect(needsAck(null)).toBe(false)
    expect(needsAck({})).toBe(false)
    expect(needsAck({ myTrainer: { name: 'Tara', ack: true } })).toBe(false)
    expect(needsAck({ myTrainer: { name: 'Tara', ack: false } })).toBe(true)
  })
})
