import { describe, it, expect, vi } from 'vitest'
import { withTrainerConsent, isTrainerConsent } from './signup-consent.js'

const refusal = (status, data) => Object.assign(new Error('x'), { status, data })

describe('withTrainerConsent', () => {
  it('sends once when no trainer is involved', async () => {
    const send = vi.fn().mockResolvedValue('ok')
    const ask = vi.fn()
    expect(await withTrainerConsent(send, ask)).toBe('ok')
    expect(send).toHaveBeenCalledTimes(1)
    expect(ask).not.toHaveBeenCalled()
  })
  it('shows the trainer and sends again with trainerSeen after a yes', async () => {
    const send = vi.fn()
      .mockRejectedValueOnce(refusal(409, { code: 'trainer-consent', trainer: 'Tara' }))
      .mockResolvedValueOnce('ok')
    const ask = vi.fn().mockResolvedValue(true)
    expect(await withTrainerConsent(send, ask)).toBe('ok')
    expect(ask).toHaveBeenCalledWith('Tara')
    expect(send).toHaveBeenNthCalledWith(1, {})
    expect(send).toHaveBeenNthCalledWith(2, { trainerSeen: true })
  })
  it('ends quietly (AbortError) on a no, and never sends the second request', async () => {
    const send = vi.fn().mockRejectedValue(refusal(409, { code: 'trainer-consent', trainer: 'Tara' }))
    await expect(withTrainerConsent(send, async () => false)).rejects.toMatchObject({ name: 'AbortError' })
    expect(send).toHaveBeenCalledTimes(1)
  })
  it('lets every other refusal through unchanged', async () => {
    const boom = refusal(403, { code: 'invite' })
    await expect(withTrainerConsent(async () => { throw boom }, async () => true)).rejects.toBe(boom)
    expect(isTrainerConsent(refusal(409, { code: 'name-taken' }))).toBe(false)
  })
})
