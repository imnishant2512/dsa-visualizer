import { expect, test } from './fixtures';

const DRAFT_KEY = 'dsa-visualizer:ide-sort';

/** Loads the IDE with a given sort as the saved draft — the real Monaco path. */
async function openWithDraft(page: import('@playwright/test').Page, code: string | null) {
  await page.goto('/ide');
  await page.evaluate(
    ([key, value]) => {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    },
    [DRAFT_KEY, code] as const,
  );
  await page.reload();
}

test.describe('code IDE', () => {
  test('renders the bundled editor, served from this site rather than a CDN', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      // blob: and data: URLs are made in the page itself — the recorder's
      // sandbox worker is one — so they are local by construction.
      if (/^(blob|data):/.test(url) || url.startsWith('http://localhost:4173')) return;
      external.push(url);
    });
    await openWithDraft(page, null);
    const editor = page.locator('.monaco-editor');
    await expect(editor).toBeVisible({ timeout: 15_000 });
    await expect(editor).toContainText('customSort');
    // Monaco is bundled, and the only third-party request is the web font.
    expect(external.filter((url) => !url.includes('fonts.g'))).toEqual([]);
  });

  test('records the template in a worker and replays it', async ({ page }) => {
    await openWithDraft(page, null);
    await expect(page.getByText(/^Sorted correctly — [\d,]+ steps\.$/)).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: 'Step forward' }).click();
    await expect(page.getByText(/^Compared a\[0\] \(\d+\) with a\[1\]/)).toBeVisible();
  });

  test('says when a sort does not actually sort', async ({ page }) => {
    await openWithDraft(
      page,
      `function* customSort(ctx) {
        for (let j = 0; j < ctx.length - 1; j++) {
          yield* ctx.compare(j, j + 1);
          if (ctx.at(j) > ctx.at(j + 1)) yield* ctx.swap(j, j + 1);
        }
      }`,
    );
    await page.getByRole('button', { name: 'Record', exact: true }).click();
    await expect(page.getByText(/^Not sorted: a\[\d+\]/)).toBeVisible({ timeout: 15_000 });
  });

  test('stops a sort that loops without yielding, and the tab stays live', async ({ page }) => {
    await openWithDraft(page, 'function* customSort(ctx) {\n  while (true) {}\n}\n');
    await page.getByRole('button', { name: 'Record', exact: true }).click();
    await expect(page.getByText('Recording your sort in a sandboxed worker…')).toBeVisible();

    // The main thread is free while the worker spins: this evaluates
    // immediately rather than after the loop is killed.
    const started = Date.now();
    await page.evaluate(() => 1 + 1);
    expect(Date.now() - started).toBeLessThan(1_000);

    await expect(page.getByText(/Stopped after 5s without finishing/)).toBeVisible({
      timeout: 12_000,
    });
  });

  test('runs JavaScript in the scratchpad and says it stays in the tab', async ({ page }) => {
    await page.goto('/ide');
    await page.getByRole('tab', { name: 'Scratchpad' }).click();
    await expect(page.getByText(/Nothing is uploaded/)).toBeVisible();
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Hello, World!', { timeout: 15_000 });
  });

  test('names wandbox before any code leaves the browser', async ({ page }) => {
    await page.goto('/ide');
    await page.getByRole('tab', { name: 'Scratchpad' }).click();
    await page.getByLabel('Language').selectOption('python');
    await expect(
      page.getByText(/Compiled on wandbox\.org — your code leaves the browser/),
    ).toBeVisible();
  });
});
