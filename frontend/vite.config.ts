import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/',
  resolve: {
    alias: {
      // Fix: Vite 8 Rolldown can't resolve @pixi/* sub-packages from pixi.js v7
      '@pixi/core': path.resolve(__dirname, 'node_modules/pixi.js/node_modules/@pixi/core'),
      '@pixi/display': path.resolve(__dirname, 'node_modules/pixi.js/node_modules/@pixi/display'),
    },
  },
  build: {
    outDir: '../frontend-dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
    },
  },
})
