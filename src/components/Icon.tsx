import type { ReactNode } from 'react'

// Line icons drawn for WikiVigo in the head unit's icon style (thin rounded
// strokes in one colour, grey -> white when selected): 24-unit grid, 2-unit
// stroke, round caps and joins, `currentColor`. Our own drawings, not copies
// of the car's (firmware) icons or of an icon font (specs/stock-head-unit-look.md R6).
const GLYPHS = {
  home: (
    <>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 9.5V20h12V9.5" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  community: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 19c0-3.3 2.7-5 6-5s6 1.7 6 5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M17.5 14c2.2.2 3.5 1.6 3.5 4" />
    </>
  ),
  activity: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </>
  ),
  car: (
    <>
      <path d="M3 17v-4l2.2-5.1A1.5 1.5 0 0 1 6.6 7h10.8a1.5 1.5 0 0 1 1.4.9L21 13v4" />
      <path d="M3 13h18M3 17h2.5M9.5 17h5M18.5 17H21" />
      <circle cx="7.5" cy="17" r="2" />
      <circle cx="16.5" cy="17" r="2" />
    </>
  ),
  spec: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 3h6v3H9z" />
      <path d="M9 11h6M9 15h6" />
    </>
  ),
  charge: <path d="M13 2 5 14h6l-1 8 8-12h-6l1-8z" />,
  route: (
    <>
      <path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z" />
      <path d="M9 4v13.5M15 6.5V20" />
    </>
  ),
  // Compass: the trip planner (its pages use 🧭), distinct from Rutas' map.
  planner: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" />
    </>
  ),
  costs: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M14.8 9.4c-.5-.9-1.5-1.4-2.8-1.4-1.6 0-2.8.8-2.8 2s1.2 1.6 2.8 2 2.8.8 2.8 2-1.2 2-2.8 2c-1.3 0-2.4-.5-2.9-1.4M12 6.5V8M12 16v1.5" />
    </>
  ),
  maintenance: (
    <>
      <circle cx="16" cy="8" r="4" />
      <path d="M13.2 10.8 4.5 19.5" />
      <path d="M14.5 6.5 17.5 9.5" />
    </>
  ),
  parts: (
    <>
      <path d="m12 3 7.8 4.5v9L12 21l-7.8-4.5v-9z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  accessories: (
    <>
      <path d="M5 8h14l-1.2 13H6.2z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
    </>
  ),
  tech: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  faq: (
    <>
      <path d="M4 5h16v11H9.5L4 20z" />
      <path d="M10 8.6a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6 1M12 13.5v.01" />
    </>
  ),
  shield: <path d="M12 3 20 6v6c0 4.8-3.4 8-8 9-4.6-1-8-4.2-8-9V6z" />,
  bell: (
    <>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.6-4.6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  guide: (
    <>
      <path d="M3 5.5c3-1.2 6-1 9 1 3-2 6-2.2 9-1v13c-3-1.2-6-1-9 1-3-2-6-2.2-9-1z" />
      <path d="M12 6.5v13" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />,
  chat: (
    <>
      <path d="M4 5h16v11H9.5L4 20z" />
      <path d="M8 9h8M8 12h5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-3.9 3.6-6 8-6s8 2.1 8 6" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  warning: (
    <>
      <path d="M12 4 2.8 20h18.4z" />
      <path d="M12 10v4.5M12 17.2v.01" />
    </>
  ),
  danger: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.2v.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.8v.01" />
    </>
  ),
  success: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.2 2.8 2.8L16 9.5" />
    </>
  ),
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof GLYPHS

interface IconProps {
  name: IconName
  size?: number
  className?: string
}

// Always decorative: the control or text next to it carries the meaning.
export function Icon({ name, size = 20, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {GLYPHS[name]}
    </svg>
  )
}
