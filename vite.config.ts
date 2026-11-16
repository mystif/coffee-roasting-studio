import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Roasting Mac runs macOS Big Sur → Chrome 138 is the last available version.
// Web Serial over Bluetooth RFCOMM needs Chrome 117+.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // never reload on its own – an update must not interrupt a roast
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Coffee Roasting Studio',
        short_name: 'Roasting',
        description: 'Monitorování a záznam pražení kávy',
        theme_color: '#16171d',
        background_color: '#16171d',
        display: 'standalone',
        lang: 'cs',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,ico,png,woff2}'] },
    }),
  ],
  build: { target: 'chrome117' },
})
