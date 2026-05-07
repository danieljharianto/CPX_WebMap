import { defineConfig } from 'vite'

export default defineConfig({
  base: '/', // penting untuk Vercel
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        index: 'index.html',
        dashboard: 'dashboard.html'
      }
    }
  }
})
