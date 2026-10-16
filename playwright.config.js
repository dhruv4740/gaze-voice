import { defineConfig } from '@playwright/test';

// Own ports so a running `npm run phone` (5173 / 8787) is never touched.
const APP = 5190;
const RELAY = 8795;
export default defineConfig({
  testDir: 'e2e',
  timeout: 45000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${APP}`,
    viewport: { width: 1366, height: 768 },
    launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
    permissions: ['camera', 'microphone'],
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command: `npx vite --host 127.0.0.1 --port ${APP} --strictPort`,
      port: APP,
      reuseExistingServer: false,
      // a dummy key sends replies to the (mocked) Groq endpoint instead of the offline fallback
      env: { VITE_GROQ_API_KEY: 'test-key', VITE_GEMINI_API_KEY: 'test-key' },
    },
    { command: 'node server/relay.js', port: RELAY, reuseExistingServer: false, env: { PORT: String(RELAY) } },
  ],
});
