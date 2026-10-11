import { expect, seekToEnd, test } from './fixtures';

test.describe('searching', () => {
  test('ends a miss as a miss, and a hit as a hit', async ({ page }) => {
    await page.goto('/searching?algo=binary&size=30&seed=7');
    await page.getByRole('button', { name: 'Not in the array', exact: true }).click();
    await seekToEnd(page);
    await expect(page.getByText(/is not in the array\. Ruled out all 30 values/)).toBeVisible();

    await page.getByRole('button', { name: 'In the array', exact: true }).click();
    await seekToEnd(page);
    await expect(
      page.getByText(/^Found \d+ at index \d+ — \d+ probes? into 30 values\.$/),
    ).toBeVisible();
  });
});

test.describe('pathfinding', () => {
  test('lays a maze and routes through it', async ({ page }) => {
    await page.goto('/pathfinding');
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByRole('button', { name: 'Rooms & doors' }).click();
    await expect(page.getByText(/· Rooms & doors$/)).toBeVisible();
    await seekToEnd(page);
    await expect(page.getByText(/Route found — cost \d+|No route exists/)).toBeVisible();
  });

  test('paints walls by dragging the pointer across the grid', async ({ page }) => {
    await page.goto('/pathfinding');
    const walls = page.locator('[class*="_wall_"]');
    const before = await walls.count();

    const cell = (index: number) => page.locator(`[data-index="${index}"]`);
    const from = await cell(82).boundingBox();
    const to = await cell(90).boundingBox();
    if (!from || !to) throw new Error('grid not laid out');
    await page.mouse.move(from.x + 5, from.y + 5);
    await page.mouse.down();
    await page.mouse.move(to.x + 5, to.y + 5, { steps: 12 });
    await page.mouse.up();

    expect(await walls.count()).toBeGreaterThanOrEqual(before + 8);
  });

  test('can be drawn on with the keyboard alone', async ({ page }) => {
    await page.goto('/pathfinding');
    const grid = page.getByRole('application');
    await grid.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('w');
    await page.keyboard.press('Space');
    await expect(page.locator('[class*="_wall_"]')).toHaveCount(1);
  });
});

test.describe('linear structures', () => {
  test('draws a stack upward and stops offering Pop once it is empty', async ({ page }) => {
    await page.goto('/linear/stack');
    await expect(page.getByText('base', { exact: true })).toBeVisible();
    const pop = page.getByRole('button', { name: 'Pop', exact: true });

    for (let i = 0; i < 4; i++) {
      await pop.click();
      await seekToEnd(page);
    }
    await expect(pop).toBeDisabled();
    await expect(pop).toHaveAttribute('title', /empty/i);
  });

  test('plays an operation started the instant the previous one ends', async ({ page }) => {
    // The race behind this lived in the controller: a finished operation's
    // "stop" signal landed after the next one had asked to play.
    await page.goto('/linear/stack');
    await page.getByRole('button', { name: '4×' }).click();
    await page.getByRole('button', { name: /^Push/ }).click();
    await expect(page.locator('[class*="_cell_"]', { hasText: /^9$/ })).toHaveCount(1);
    await page.getByRole('button', { name: 'Pop', exact: true }).click();
    await expect(page.locator('[class*="_cell_"]', { hasText: /^9$/ })).toHaveCount(0);
  });
});

test.describe('trees', () => {
  test('refuses a duplicate and shows balance factors in AVL mode', async ({ page }) => {
    await page.goto('/trees');
    await page.getByLabel('Value').fill('50');
    await expect(page.getByRole('button', { name: 'Insert 50' })).toBeDisabled();

    await page.getByRole('button', { name: 'AVL tree' }).click();
    for (const value of [90, 95, 99]) {
      await page.getByLabel('Value').fill(String(value));
      await page.getByRole('button', { name: `Insert ${value}` }).click();
      await seekToEnd(page);
    }
    const labels = await page.locator('svg text[class*="balance"]').allTextContents();
    expect(labels.length).toBeGreaterThan(0);
    // After rebalancing, every node is back within ±1.
    for (const label of labels) expect(Math.abs(Number(label))).toBeLessThanOrEqual(1);
  });
});

test.describe('hash tables', () => {
  test('keeps an inserted key through a change of strategy and a rehash', async ({ page }) => {
    await page.goto('/hashtables');
    await page.getByLabel('Key').fill('27');
    await page.getByRole('button', { name: 'Insert 27' }).click();
    await seekToEnd(page);

    const live = page.locator('[class*="_table_"] [class*="lot_"]', { hasText: /^27$/ });
    await expect(live).toHaveCount(1);
    await page.getByRole('button', { name: 'Chaining' }).click();
    await expect(live).toHaveCount(1);
    await page.getByRole('button', { name: /Rehash to 23/ }).click();
    await expect(live).toHaveCount(1);
    await expect(page.getByText('key % 23')).toBeVisible();
  });
});

test.describe('graphs', () => {
  test('withdraws A* in writing once a hand-set weight breaks it', async ({ page }) => {
    await page.goto('/graphs');
    await expect(page.getByText(/A\* is withdrawn/)).toHaveCount(0);

    await page.getByRole('button', { name: 'Set weight' }).click();
    await page.locator('svg line[class*="hit"]').first().click({ force: true });
    await page.getByRole('spinbutton').fill('1');
    await page.getByRole('button', { name: 'Set', exact: true }).click();

    await expect(page.getByText(/A\* is withdrawn while edge .* weighs 1/)).toBeVisible();
    await page.getByRole('button', { name: 'A*', exact: true }).click();
    await seekToEnd(page);
    await expect(page.getByText(/shortest path costs \d+/)).toBeVisible();
  });

  test('moves a node by dragging it, as one undoable edit', async ({ page }) => {
    await page.goto('/graphs');
    const node = page.locator('svg g', { has: page.locator('text', { hasText: /^C$/ }) }).first();
    const box = await node.boundingBox();
    if (!box) throw new Error('node not laid out');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 60, { steps: 10 });
    await page.mouse.up();

    await expect(page.getByText('Move node').first()).toBeVisible();
    await page.getByRole('button', { name: 'Undo last' }).click();
    await expect(page.getByText(/No operations yet/)).toBeVisible();
  });
});
