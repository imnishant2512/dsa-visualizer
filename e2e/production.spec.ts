import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

const PAGES = [
  '/',
  '/sorting',
  '/searching',
  '/pathfinding',
  '/linear/stack',
  '/trees',
  '/hashtables',
  '/graphs',
  '/ide',
  '/no-such-page',
];

test.describe('production hardening', () => {
  test('serves the security headers from firebase.json', async ({ page }) => {
    const response = await page.goto('/sorting');
    const headers = response?.headers() ?? {};
    expect(headers['content-security-policy']).toContain("default-src 'self'");
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  // Any request the CSP blocks is also logged as a console error, which the
  // fixture turns into a failure — so this checks both that nothing is fetched
  // from another origin and that the policy breaks nothing.
  test('loads every page from this origin alone, under the CSP', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (['blob:', 'data:'].includes(url.protocol) || url.origin === 'http://localhost:4173') {
        return;
      }
      external.push(request.url());
    });
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
    expect(external).toEqual([]);
  });
});

test.describe('accessibility', () => {
  for (const path of PAGES) {
    test(`${path} has no serious or critical WCAG 2.1 AA violations`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      if (path === '/ide') await expect(page.locator('.monaco-editor')).toBeVisible();

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        // Monaco's own editor DOM is third-party and outside this app's control.
        .exclude('.monaco-editor')
        .analyze();
      const blocking = results.violations
        .filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))
        .map((violation) => ({
          rule: violation.id,
          help: violation.help,
          targets: violation.nodes.slice(0, 5).map((node) => node.target.join(' ')),
        }));
      expect(blocking).toEqual([]);
    });
  }
});
