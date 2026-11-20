// Supabase Edge Function `ocm-stations` (Deno): Open Charge Map stations for
// any area, through a shared tile cache (specs/ocm-proxy.md). Deploy with
//   npx supabase functions deploy ocm-stations --no-verify-jwt
// (config.toml also sets verify_jwt = false: anyone may call it, the car and
// signed-out visitors included; the rate limits live in migration 0047).
// All logic lives in ../_shared/ocmStations.ts; this file only wires the
// environment. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by
// Supabase; OCM_API_KEY (and optionally OCM_ALLOWED_ORIGINS) are function
// secrets set by the owner (`npx supabase secrets set OCM_API_KEY=...`).
// Nothing secret is stored in the repository.
import { handleOcmStations, parseAllowedOrigins, type RpcResult } from '../_shared/ocmStations.ts'

const url = Deno.env.get('SUPABASE_URL') ?? ''
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ocmKey = (Deno.env.get('OCM_API_KEY') ?? '').trim()
const allowedOrigins = parseAllowedOrigins(Deno.env.get('OCM_ALLOWED_ORIGINS'))

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
  handleOcmStations(req, {
    rpc,
    fetch: (u: string, init: RequestInit) => fetch(u, init),
    now: () => Date.now(),
    ocmKey,
    clientSecret: serviceKey,
    allowedOrigins,
    log: (m: string) => console.error(m),
  })
)
