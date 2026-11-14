// "Try It in Your Room" checks: the built site served as plain files (the visualiser needs no server code),
// with real WebGL (software rendering), at desktop and phone sizes. Several can run at once on different ports:
//   VIZ_PORT=8901 npx playwright test -c playwright.viz.config.mjs
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.VIZ_PORT || 8899);
const gl = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };

export default defineConfig({
  testDir: 'e2e',
  testMatch: /viz-.*\.spec\.mjs$/,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:' + PORT, trace: 'off', screenshot: 'only-on-failure', launchOptions: gl },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 }, launchOptions: gl } },
    { name: 'phone', use: { ...devices['Pixel 7'], launchOptions: gl } }
  ],
  webServer: { command: 'node scripts/build.mjs && npx --yes http-server@14.1.1 dist -p ' + PORT + ' -a 127.0.0.1 -s -c-1', url: 'http://127.0.0.1:' + PORT + '/visualiser.html', reuseExistingServer: false, timeout: 60_000 }
});
