// Test-only fake of navigator.credentials for the vault (specs/secret-vault.md).
// Each credential holds a random secret; its "PRF" is HMAC-SHA-256(secret,
// SHA-256("WebAuthn PRF" ‖ 0x00 ‖ salt)), the same shape as CTAP2
// hmac-secret behind the WebAuthn PRF extension. Never used outside tests.
import { vi } from 'vitest'
import { bytesToBase64Url, base64UrlToBytes, concatBytes, randomBytes, utf8 } from '../lib/vault/encoding'

export type PrfMode = 'at-create' | 'on-get' | 'none'

interface StoredCredential {
  secret: Uint8Array<ArrayBuffer>
}

function asBytes(source: BufferSource): Uint8Array<ArrayBuffer> {
  const view = ArrayBuffer.isView(source)
    ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
    : new Uint8Array(source)
  return new Uint8Array(view)
}

function domError(name: string): DOMException {
  return new DOMException(name, name)
}

export class FakeAuthenticator {
  readonly credentials = new Map<string, StoredCredential>()
  readonly createCalls: CredentialCreationOptions[] = []
  readonly getCalls: CredentialRequestOptions[] = []
  prf: PrfMode
  userVerified = true
  /** Thrown by the next ceremony (e.g. NotAllowedError), then cleared. */
  nextError: string | null = null
  /** Which allowed credential "the user" picks (default: the first one this authenticator holds). */
  choose: ((allowed: string[]) => string) | null = null
  capabilities: Record<string, boolean> | null = null
  /**
   * False models "the new passkey is created on ANOTHER device" (the fake
   * still answers assertions for every credential it ever made).
   */
  excludeChecks = true
  readonly signalled: string[] = []

  constructor(prf: PrfMode = 'on-get') {
    this.prf = prf
  }

  async prfOutput(credentialId: string, salt: BufferSource): Promise<ArrayBuffer> {
    const cred = this.credentials.get(credentialId)
    if (!cred) throw new Error('unknown credential')
    const input = await crypto.subtle.digest(
      'SHA-256',
      concatBytes(utf8('WebAuthn PRF'), new Uint8Array([0]), asBytes(salt))
    )
    const key = await crypto.subtle.importKey('raw', cred.secret, { name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
    ])
    return crypto.subtle.sign('HMAC', key, input)
  }

  private takeError() {
    const name = this.nextError
    this.nextError = null
    if (name) throw domError(name)
  }

  async create(options: CredentialCreationOptions): Promise<unknown> {
    this.createCalls.push(options)
    this.takeError()
    const pk = options.publicKey!
    for (const ex of this.excludeChecks ? (pk.excludeCredentials ?? []) : []) {
      if (this.credentials.has(bytesToBase64Url(asBytes(ex.id)))) throw domError('InvalidStateError')
    }
    const id = bytesToBase64Url(randomBytes(32))
    this.credentials.set(id, { secret: randomBytes(32) })
    const salt = pk.extensions?.prf?.eval?.first
    const first = this.prf === 'at-create' && salt ? await this.prfOutput(id, salt) : undefined
    const prf = this.prf
    return {
      rawId: base64UrlToBytes(id).buffer,
      response: {},
      getClientExtensionResults: () => ({
        prf: { enabled: prf !== 'none', ...(first ? { results: { first } } : {}) },
      }),
    }
  }

  async get(options: CredentialRequestOptions): Promise<unknown> {
    this.getCalls.push(options)
    this.takeError()
    const pk = options.publicKey!
    const allowed = (pk.allowCredentials ?? []).map((c) => bytesToBase64Url(asBytes(c.id)))
    const held = allowed.filter((id) => this.credentials.has(id))
    if (held.length === 0) throw domError('NotAllowedError')
    const id = this.choose ? this.choose(held) : held[0]
    const prf = pk.extensions?.prf
    const salt = prf?.evalByCredential?.[id]?.first ?? prf?.eval?.first
    const first = this.prf !== 'none' && salt ? await this.prfOutput(id, salt) : undefined
    const authenticatorData = new Uint8Array(37)
    authenticatorData[32] = 0x01 | (this.userVerified ? 0x04 : 0)
    return {
      rawId: base64UrlToBytes(id).buffer,
      response: { authenticatorData: authenticatorData.buffer },
      getClientExtensionResults: () => ({ prf: first ? { results: { first } } : {} }),
    }
  }

  /** Installs this fake as navigator.credentials + PublicKeyCredential. Undo with vi.unstubAllGlobals(). */
  install(): this {
    const capabilities = () => this.capabilities
    const signalled = this.signalled
    class FakePublicKeyCredential {
      static getClientCapabilities?: () => Promise<Record<string, boolean>>
      static signalUnknownCredential(options: { credentialId: string }) {
        signalled.push(options.credentialId)
        return Promise.resolve()
      }
    }
    if (this.capabilities)
      FakePublicKeyCredential.getClientCapabilities = () => Promise.resolve(capabilities()!)
    vi.stubGlobal('PublicKeyCredential', FakePublicKeyCredential)
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: {
        create: (o: CredentialCreationOptions) => this.create(o),
        get: (o: CredentialRequestOptions) => this.get(o),
      },
    })
    return this
  }
}

export function uninstallFakeAuthenticator() {
  vi.unstubAllGlobals()
  Object.defineProperty(navigator, 'credentials', { configurable: true, value: undefined })
}
