import { useEffect, useRef } from 'react'

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string
      reset: (widgetId?: string) => void
    }
  }
}

let scriptPromise: Promise<void> | null = null

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    document.head.appendChild(script)
  })
  return scriptPromise
}

interface TurnstileWidgetProps {
  onToken: (token: string | null) => void
}

// Renders nothing (and callers should treat the CAPTCHA as not required) if
// no site key is configured, so local dev without Cloudflare set up still
// works — mirrors how supabaseClient.ts tolerates missing env vars.
export function TurnstileWidget({ onToken }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!SITE_KEY) return
    let cancelled = false

    loadTurnstileScript().then(() => {
      if (cancelled || !containerRef.current || !window.turnstile) return
      window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        callback: (token: string) => onToken(token),
        'expired-callback': () => onToken(null),
        'error-callback': () => onToken(null),
      })
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!SITE_KEY) return null
  return <div ref={containerRef} />
}

export const TURNSTILE_ENABLED = Boolean(SITE_KEY)
