import { test as base, expect, type Page } from '@playwright/test';

/**
 * Every test fails if the page throws or logs an error.
 *
 * A broken effect, a bad key, a failed worker boot — most of what goes wrong
 * in a React app goes wrong quietly, as a console error while the page still
 * renders something. Collecting them across every flow turns "it looked fine"
 * into a checked claim.
 */
export const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(`console: ${message.text()}`);
      });
      await use(errors);
      expect(errors, 'the page logged errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Jumps a run to its last step through the scrub slider, as a reader would. */
export async function seekToEnd(page: Page) {
  const slider = page.getByRole('slider', { name: 'Scrub through the run' });
  const max = await slider.getAttribute('max');
  await slider.fill(max ?? '0');
}

/** The run bar's "N / total" counter, as numbers. */
export async function counter(page: Page): Promise<{ at: number; total: number }> {
  const text =
    (await page
      .locator('span')
      .filter({ hasText: /^[\d,]+ \/ [\d,]+$/ })
      .first()
      .textContent()) ?? '';
  const [at, total] = text
    .replace(/,/g, '')
    .split('/')
    .map((part) => Number(part.trim()));
  return { at, total };
}
