import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Logo is already present in public/logo.jpg. No external copy needed during build.

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()]
})
