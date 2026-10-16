import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// two pages: the patient app and the caregiver phone page
export default defineConfig({
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
