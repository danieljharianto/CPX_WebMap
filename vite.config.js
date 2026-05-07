import { defineConfig } from 'vite'

export default defineConfig({
  base: '/PX_WebMap/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: { dashboard: 'dashboard.html' }
    }
  }
})
