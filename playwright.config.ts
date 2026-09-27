import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests run a real Chrome against the *production build*.
 *
 * The unit suite renders pages in jsdom, which has no Web Worker, no layout,
 * no container queries and no requestAnimationFrame worth the name — so the
 * sandbox that runs user code, the CSS that decides what is visible, and the
 * playback clock are all simulated or stubbed there. These tests are where
 * those are exercised for real, on the minified bundle that actually ships:
 * the IDE stringifies functions into workers, and a minifier is exactly the
 * thing that could break that without any unit test noticing.
 *
 * `channel: 'chrome'` drives the Chrome already installed on the machine (and
 * preinstalled on GitHub's Ubuntu runners) rather than downloading a bundled
 * browser.
 */
export default defineConfig({
  testDir: 'e2e',
  // One worker: the pages drive real animation clocks, and parallel tabs on a
  // small machine turn timing-sensitive checks into load tests.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    // Serves `dist/` — `npm run test:e2e` builds first.
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
