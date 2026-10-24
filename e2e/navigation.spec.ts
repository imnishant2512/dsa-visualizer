import { expect, test } from './fixtures';

const ROUTES: Array<{ path: string; nav: string; heading: RegExp }> = [
  { path: '/sorting', nav: 'Sorting', heading: /^Sorting$/ },
  { path: '/searching', nav: 'Searching', heading: /^Searching$/ },
  { path: '/pathfinding', nav: 'Pathfinding', heading: /^Pathfinding$/ },
  { path: '/linear/array', nav: 'Linear', heading: /^Linear structures$/ },
  { path: '/trees', nav: 'Trees', heading: /^Trees$/ },
  { path: '/hashtables', nav: 'Hash tables', heading: /^Hash tables$/ },
  { path: '/graphs', nav: 'Graphs', heading: /^Graphs$/ },
  { path: '/ide', nav: 'Code IDE', heading: /^Code IDE$/ },
];

test.describe('navigation', () => {
  for (const route of ROUTES) {
    test(`${route.path} loads directly, with one heading and its nav cell lit`, async ({
      page,
    }) => {
      // A direct load, not a client-side hop: this is what a shared link does,
      // and it is the path that depends on the server rewriting to index.html.
      await page.goto(route.path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(route.heading);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.getByRole('link', { name: route.nav, exact: true })).toHaveClass(
        /active/,
      );
    });
  }

  test('moves between every domain from the nav without a reload', async ({ page }) => {
    await page.goto('/');
    for (const route of ROUTES) {
      await page.getByRole('link', { name: route.nav, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${route.path}`));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(route.heading);
    }
  });

  test('keeps a sub-route when reloaded', async ({ page }) => {
    await page.goto('/linear/stack');
    await page.reload();
    await expect(page.getByRole('link', { name: 'Stack', exact: true })).toHaveClass(/active/i);
    // The top nav links to /linear/array; it must still read as "you are in
    // Linear" on any of its tabs.
    await expect(page.getByRole('link', { name: 'Linear', exact: true })).toHaveClass(/active/);
  });

  test('says so when a link is wrong, instead of quietly showing the homepage', async ({
    page,
  }) => {
    await page.goto('/sortng');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/not found/i);
    await expect(page.getByText('/sortng')).toBeVisible();
    await page.getByRole('link', { name: /Sorting/ }).first().click();
    await expect(page).toHaveURL(/\/sorting/);
  });

  test('shows a visible focus ring on keyboard focus', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el ? getComputedStyle(el).outlineStyle : 'none';
    });
    expect(outline).not.toBe('none');
  });
});
