import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// two pages: the patient app and the caregiver phone page
const relay = { '/relay': { target: `http://127.0.0.1:${process.env.RELAY_PORT || 8787}`, ws: true } }; // also serves /relay-info
const hosts = ['.trycloudflare.com']; // Vite 6 blocks unknown Host headers

export default defineConfig({
  server: { proxy: relay, allowedHosts: hosts },
  preview: { proxy: relay, allowedHosts: hosts },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        caregiver: resolve(import.meta.dirname, 'caregiver.html'),
        landing: resolve(import.meta.dirname, 'landing.html'),
      },
    },
  },
});
