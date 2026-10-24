import { expect, test } from './fixtures';

test.describe('landing', () => {
  test('runs the hero sort forward and then genuinely backward', async ({ page }) => {
    await page.goto('/');
    const hero = page.getByRole('figure', { name: /replaying forward and then backward/ });
    await expect(hero.getByText('forward', { exact: true })).toBeVisible();

    // About five seconds a direction; the reverse tag is the claim.
    await expect(hero.getByText('reverse', { exact: true })).toBeVisible({ timeout: 20_000 });
    const readout = hero.locator('span').filter({ hasText: /^\d+ \/ \d+$/ });
    const cursor = async () => Number((await readout.textContent())?.split('/')[0]);
    const first = await cursor();
    // The demo holds at each end before turning, so poll rather than wait a
    // fixed time that may still fall inside the hold.
    await expect.poll(cursor, { timeout: 5_000 }).toBeLessThan(first);
  });

  test('does not autoplay for a reader who asked for reduced motion', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('http://localhost:4173/');
    const hero = page.getByRole('figure', { name: /replaying forward/ });
    const readout = hero.locator('span').filter({ hasText: /^\d+ \/ \d+$/ });
    const before = await readout.textContent();
    await page.waitForTimeout(1_000);
    expect(await readout.textContent()).toBe(before);
    await expect(hero.getByRole('button', { name: 'Play the loop' })).toBeVisible();
    await context.close();
  });

  test('opens each scenario as a configured run', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Watch Quick Sort degrade/ }).click();
    await expect(page).toHaveURL(/algo=quick&size=70&shape=reversed/);
    await expect(page.getByText('Quick Sort · 70 · Reversed · seed 2024')).toBeVisible();

    await page.goBack();
    await page.getByRole('link', { name: /Merge versus Quick/ }).click();
    await expect(page.getByText(/^Delta — /)).toBeVisible();

    await page.goBack();
    await page.getByRole('link', { name: /Search for something absent/ }).click();
    await expect(page.getByRole('button', { name: 'Not in the array' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
