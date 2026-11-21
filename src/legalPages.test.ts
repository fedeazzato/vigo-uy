// specs/legal-pages-dashcam.md: the static pages Google's consent screen links to.
import { describe, expect, it } from 'vitest'
import indexHtml from '../public/legal/dashcam/index.html?raw'
import privacyHtml from '../public/legal/dashcam/privacidad.html?raw'
import termsHtml from '../public/legal/dashcam/terminos.html?raw'
import viteConfig from '../vite.config.ts?raw'

const pages: [string, string][] = [
  ['index.html', indexHtml],
  ['privacidad.html', privacyHtml],
  ['terminos.html', termsHtml],
]

describe('legal pages for the Vigo Dashcam Google client', () => {
  it.each(pages)('%s is a plain Spanish HTML page readable without JavaScript', (_name, html) => {
    expect(html).toContain('<html lang="es">')
    expect(html).toMatch(/<title>[^<]+<\/title>/)
    expect(html).toContain('name="viewport"')
    expect(html).not.toContain('<script')
    expect(html).toContain('https://github.com/fedeazzato/vigo-uy/issues')
  })

  it('home page links to the privacy policy and the terms', () => {
    expect(indexHtml).toContain('href="privacidad.html"')
    expect(indexHtml).toContain('href="terminos.html"')
    expect(indexHtml).toContain('drive.file')
  })

  it('privacy policy names the scope, the Limited Use disclosure and how to revoke', () => {
    expect(privacyHtml).toContain('https://www.googleapis.com/auth/drive.file')
    expect(privacyHtml).toContain('incluidos los requisitos de Uso Limitado')
    expect(privacyHtml).toContain('https://developers.google.com/terms/api-services-user-data-policy')
    expect(privacyHtml).toContain('https://myaccount.google.com/permissions')
  })

  it('terms state no warranty and the governing law', () => {
    expect(termsHtml).toContain('Sin garantía')
    expect(termsHtml).toContain('República Oriental del Uruguay')
  })

  it('the service worker never serves the SPA shell for /legal/', () => {
    expect(viteConfig).toContain('navigateFallbackDenylist: [/\\/legal\\//]')
  })
})
