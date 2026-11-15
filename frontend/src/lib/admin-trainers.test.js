import { describe, it, expect } from 'vitest'
import { trainerChoices, filterUsers, noTrainerWhy, inviteBody } from './admin-trainers.js'

const users = [
  { id: 'a', name: 'Zed', trainer: true },
  { id: 'b', name: 'Amy', trainer: true },
  { id: 'c', name: 'Dis', trainer: true, disabled: true },
  { id: 'e', name: 'Old', trainer: true, expired: true },
  { id: 'd', name: 'Dan', trainerId: 'a' },
  { id: 'f', name: 'Fay', trainerId: 'b' },
  { id: 'g', name: 'Gus', noTrainer: true },
  { id: 'h', name: 'Hal' },
]

describe('trainerChoices', () => {
  it('lists trainers who can act, by name, never the person themselves', () => {
    expect(trainerChoices(users).map(u => u.id)).toEqual(['b', 'a'])
    expect(trainerChoices(users, 'a').map(u => u.id)).toEqual(['b'])
    expect(trainerChoices(null)).toEqual([])
  })
})

describe('filterUsers', () => {
  it('filters by role, by having no trainer, and by one trainer', () => {
    expect(filterUsers(users, 'all')).toHaveLength(8)
    expect(filterUsers(users, 'trainers').map(u => u.id)).toEqual(['a', 'b', 'c', 'e'])
    expect(filterUsers(users, 'trainees').map(u => u.id)).toEqual(['d', 'f'])
    expect(filterUsers(users, 'none').map(u => u.id)).toEqual(['g'])
    expect(filterUsers(users, 'a').map(u => u.id)).toEqual(['d'])
  })
})

describe('noTrainerWhy', () => {
  it('says why in words, with the trainer when known', () => {
    expect(noTrainerWhy({ why: 'released', trainerName: 'Tara' })).toBe('their trainer released them (Tara)')
    expect(noTrainerWhy({ why: 'deleted' })).toBe('their trainer was deleted')
    expect(noTrainerWhy({ why: 'odd' })).toBe('no trainer can act for them now')
  })
})

describe('inviteBody', () => {
  it('makes a trainee under a chosen trainer, or a trainer with none', () => {
    expect(inviteBody({ name: 'N', email: 'e', months: 3, role: 'trainee', trainerId: 't1' })).toEqual({ name: 'N', email: 'e', months: 3, trainerId: 't1' })
    expect(inviteBody({ name: 'N', email: 'e', months: null, role: 'trainer', trainerId: 't1' })).toEqual({ name: 'N', email: 'e', months: null, role: 'trainer' })
    expect(inviteBody({ name: 'N', email: 'e', months: 1, role: 'trainee', trainerId: '' })).toEqual({ name: 'N', email: 'e', months: 1 })
  })
})
