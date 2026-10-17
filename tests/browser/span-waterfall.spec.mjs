import { test, expect } from '@playwright/test';

const url = '/?case=waterfall';

test('keyboard span selection opens the matching detail and preserves other disclosures', async ({ page }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  const query = page.locator('[data-span="query"] a');
  await query.focus(); await page.keyboard.press('Enter');
  await expect(query).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('[data-span="query"]')).toHaveAttribute('data-selected', 'true');
  await expect(page.locator('[data-detail="query"]')).toHaveAttribute('open', '');
  await expect(page.locator('[data-detail="request"]')).toHaveAttribute('open', '');
  const id = await page.locator('[data-detail="query"]').getAttribute('id');
  expect(new URL(page.url()).hash).toBe('#' + encodeURI(id));
  await page.getByRole('link', { name: 'Cache miss vẫn là OK', exact: true }).click();
  await expect(page.locator('[data-detail="cache"]')).toHaveAttribute('open', '');
  await expect(page.locator('[data-span="cache"] a')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('[data-detail="query"]')).toHaveAttribute('open', '');
  expect(errors).toEqual([]);
});

test('span attributes reuse Inspector search and exact large-number copying without network', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(url);
  const requests = []; page.on('request', (request) => requests.push(request.url()));
  await page.locator('[data-span="query"] a').click();
  const detail = page.locator('[data-detail="query"]');
  await detail.getByRole('button', { name: 'Chọn /demo.sequence', exact: true }).click();
  await detail.getByRole('button', { name: 'Sao chép value', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('9007199254740993');
  await detail.getByRole('searchbox').fill('postgresql');
  await expect(detail.getByRole('status', { name: 'Kết quả tìm kiếm', exact: true })).toContainText('1 kết quả');
  await expect(detail.locator('[data-pointer="/db.system.name"]')).toBeVisible();
  await expect(detail).toHaveAttribute('open', '');
  expect(requests).toEqual([]);
});

test('shared scale preserves fan-out timestamps, nesting, zero duration and error labels', async ({ page }) => {
  await page.goto('/?case=waterfall-parallel');
  const geometry = async (id) => page.locator(`[data-span="${id}"] .span-waterfall-bar`).evaluate((el) => ({ left: el.style.left, width: el.style.width }));
  expect((await geometry('inventory')).left).toBe((await geometry('pricing')).left);
  expect((await geometry('inventory')).width).toBe('83.3333%');
  expect((await geometry('timeout-event')).width).toBe('0%');
  await expect(page.locator('[data-span="timeout-event"] .span-waterfall-bar')).toHaveAttribute('data-zero', 'true');
  await expect(page.locator('[data-span="inventory"]')).toContainText('Lỗi');
  const levels = await page.locator('.span-waterfall-rows > li').evaluateAll((rows) => rows.map((row) => [row.dataset.span, row.style.getPropertyValue('--span-depth')]));
  expect(levels).toEqual([['checkout', '0'], ['inventory', '1'], ['stock-query', '2'], ['pricing', '1'], ['promotion', '2'], ['timeout-event', '1']]);
  const table = page.locator('.span-waterfall-table-disclosure');
  await table.locator(':scope > summary').focus(); await page.keyboard.press('Enter');
  await expect(table).toHaveAttribute('open', '');
  await expect(table.locator('tbody tr')).toHaveCount(6);
  await expect(table.locator('tbody tr').last()).toContainText('220 ms');
});

test('mobile scroll contains the wide timeline, inherits dark theme and respects reduced motion', async ({ page }) => {
  await page.goto('/?case=waterfall-parallel');
  await page.screenshot({ path: 'test-results/span-waterfall-desktop.png', fullPage: true });
  const figure = page.locator('.span-waterfall');
  const light = await figure.evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
  const dark = await figure.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(dark).not.toBe(light);
  await page.evaluate(() => { delete document.documentElement.dataset.theme; document.body.classList.add('dark'); });
  expect(await figure.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(dark);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  const scroll = page.locator('.span-waterfall-scroll');
  expect(await scroll.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await scroll.focus(); await page.keyboard.press('ArrowRight');
  await expect.poll(() => scroll.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await page.locator('[data-span="inventory"] a').click();
  await expect(page.locator('[data-detail="inventory"]')).toHaveAttribute('open', '');
  await page.screenshot({ path: 'test-results/span-waterfall-mobile-dark.png', fullPage: true });
});

test('no-JavaScript fallback exposes timing table and every span attribute via native disclosures', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4178' + url);
  await expect(page.getByText('Trace minh họa', { exact: true })).toBeVisible();
  const query = page.locator('[data-detail="query"]');
  await query.locator(':scope > summary').focus(); await page.keyboard.press('Enter');
  await expect(query).toHaveAttribute('open', '');
  await expect(query).toContainText('9007199254740993');
  await expect(query.getByRole('searchbox')).toHaveCount(0);
  const table = page.locator('.span-waterfall-table-disclosure');
  await table.locator(':scope > summary').click();
  await expect(table.locator('tbody tr')).toHaveCount(4);
  await expect(table).toContainText('70 ms');
  await context.close();
});
