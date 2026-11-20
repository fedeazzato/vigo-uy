// Supabase Edge Function `car-device` (Deno): the signed device endpoint of
// the car link (specs/car-link-phase0.md R2). Deploy with
//   npx supabase functions deploy car-device --no-verify-jwt
// (config.toml also sets verify_jwt = false: the car authenticates with its
// ECDSA P-256 signature, not with a JWT). All logic lives in
// ../_shared/carDevice.ts; this file only wires the service-role database
// access. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by
// Supabase; nothing secret is stored in the repository.
import { handleCarDevice, type RpcResult } from '../_shared/carDevice.ts'

const url = Deno.env.get('SUPABASE_URL') ?? ''
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// Legacy service_role keys are JWTs (also sent as Bearer); the newer secret
// keys (sb_secret_...) are not and travel in `apikey` only.
const isJwt = (k: string) => k.startsWith('eyJ') && k.split('.').length === 3

async function rpc(fn: string, args: Record<string, unknown>): Promise<RpcResult> {
  if (!url || !serviceKey) return { data: null, error: 'missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }
  const headers: Record<string, string> = {
    apikey: serviceKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  if (isJwt(serviceKey)) headers.Authorization = `Bearer ${serviceKey}`
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) })
  const text = await res.text()
  if (!res.ok) return { data: null, error: `${res.status} ${text.slice(0, 300)}` }
  try {
    return { data: text ? JSON.parse(text) : null, error: null }
  } catch {
    return { data: null, error: 'invalid JSON from PostgREST' }
  }
}

Deno.serve((req: Request) =>
  handleCarDevice(req, { rpc, now: () => Date.now(), log: (m: string) => console.error(m) })
)
