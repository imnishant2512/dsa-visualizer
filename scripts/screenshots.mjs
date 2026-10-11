/**
 * Regenerates the README screenshots and the link-preview image from the
 * production build, so they never drift from what the site actually looks
 * like.
 *
 *   npm run build && npm run screenshots
 *
 * Every capture is seeded and scrubbed to a fixed fraction of its run, so the
 * output is the same on every machine.
 */
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const PORT = 4174;
const BASE = `http://localhost:${PORT}`;

/** Drags a run's scrub slider to a fraction of the way through. */
async function scrubTo(page, fraction, nth = 0) {
  const slider = page.getByRole('slider', { name: 'Scrub through the run' }).nth(nth);
  const max = Number(await slider.getAttribute('max'));
  await slider.fill(String(Math.round(max * fraction)));
}

const SHOTS = [
  {
    file: 'img/sorting-race.jpg',
    async setup(page) {
      await page.goto('/sorting?algo=quick&size=40&shape=random&seed=2024&vs=merge');
      await scrubTo(page, 0.42);
    },
  },
  {
    file: 'img/pathfinding.jpg',
    async setup(page) {
      await page.goto('/pathfinding');
      await page.getByRole('button', { name: 'Edit' }).click();
      await page.getByLabel('Algorithm').selectOption('astar');
      await page.getByRole('button', { name: 'Rooms & doors' }).click();
      await scrubTo(page, 0.6);
    },
  },
  {
    file: 'img/trees.jpg',
    async setup(page) {
      await page.goto('/trees');
      await page.getByRole('button', { name: 'In-order' }).click();
      const pause = page.getByRole('button', { name: 'Pause' });
      if (await pause.isVisible()) await pause.click();
      await scrubTo(page, 0.55);
    },
  },
  {
    file: 'public/og-image.png',
    viewport: { width: 1200, height: 630 },
    async setup(page) {
      await page.goto('/');
      // Let the hero's bubble sort get under way.
      await page.waitForTimeout(2500);
    },
  },
];

const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'warn' });
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const shot of SHOTS) {
    const page = await browser.newPage({
      baseURL: BASE,
      viewport: shot.viewport ?? { width: 1440, height: 900 },
      reducedMotion: shot.viewport ? 'no-preference' : 'reduce',
    });
    await shot.setup(page);
    await page.getByRole('heading', { level: 1 }).waitFor();
    // Drop the focus ring the scrub left on the slider.
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.waitForTimeout(400);
    const jpeg = shot.file.endsWith('.jpg');
    await page.screenshot({
      path: shot.file,
      type: jpeg ? 'jpeg' : 'png',
      quality: jpeg ? 82 : undefined,
    });
    await page.close();
    console.log(`wrote ${shot.file}`);
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
