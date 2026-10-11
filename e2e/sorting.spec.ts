import { counter, expect, seekToEnd, test } from './fixtures';

test.describe('sorting', () => {
  test('plays a run to the end on the real clock and judges it', async ({ page }) => {
    await page.goto('/sorting?algo=insertion&size=20&shape=nearly-sorted&seed=11');
    await page.getByRole('button', { name: '4×' }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();

    await expect(page.getByRole('button', { name: 'Replay' })).toBeVisible({ timeout: 20_000 });
    const { at, total } = await counter(page);
    expect(at).toBe(total);
    // Insertion sort on nearly-sorted input is the textbook case of beating
    // its own quadratic bound.
    await expect(page.getByText(/Beat the bound — \d+% fewer comparisons/)).toBeVisible();
  });

  test('steps backwards to exactly where it started', async ({ page }) => {
    await page.goto('/sorting?algo=bubble&size=10&shape=random&seed=5');
    const bars = page.locator('[class*="_bar_"]');
    const before = await bars.evaluateAll((els) => els.map((e) => (e as HTMLElement).style.height));

    for (let i = 0; i < 12; i++) await page.getByRole('button', { name: 'Step forward' }).click();
    expect((await counter(page)).at).toBe(12);
    for (let i = 0; i < 12; i++) await page.getByRole('button', { name: 'Step back' }).click();

    expect((await counter(page)).at).toBe(0);
    const after = await bars.evaluateAll((els) => els.map((e) => (e as HTMLElement).style.height));
    expect(after).toEqual(before);
  });

  test('keeps the run in the URL, so a reload reproduces it', async ({ page }) => {
    await page.goto('/sorting?algo=merge&size=30&shape=reversed&seed=77');
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByRole('button', { name: 'Few unique' }).click();
    const summary = await page.getByText(/^Merge Sort · 30 · Few unique · seed \d+$/).textContent();

    await page.reload();
    await expect(page.getByText(summary ?? '', { exact: true })).toBeVisible();
  });

  test('picks an algorithm from the family picker', async ({ page }) => {
    await page.goto('/sorting?algo=quick&size=20&seed=1');
    await page.getByRole('button', { name: /^Change — 17 in 7 families$/ }).click();
    await page.getByRole('button', { name: /^Heap Sort/ }).click();
    await expect(page).toHaveURL(/algo=heap/);
    await expect(page.getByText(/^Heap Sort · 20 ·/)).toBeVisible();
  });

  test('keeps race mode level: both runs at the same fraction of themselves', async ({ page }) => {
    await page.goto('/sorting?algo=bubble&size=24&shape=random&seed=4&vs=merge');
    const slider = page.getByRole('slider', { name: 'Scrub through the run' });
    const max = Number(await slider.getAttribute('max'));
    await slider.fill(String(Math.floor(max / 2)));

    const progress = await page
      .locator('span')
      .filter({ hasText: /^[\d,]+ \/ [\d,]+ steps$/ })
      .allTextContents();
    expect(progress).toHaveLength(2);
    for (const text of progress) {
      const [done, total] = text.replace(/,|steps/g, '').split('/').map(Number);
      expect(done / total).toBeGreaterThan(0.45);
      expect(done / total).toBeLessThan(0.55);
    }

    await seekToEnd(page);
    await expect(page.getByText(/won on array accesses|Dead heat/)).toBeVisible();
  });
});
