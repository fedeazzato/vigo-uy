import { describe, expect, it } from 'vitest'
import { parseReleaseText, parseSpans } from './releaseText'

describe('releaseText (the Markdown of the release notes)', () => {
  it('reads headings, nested lists, wrapped lines and paragraphs', () => {
    const blocks = parseReleaseText(
      '\r\n## Qué cambia\r\n- **Carga 0.26**\r\n  - Corrige la energía\r\n    de las cargas.\r\n  - Otra.\r\n- **Mi Vigo**\r\n\r\n## Canal\r\nBeta (solo autos\r\nde prueba).\r\n'
    )
    expect(blocks).toEqual([
      { kind: 'heading', text: 'Qué cambia' },
      {
        kind: 'list',
        items: [
          {
            text: '**Carga 0.26**',
            items: [
              { text: 'Corrige la energía de las cargas.', items: [] },
              { text: 'Otra.', items: [] },
            ],
          },
          { text: '**Mi Vigo**', items: [] },
        ],
      },
      { kind: 'heading', text: 'Canal' },
      { kind: 'paragraph', text: 'Beta (solo autos de prueba).' },
    ])
  })

  it('marks bold and code, shows a link as its text and never keeps HTML as markup', () => {
    expect(parseSpans('En **Mi Vigo** usá `P` y [la guía](https://x.test/a) <b>')).toEqual([
      { kind: 'text', text: 'En ' },
      { kind: 'bold', text: 'Mi Vigo' },
      { kind: 'text', text: ' usá ' },
      { kind: 'code', text: 'P' },
      { kind: 'text', text: ' y la guía <b>' },
    ])
  })
})
