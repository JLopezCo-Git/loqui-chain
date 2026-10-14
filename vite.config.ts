import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'favicon-32x32.png', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Cadena',
        short_name: 'Cadena',
        description: 'Administración de cadenas de ahorro LoQui',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#2563eb',
        background_color: '#0d111a',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // No cachear llamadas al backend: la app es online-first.
        navigateFallbackDenylist: [/^\/api/],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
})
