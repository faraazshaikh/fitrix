import { describe, it, expect } from 'vitest'
import { rootLayout, SIMPLE_HUBS } from './simple-mode.js'

const ORDER = ['workout', 'plan', 'appearance', 'health', 'data-backup']

describe('rootLayout', () => {
  it('always lists the basics, in order, with Reminders of its own', () => {
    expect(rootLayout(ORDER)).toEqual({ hubs: ['appearance', 'data-backup'], reminders: true })
  })
  it('lists only groups that exist in the order given', () => {
    expect(rootLayout(['workout', 'plan'])).toEqual({ hubs: [], reminders: true })
    expect(SIMPLE_HUBS).toEqual(['appearance', 'data-backup'])
  })
})
