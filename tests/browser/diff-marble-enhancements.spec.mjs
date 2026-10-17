import { test, expect } from '@playwright/test';

const diff = '/?case=diff-words';
const zoom = '/?case=marble-zoom';

test('split mode aligns side-specific rows and keeps word detail, unpaired placeholders and annotation anchors accurate', async ({ page }) => {
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
  await page.getByRole('link', { name: 'Giới hạn mới', exact: true }).click();
  await expect(page.locator('.code-diff-number:target')).toHaveAttribute('data-after-line', '2');
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
  await page.getByRole('link', { name: 'Dòng không đổi cần giải thích', exact: true }).click();
  await expect(page.locator('.code-diff-number:target')).toHaveAttribute('data-after-line', '3');
  await expect(page.locator('.code-diff-number:target')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.locator('.code-diff-scroll').evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/diff-split-mobile.png', fullPage: true });
});

test('Marble zoom changes a shared frame axis, never marker size, group alignment, frames or keyboard focus', async ({ page }) => {
  await page.goto(zoom);
  const controls = page.getByRole('group', { name: 'Thu phóng: Cùng frame, nhãn dài', exact: true });
  const marker = page.locator('.marble-token--next').first();
  const original = await marker.locator('circle').boundingBox();
  const up = controls.getByRole('button', { name: 'Phóng to', exact: true });
  await up.focus(); await page.keyboard.press('Enter');
  await expect(up).toBeFocused();
  await expect(page.getByRole('status', { name: 'Khoảng cách frame', exact: true })).toHaveText('125% · 60px/frame');
  const transforms = await page.locator('.marble-token[data-frame="2"]').evaluateAll((elements) => elements.map((el) => el.getAttribute('transform').split(' ')[0]));
  expect(new Set(transforms).size).toBe(1); expect(transforms[0]).toBe('translate(144');
  const next = await marker.locator('circle').boundingBox(); expect(next.width).toBe(original.width); expect(next.height).toBe(original.height);
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  await expect(up).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status', { name: 'Khoảng cách frame', exact: true })).toHaveText('200% · 96px/frame');
  await controls.getByRole('button', { name: 'Đặt lại', exact: true }).click();
  await controls.getByRole('button', { name: 'Thu nhỏ', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Khoảng cách frame', exact: true })).toHaveText('75% · 36px/frame');
});

test('Marble zoom keeps the center frame anchored while panned and leaves native event table state intact', async ({ page }) => {
  await page.goto(zoom);
  const scroller = page.locator('.marble-scroller');
  await scroller.evaluate((el) => el.scrollLeft = 500);
  const center = async (spacing) => scroller.evaluate((el, frameWidth) => {
    const label = el.querySelector('.marble-row-label');
    return (el.scrollLeft + (el.clientWidth - label.offsetWidth) / 2 - 24) / frameWidth;
  }, spacing);
  const before = await center(48);
  await page.locator('.marble-text > summary').click();
  await page.getByRole('button', { name: 'Phóng to', exact: true }).click();
  await expect.poll(async () => Math.abs(await center(60) - before)).toBeLessThan(.05);
  await expect(page.locator('.marble-text')).toHaveAttribute('open', '');
  await page.screenshot({ path: 'test-results/marble-zoom-desktop.png', fullPage: true });
});

test('direct JSX zoom props work through repeated changes, with mobile containment and no network', async ({ page }) => {
  await page.goto('/?case=marble-zoom-direct');
  const requests = []; page.on('request', (request) => requests.push(request.url()));
  await page.getByRole('button', { name: 'Phóng to', exact: true }).click();
  await page.getByRole('button', { name: 'Phóng to', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Khoảng cách frame', exact: true })).toHaveText('150% · 72px/frame');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => document.body.classList.add('dark'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/marble-zoom-mobile-dark.png', fullPage: true });
  expect(requests).toEqual([]);
});

test('no-JavaScript split word detail, disclosures and zoom fallback retain complete readable content', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); await page.goto('http://127.0.0.1:4178' + diff);
  await expect(page.locator('.code-diff')).toHaveAttribute('data-view', 'split');
  await expect(page.getByRole('group', { name: 'Chế độ diff', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-word-changed="true"]').first()).toBeVisible();
  await page.getByRole('link', { name: 'Giới hạn mới', exact: true }).click();
  await expect(page.locator('.code-diff-number:target')).toHaveAttribute('data-after-line', '2');
  await page.goto('http://127.0.0.1:4178' + zoom);
  await expect(page.locator('.marble-zoom-controls')).toBeHidden();
  await expect(page.locator('.marble-token[data-frame="2"]').first()).toHaveAttribute('transform', /^translate\(120 /);
  await page.locator('.marble-text > summary').click(); await expect(page.getByRole('table')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});
