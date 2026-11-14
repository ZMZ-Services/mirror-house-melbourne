// End-to-end: the real site and Functions under `netlify dev`, a local Postgres, and stand-ins for Square,
// Netlify Identity and Resend (e2e/mock-services.mjs). Desktop and phone widths.
import { defineConfig, devices } from '@playwright/test';
import { E2E_DB, MOCK, SITE } from './e2e/env.mjs';

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.mjs',
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: { baseURL: SITE, trace: 'off', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } }
  ],
  webServer: [
    { command: 'node e2e/mock-services.mjs', url: MOCK + '/square.js', reuseExistingServer: false, timeout: 20_000 },
    {
      command: 'node scripts/build.mjs && env -u NODE_OPTIONS npx netlify dev --offline --port 8888',
      url: SITE + '/index.html', reuseExistingServer: false, timeout: 120_000,
      env: {
        DATABASE_URL: E2E_DB, NETLIFY_TELEMETRY_DISABLED: '1', MH_TRACK_ALL: '1',
        SQUARE_ACCESS_TOKEN: 'test-square-token', SQUARE_LOCATION_ID: 'LTEST', SQUARE_APPLICATION_ID: 'sandbox-sq0idb-e2e', SQUARE_ENVIRONMENT: 'sandbox',
        SQUARE_API_BASE: MOCK + '/square', SQUARE_SDK_URL: MOCK + '/square.js',
        MH_IDENTITY_URL: MOCK + '/identity',
        RESEND_API_KEY: 'test-resend-key', RESEND_API_BASE: MOCK + '/resend', ADMIN_EMAIL: 'debbie@example.com'
      }
    }
  ]
});
