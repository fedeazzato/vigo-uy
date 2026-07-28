import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Wiki Vigo Uruguay',
        short_name: 'Vigo Wiki',
        lang: 'es',
        description: 'Wiki de la comunidad Amantes de la Vigo Uruguay — guía colaborativa de carga, rutas, costos y accesorios.',
        theme_color: '#1D9E75',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,jpeg,ico,woff2}'],
        runtimeCaching: [
          {
            // Auth/session and community data must always hit the network —
            // never served stale from the offline cache.
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  base: '/vigo-uy/',
  build: {
    rollupOptions: {
      output: {
        // React/react-dom/react-router-dom and @supabase/supabase-js
        // together make up most of what's left in the main chunk after
        // route-level code splitting (specs/route-code-splitting.md) --
        // they're needed on every page (auth/profile sync runs on mount
        // regardless of route), so splitting them out doesn't shrink the
        // initial payload, but it separates code that changes on nearly
        // every deploy (our app) from code that doesn't (vendor deps), so
        // a typical deploy no longer forces a re-download of either.
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (/[\\/](react|react-dom|react-router-dom|scheduler)[\\/]/.test(id)) return 'vendor-react'
            if (id.includes('@supabase')) return 'vendor-supabase'
          }
        },
      },
    },
  },
})
