import { describe, it, expect } from 'vitest'
import { uniqueName } from './unique-name.js'

describe('uniqueName', () => {
  it('keeps a free name', () => {
    expect(uniqueName('New routine', [])).toBe('New routine')
    expect(uniqueName('New routine', ['Push', 'Pull'])).toBe('New routine')
  })
  it('numbers a taken name from 2, skipping numbers in use', () => {
    expect(uniqueName('New routine', ['New routine'])).toBe('New routine 2')
    expect(uniqueName('New routine', ['New routine', 'New routine 2'])).toBe('New routine 3')
  })
  it('ignores case and spaces, and tolerates missing names', () => {
    expect(uniqueName('New routine', [' new routine '])).toBe('New routine 2')
    expect(uniqueName('New routine', [undefined, null])).toBe('New routine')
    expect(uniqueName('New routine')).toBe('New routine')
  })
})
