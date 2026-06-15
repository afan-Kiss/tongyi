import { defineConfig } from 'vite'

import react from '@vitejs/plugin-react'

import path from 'node:path'



const API_TARGET = 'http://127.0.0.1:4725'

const XIANGYU_TARGET = 'http://127.0.0.1:4726'



export default defineConfig({

  base: '/',

  plugins: [react()],

  resolve: {

    alias: { '@': path.resolve(__dirname, 'src') },

  },

  server: {

    port: 5173,

    proxy: {

      '/api/v1': { target: API_TARGET, changeOrigin: true },

      '/api': { target: XIANGYU_TARGET, changeOrigin: true },

      '/xiangyu-proxy': { target: API_TARGET, changeOrigin: true },

      '/css': { target: XIANGYU_TARGET, changeOrigin: true },

      '/js': { target: XIANGYU_TARGET, changeOrigin: true },

    },

  },

  build: { outDir: 'dist', emptyOutDir: true },

})

