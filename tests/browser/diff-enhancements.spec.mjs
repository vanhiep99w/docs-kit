import { test, expect } from '@playwright/test';

const diff = '/?case=diff-words';

test('split mode aligns side-specific rows and keeps word detail, unpaired placeholders and line numbers accurate', async ({ page }) => {
  await page.goto(diff);
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.locator('.code-diff')).toHaveAttribute('data-view', 'split');
  const pair = page.locator('.code-diff-split-row').filter({ has: page.locator('[data-after-line="2"]') });
  const cells = pair.locator(':scope > .code-diff-row');
  await expect(cells).toHaveCount(2);
  const before = await cells.nth(0).boundingBox(); const after = await cells.nth(1).boundingBox();
  expect(after.x).toBeGreaterThanOrEqual(before.x + before.width - 1); expect(Math.abs(after.y - before.y)).toBeLessThan(1);
  await expect(cells.nth(0).locator('[data-word-changed="true"]')).toHaveText('3');
  await expect(cells.nth(1).locator('[data-word-changed="true"]')).toHaveText('5');
  const last = page.locator('.code-diff-split-row').filter({ has: page.locator('[data-after-line="5"]') });
  await expect(last.locator('.code-diff-placeholder')).toHaveAttribute('data-side', 'before');
  await expect(last.locator('[data-before-line]')).toHaveCount(0);
  await expect(page.locator('[data-after-line="2"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('view switching keeps keyboard focus, copy originals, unique anchors and word colors across layouts', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(diff);
  const data = await page.locator('#data').evaluate((el) => JSON.parse(el.textContent).diff);
  const mode = page.getByRole('group', { name: 'Chế độ diff', exact: true });
  for (const name of ['Inline', 'Song song']) {
    const button = mode.getByRole('button', { name, exact: true });
    await button.focus(); await page.keyboard.press('Enter'); await expect(button).toBeFocused();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    const ids = await page.locator('.code-diff [id]').evaluateAll((elements) => elements.map((el) => el.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const [side, label] of [['before', 'trước'], ['after', 'sau']]) {
      await page.getByRole('button', { name: 'Sao chép bản ' + label, exact: true }).click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(data[side].code);
    }
  }
  const token = page.locator('[data-side="after"] [data-word-changed="true"]').first();
  const light = await token.evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
  expect(await token.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(light);
  await page.screenshot({ path: 'test-results/diff-split-words-desktop-dark.png', fullPage: true });
});

test('split folds use one native disclosure for both columns and pinned annotations remain visible', async ({ page }) => {
  await page.goto('/?case=diff-split');
  const fold = page.locator('.code-diff-fold').first();
  await expect(fold).not.toHaveAttribute('open');
  await expect(fold.locator('.code-diff-split-row').first()).not.toBeVisible();
  await fold.locator(':scope > summary').focus(); await page.keyboard.press('Enter');
  await expect(fold.locator('.code-diff-split-row').first()).toBeVisible();
  const foldedCells = fold.locator('.code-diff-split-row').first().locator(':scope > .code-diff-row');
  const left = await foldedCells.nth(0).boundingBox(); const right = await foldedCells.nth(1).boundingBox();
  expect(Math.abs(left.y - right.y)).toBeLessThan(1); expect(right.x).toBeGreaterThan(left.x);
  await expect(page.locator('[data-after-line="3"]')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.locator('.code-diff-scroll').evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/diff-split-mobile.png', fullPage: true });
});
