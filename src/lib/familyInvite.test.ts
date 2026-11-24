import { describe, it, expect } from 'vitest'
import { formatInviteCode, inviteShareText, INVITE_TTL_HOURS } from './familyInvite'

describe('familyInvite helpers', () => {
  it('groups an 8-char code in two halves', () => {
    expect(formatInviteCode('ABCDEFGH')).toBe('ABCD EFGH')
    expect(formatInviteCode('ABC')).toBe('ABC')
  })
  it('share text says one person and the expiry', () => {
    const t = inviteShareText('ABCDEFGH')
    expect(t).toContain('ABCDEFGH')
    expect(t).toContain('una persona')
    expect(t).toContain(`${INVITE_TTL_HOURS} h`)
  })
})
