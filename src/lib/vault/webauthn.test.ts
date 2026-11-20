import { describe, it, expect, afterEach, vi } from 'vitest'
import { FakeAuthenticator, uninstallFakeAuthenticator } from '../../test/fakeAuthenticator'
import {
  PRF_UNSUPPORTED_MESSAGE,
  VaultAuthError,
  createVaultCredential,
  detectPrfSupport,
  evaluatePrf,
  vaultAuthErrorMessage,
  vaultRpId,
} from './webauthn'
import { bytesToBase64Url, randomBytes } from './encoding'

const USER_ID = '6f1c2b4e-8d3a-4c5b-9e7f-0a1b2c3d4e5f'

afterEach(() => {
  uninstallFakeAuthenticator()
  vi.restoreAllMocks()
})

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (e) {
    if (e instanceof VaultAuthError) return e.code
    throw e
  }
  throw new Error('expected a VaultAuthError')
}

function bytes(source: BufferSource | undefined): number[] {
  if (!source) return []
  return Array.from(
    ArrayBuffer.isView(source)
      ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
      : new Uint8Array(source)
  )
}

describe('detectPrfSupport', () => {
  it('is unsupported without WebAuthn', async () => {
    vi.stubGlobal('PublicKeyCredential', undefined)
    expect(await detectPrfSupport()).toBe('unsupported')
  })

  it('is unsupported outside a secure context', async () => {
    new FakeAuthenticator().install()
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true })
    expect(await detectPrfSupport()).toBe('unsupported')
  })

  it('follows getClientCapabilities when the browser has it', async () => {
    const fake = new FakeAuthenticator()
    fake.capabilities = { 'extension:prf': false }
    fake.install()
    expect(await detectPrfSupport()).toBe('unsupported')
    uninstallFakeAuthenticator()
    const ok = new FakeAuthenticator()
    ok.capabilities = { 'extension:prf': true }
    ok.install()
    expect(await detectPrfSupport()).toBe('supported')
  })

  it('is unknown when the browser cannot tell (decided at enrolment)', async () => {
    new FakeAuthenticator().install()
    expect(await detectPrfSupport()).toBe('unknown')
  })
})

describe('createVaultCredential', () => {
  it('asks for a UV-required, discoverable-preferred passkey with PRF on the given salt', async () => {
    const fake = new FakeAuthenticator('at-create').install()
    const salt = randomBytes(32)
    const exclude = bytesToBase64Url(randomBytes(32))
    const result = await createVaultCredential({
      userId: USER_ID,
      userName: 'ana@x.uy',
      prfSalt: salt,
      excludeCredentialIds: [exclude],
    })
    const pk = fake.createCalls[0].publicKey!
    expect(pk.rp).toEqual({ id: 'localhost', name: 'WikiVigo' })
    expect(vaultRpId()).toBe('localhost')
    expect(bytes(pk.user.id)).toEqual([
      0x6f, 0x1c, 0x2b, 0x4e, 0x8d, 0x3a, 0x4c, 0x5b, 0x9e, 0x7f, 0x0a, 0x1b, 0x2c, 0x3d, 0x4e, 0x5f,
    ])
    expect(pk.user.name).toBe('ana@x.uy')
    expect(pk.authenticatorSelection).toMatchObject({
      residentKey: 'preferred',
      userVerification: 'required',
    })
    expect(pk.attestation).toBe('none')
    expect(bytes(pk.challenge)).toHaveLength(32)
    expect(pk.excludeCredentials!.map((c) => bytesToBase64Url(new Uint8Array(bytes(c.id))))).toEqual([
      exclude,
    ])
    const prf = (pk.extensions as { prf: { eval: { first: BufferSource } } }).prf
    expect(bytes(prf.eval.first)).toEqual(Array.from(salt))
    // PRF returned at creation: no second prompt
    expect(fake.getCalls).toHaveLength(0)
    expect(new Uint8Array(result.prfOutput)).toEqual(
      new Uint8Array(await fake.prfOutput(result.credentialId, salt))
    )
  })

  it('evaluates the PRF with a follow-up assertion when create does not return it', async () => {
    const fake = new FakeAuthenticator('on-get').install()
    const salt = randomBytes(32)
    const result = await createVaultCredential({
      userId: USER_ID,
      userName: 'ana@x.uy',
      prfSalt: salt,
      excludeCredentialIds: [],
    })
    expect(fake.getCalls).toHaveLength(1)
    expect(fake.getCalls[0].publicKey!.userVerification).toBe('required')
    expect(new Uint8Array(result.prfOutput)).toEqual(
      new Uint8Array(await fake.prfOutput(result.credentialId, salt))
    )
  })

  it('PRF not enabled → prf_unsupported, and the new credential is signalled as unknown', async () => {
    const fake = new FakeAuthenticator('none').install()
    const code = await codeOf(
      createVaultCredential({
        userId: USER_ID,
        userName: 'a',
        prfSalt: randomBytes(32),
        excludeCredentialIds: [],
      })
    )
    expect(code).toBe('prf_unsupported')
    expect(fake.signalled).toHaveLength(1)
    expect(vaultAuthErrorMessage('prf_unsupported')).toBe(PRF_UNSUPPORTED_MESSAGE)
    expect(PRF_UNSUPPORTED_MESSAGE).toMatch(/No hay alternativa con contraseña/)
  })

  it('maps ceremony errors to Spanish codes', async () => {
    const fake = new FakeAuthenticator('at-create').install()
    const opts = { userId: USER_ID, userName: 'a', prfSalt: randomBytes(32), excludeCredentialIds: [] }
    fake.nextError = 'NotAllowedError'
    expect(await codeOf(createVaultCredential(opts))).toBe('cancelled')
    fake.nextError = 'SecurityError'
    expect(await codeOf(createVaultCredential(opts))).toBe('insecure_context')
    const first = await createVaultCredential(opts)
    expect(await codeOf(createVaultCredential({ ...opts, excludeCredentialIds: [first.credentialId] }))).toBe(
      'already_registered'
    )
    expect(vaultAuthErrorMessage('cancelled')).toMatch(/Se canceló/)
  })

  it('without WebAuthn → webauthn_unavailable', async () => {
    vi.stubGlobal('PublicKeyCredential', undefined)
    expect(
      await codeOf(
        createVaultCredential({
          userId: USER_ID,
          userName: 'a',
          prfSalt: randomBytes(32),
          excludeCredentialIds: [],
        })
      )
    ).toBe('webauthn_unavailable')
  })
})

describe('evaluatePrf', () => {
  async function twoCredentials(fake: FakeAuthenticator) {
    const a = { prfSalt: randomBytes(32) }
    const b = { prfSalt: randomBytes(32) }
    const ca = await createVaultCredential({
      userId: USER_ID,
      userName: 'a',
      prfSalt: a.prfSalt,
      excludeCredentialIds: [],
    })
    const cb = await createVaultCredential({
      userId: USER_ID,
      userName: 'a',
      prfSalt: b.prfSalt,
      excludeCredentialIds: [],
    })
    fake.getCalls.length = 0
    return [
      { credentialId: ca.credentialId, prfSalt: a.prfSalt },
      { credentialId: cb.credentialId, prfSalt: b.prfSalt },
    ]
  }

  it('one credential uses prf.eval', async () => {
    const fake = new FakeAuthenticator('at-create').install()
    const [a] = await twoCredentials(fake)
    const r = await evaluatePrf([a])
    const ext = fake.getCalls[0].publicKey!.extensions as {
      prf: { eval?: unknown; evalByCredential?: unknown }
    }
    expect(ext.prf.eval).toBeDefined()
    expect(ext.prf.evalByCredential).toBeUndefined()
    expect(r.credentialId).toBe(a.credentialId)
  })

  it('several credentials use evalByCredential with each salt, and report which one answered', async () => {
    const fake = new FakeAuthenticator('at-create').install()
    const [a, b] = await twoCredentials(fake)
    fake.choose = () => b.credentialId
    const r = await evaluatePrf([a, b])
    const pk = fake.getCalls[0].publicKey!
    const ext = pk.extensions as { prf: { evalByCredential: Record<string, { first: BufferSource }> } }
    expect(Object.keys(ext.prf.evalByCredential).sort()).toEqual([a.credentialId, b.credentialId].sort())
    expect(bytes(ext.prf.evalByCredential[b.credentialId].first)).toEqual(Array.from(b.prfSalt))
    expect(pk.userVerification).toBe('required')
    expect(pk.rpId).toBe('localhost')
    expect(pk.allowCredentials).toHaveLength(2)
    expect(r.credentialId).toBe(b.credentialId)
    expect(new Uint8Array(r.prfOutput)).toEqual(
      new Uint8Array(await fake.prfOutput(b.credentialId, b.prfSalt))
    )
  })

  it('missing PRF results, missing UV and cancellations are errors', async () => {
    const fake = new FakeAuthenticator('at-create').install()
    const [a] = await twoCredentials(fake)
    fake.userVerified = false
    expect(await codeOf(evaluatePrf([a]))).toBe('no_user_verification')
    fake.userVerified = true
    fake.prf = 'none'
    expect(await codeOf(evaluatePrf([a]))).toBe('no_prf_result')
    fake.prf = 'on-get'
    fake.nextError = 'NotAllowedError'
    expect(await codeOf(evaluatePrf([a]))).toBe('cancelled')
    expect(await codeOf(evaluatePrf([]))).toBe('unknown_credential')
  })

  it('a PRF output that is not 32 bytes is refused (it would give a predictable KEK)', async () => {
    const fake = new FakeAuthenticator('at-create').install()
    const [a] = await twoCredentials(fake)
    vi.spyOn(fake, 'prfOutput').mockResolvedValue(new ArrayBuffer(0))
    expect(await codeOf(evaluatePrf([a]))).toBe('no_prf_result')
    vi.spyOn(fake, 'prfOutput').mockResolvedValue(new ArrayBuffer(16))
    expect(await codeOf(evaluatePrf([a]))).toBe('no_prf_result')
  })
})
