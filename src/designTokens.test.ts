// Guards for the head-unit design system (specs/stock-head-unit-look.md):
// both themes define the same role tokens, nothing references the retired
// colour scales or undefined tokens, the shape rules hold, and every
// text/background pair of the palette meets WCAG AA in both themes.
import { describe, it, expect } from 'vitest'
import indexCss from './index.css?raw'

// Every source file under src/, as text (this file excluded: it names the
// retired tokens on purpose).
const SOURCES = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('./**/*.{css,ts,tsx}', { query: '?raw', import: 'default', eager: true })
  ).filter(([path]) => path !== './designTokens.test.ts')
)
const CSS_SOURCES = Object.entries(SOURCES).filter(([path]) => path.endsWith('.css'))

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

function block(selectorPattern: RegExp): Record<string, string> {
  const match = selectorPattern.exec(stripComments(indexCss))
  if (!match) throw new Error(`theme block not found: ${String(selectorPattern)}`)
  const tokens: Record<string, string> = {}
  for (const [, name, value] of match[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    tokens[name] = value.trim()
  }
  return tokens
}

const LIGHT = block(/:root,\s*\[data-theme='light'\]\s*\{([^}]*)\}/)
const DARK = block(/\[data-theme='dark'\]\s*\{([^}]*)\}/)
const THEMES = { light: LIGHT, dark: DARK }

// The roles of R1 that components rely on.
const ROLES = [
  '--surface-secondary',
  '--surface',
  '--fill-secondary',
  '--fill-selected',
  '--fill-hover',
  '--selected-bg',
  '--text-title',
  '--text-primary',
  '--text-secondary',
  '--text-on-fill-selected',
  '--accent',
  '--accent-text',
  '--accent-fill',
  '--btn-primary-bg',
  '--btn-primary-text',
  '--btn-secondary-bg',
  '--btn-secondary-text',
  '--switch-off',
  '--border',
  '--border-strong',
  '--divider-page',
  '--card-border',
  '--warning',
  '--warning-text',
  '--danger',
  '--danger-text',
  '--success',
  '--success-text',
  '--scrim',
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-axis',
  '--chart-value',
]

describe('theme tokens', () => {
  it('defines the same token set for car day (light) and car night (dark)', () => {
    expect(Object.keys(DARK).sort()).toEqual(Object.keys(LIGHT).sort())
  })

  it('defines every role token in both themes', () => {
    for (const role of ROLES) {
      expect(LIGHT, `light ${role}`).toHaveProperty(role)
      expect(DARK, `dark ${role}`).toHaveProperty(role)
    }
  })

  it('uses the car night values for the main roles', () => {
    expect(DARK['--surface-secondary']).toBe('#000000')
    expect(DARK['--surface']).toBe('#1a1a1a')
    expect(DARK['--fill-secondary']).toBe('#242424')
    expect(DARK['--fill-selected']).toBe('#3d3d3d')
    expect(DARK['--text-primary']).toBe('#dbdbdb')
    expect(DARK['--accent']).toBe('#e0a876')
  })

  it('uses the car day values for the main roles', () => {
    expect(LIGHT['--surface-secondary']).toBe('#f7f7f7')
    expect(LIGHT['--surface']).toBe('#ffffff')
    expect(LIGHT['--fill-secondary']).toBe('#f1efec')
    expect(LIGHT['--text-primary']).toBe('#614d40')
    expect(LIGHT['--accent']).toBe('#af7d5f')
    expect(LIGHT['--btn-primary-bg']).toBe('#c39f84')
  })

  it('collapses every radius token to the car 4 px', () => {
    for (const name of ['--radius-sm', '--radius-md', '--radius-lg', '--radius-xl']) {
      expect(indexCss).toMatch(new RegExp(`${name}:\\s*4px;`))
    }
  })
})

describe('token usage across src/', () => {
  it('no longer references the retired colour scales (--green-*, --blue-*, ...)', () => {
    const retired = /--(green|blue|amber|red|gray)-\d/
    for (const [path, text] of Object.entries(SOURCES)) {
      expect(retired.test(text), path).toBe(false)
    }
    expect(retired.test(indexCss)).toBe(false)
  })

  it('references only custom properties that are defined somewhere', () => {
    const defined = new Set<string>()
    for (const text of [indexCss, ...CSS_SOURCES.map(([, t]) => t)]) {
      for (const [, name] of stripComments(text).matchAll(/(--[a-z0-9-]+)\s*:/g)) defined.add(name)
    }
    for (const [path, text] of Object.entries(SOURCES)) {
      for (const [, name] of text.matchAll(/var\((--[a-z0-9-]+)/g)) {
        expect(defined.has(name), `${path} uses undefined ${name}`).toBe(true)
      }
    }
  })

  it('has no shadows and no display font', () => {
    for (const [path, text] of CSS_SOURCES) {
      const css = stripComments(text)
      expect(/box-shadow\s*:(?!\s*none)/.test(css), `${path} box-shadow`).toBe(false)
      expect(css.includes('--font-display'), `${path} --font-display`).toBe(false)
    }
    expect(indexCss).not.toMatch(/Inter|Space Grotesk/)
  })
})

// ── WCAG contrast ──

type Rgba = [number, number, number, number]

function parseColor(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]
  }
  const rgba = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/.exec(value)
  if (rgba) return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), rgba[4] ? Number(rgba[4]) : 1]
  throw new Error(`unsupported colour: ${value}`)
}

// A translucent colour as it renders over an opaque one.
function over(top: Rgba, base: Rgba): Rgba {
  const a = top[3]
  return [0, 1, 2].map((i) => top[i] * a + base[i] * (1 - a)).concat(1) as Rgba
}

function luminance([r, g, b]: Rgba): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// [foreground, background, background-under-a-translucent-background?]
type Pair = [string, string] | [string, string, string]

// Body text (>= 4.5:1): every place a text role sits on a surface role.
const TEXT_PAIRS: Pair[] = [
  ['--text-title', '--surface'],
  ['--text-title', '--surface-secondary'],
  ['--text-title', '--selected-bg', '--surface-secondary'], // selected rail tab
  ['--text-title', '--selected-bg', '--surface'], // open FAQ row
  ['--text-primary', '--surface'],
  ['--text-primary', '--surface-secondary'],
  ['--text-primary', '--fill-secondary'],
  ['--text-primary', '--fill-hover'],
  ['--text-secondary', '--surface'],
  ['--text-secondary', '--surface-secondary'],
  ['--text-secondary', '--fill-secondary'],
  ['--accent-text', '--surface'],
  ['--accent-text', '--surface-secondary'],
  ['--text-on-fill-selected', '--fill-selected'],
  ['--btn-primary-text', '--btn-primary-bg'],
  ['--btn-secondary-text', '--btn-secondary-bg'],
  ['--danger-text', '--fill-secondary'], // danger button
  ['--warning-text', '--surface'],
  ['--warning-text', '--surface-secondary'],
  ['--danger-text', '--surface'],
  ['--danger-text', '--surface-secondary'],
  ['--success-text', '--surface'],
  ['--success-text', '--surface-secondary'],
  ['--chart-value', '--surface'],
]

// UI marks (>= 3:1): focus ring, selected-tab line, switch on, status bars
// and badge dots, chart series.
const MARK_PAIRS: Pair[] = [
  ['--accent', '--surface'],
  ['--accent', '--surface-secondary'],
  ['--accent', '--fill-secondary'],
  ['--warning', '--surface'],
  ['--warning', '--fill-secondary'],
  ['--danger', '--surface'],
  ['--danger', '--fill-secondary'],
  ['--success', '--surface'],
  ['--success', '--fill-secondary'],
  ['--chart-1', '--surface'],
  ['--chart-2', '--surface'],
]

function ratio(tokens: Record<string, string>, [fg, bg, base]: Pair): number {
  const background = base ? over(parseColor(tokens[bg]), parseColor(tokens[base])) : parseColor(tokens[bg])
  return contrast(parseColor(tokens[fg]), background)
}

describe('WCAG contrast of the palette', () => {
  it('computes known reference ratios', () => {
    expect(contrast(parseColor('#000000'), parseColor('#ffffff'))).toBeCloseTo(21, 5)
    expect(contrast(parseColor('#777777'), parseColor('#ffffff'))).toBeCloseTo(4.48, 2)
  })

  for (const [theme, tokens] of Object.entries(THEMES)) {
    it(`${theme}: body text pairs reach 4.5:1`, () => {
      for (const pair of TEXT_PAIRS) {
        expect(ratio(tokens, pair), `${theme} ${pair.join(' on ')}`).toBeGreaterThanOrEqual(4.5)
      }
    })

    it(`${theme}: UI marks reach 3:1`, () => {
      for (const pair of MARK_PAIRS) {
        expect(ratio(tokens, pair), `${theme} ${pair.join(' on ')}`).toBeGreaterThanOrEqual(3)
      }
    })
  }
})
