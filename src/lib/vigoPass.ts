// Engineering-menu codes for the Vigo head unit (specs/prepare-my-vigo.md). Same algorithm as vigo-hack/vigo_pass.ts, itself a
// reimplementation of the public github.com/akokarev/vigo_pass_root. Runs in the browser only: the PDSN never leaves the page.

const SALT = 'E13S31NMP5DfCs24'

/** Fixed code of the hidden ADB switch prompt (same on every car of the platform). */
export const MASTER_CODE = 'DfCs0715#!'

/** Whitespace removed; case kept (the hash uses the exact characters). */
export function normalizePdsn(raw: string): string {
  return raw.replace(/\s+/g, '')
}

export function isValidPdsn(pdsn: string): boolean {
  return /^[A-Za-z0-9]{6,40}$/.test(pdsn)
}

function interleave(a: string, b: string): string {
  let mix = ''
  const max = Math.max(a.length, b.length)
  for (let i = 0; i < max; i++) {
    if (i < a.length) mix += a[i]
    if (i < b.length) mix += b[i]
  }
  return mix
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Factory code (menu-entry prompt) for a normalized PDSN. */
export async function factoryCode(pdsn: string): Promise<string> {
  const h2 = await sha256Hex(await sha256Hex(interleave(pdsn, SALT)))
  return 'DfCs' + h2.slice(0, 8) + '#!'
}
