import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Roasting Mac runs macOS Big Sur → Chrome 138 is the last available version.
// Web Serial over Bluetooth RFCOMM needs Chrome 117+.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: { target: 'chrome117' },
})
