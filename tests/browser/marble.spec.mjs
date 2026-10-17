import { test, expect } from '@playwright/test';

test('shared frames align across source, inner and output independently of label length', async ({ page }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?case=marble');
  const frameFive = page.locator('.marble-token[data-frame="5"]');
  expect(await frameFive.count()).toBe(3);
  const xs = await frameFive.evaluateAll((elements) => elements.map((el) => el.getScreenCTM().e));
  expect(new Set(xs).size).toBe(1);
  await expect(page.getByRole('list', { name: 'Chú thích diễn biến' })).toContainText('Teardown inner A');
  await expect(page.locator('.marble-annotation-band')).toHaveCount(2);
  await page.getByText('Bảng sự kiện (4 lane)', { exact: true }).click();
  await expect(page.getByRole('table')).toContainText('Frame 5: Unsubscribe');
  await expect(page.getByRole('table')).toContainText('Frame 12: Complete');
  await expect(page.getByRole('button')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('same-frame groups stack vertically without changing x or hiding terminal markers', async ({ page }) => {
  await page.goto('/?case=marble-group');
  const group = page.locator('.marble-lane').nth(1).locator('.marble-token');
  await expect(group).toHaveCount(2);
  const positions = await group.evaluateAll((elements) => elements.map((el) => ({ x: el.getScreenCTM().e, y: el.getScreenCTM().f, height: el.getBBox().height })));
  expect(positions[0].x).toBe(positions[1].x);
  expect(positions[1].y - positions[0].y).toBeGreaterThanOrEqual(34);
  expect(positions[1].y - positions[0].y).toBeGreaterThan(positions[0].height);
  await expect(page.locator('[data-type="complete"]')).toHaveCount(1);
  await expect(page.locator('[data-type="error"]')).toHaveCount(1);
  await expect(page.locator('[data-type="unsubscribe"]')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/marble-groups.png', fullPage: true });
});

test('mobile scrolling preserves scale and sticky labels, dark theme comes from host', async ({ page }) => {
  await page.goto('/?case=marble-long');
  await page.screenshot({ path: 'test-results/marble-desktop.png', fullPage: true });
  const marker = page.locator('.marble-token').first();
  const desktop = await marker.evaluate((el) => ({ x: el.getScreenCTM().a, width: el.querySelector('circle').getBoundingClientRect().width }));
  const light = await page.locator('.marble-diagram').evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
  const dark = await page.locator('.marble-diagram').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(dark).not.toBe(light);
  await page.evaluate(() => { delete document.documentElement.dataset.theme; document.body.classList.add('dark'); });
  expect(await page.locator('.marble-diagram').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(dark);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  const scroller = page.getByRole('region', { name: 'Sơ đồ: Cùng frame, nhãn dài' });
  expect(await scroller.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const mobile = await marker.evaluate((el) => ({ x: el.getScreenCTM().a, width: el.querySelector('circle').getBoundingClientRect().width }));
  expect(mobile).toEqual(desktop);
  const groupXs = await page.locator('.marble-token[data-frame="2"]').evaluateAll((elements) => elements.map((el) => el.getScreenCTM().e));
  expect(new Set(groupXs).size).toBe(1);
  await scroller.focus(); await page.keyboard.press('ArrowRight');
  await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  const label = await page.locator('.marble-lane').nth(1).locator('.marble-row-label').boundingBox();
  const viewport = await scroller.boundingBox();
  expect(Math.abs(label.x - viewport.x)).toBeLessThan(2);
  await page.screenshot({ path: 'test-results/marble-mobile-dark.png', fullPage: true });
});

test('native event table is keyboard accessible and never fetches diagram data', async ({ page }) => {
  await page.goto('/?case=marble-group');
  const requests = []; page.on('request', (request) => requests.push(request.url()));
  const summary = page.locator('.marble-text > summary');
  await summary.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('table')).toBeVisible();
  const first = page.getByRole('table').locator('tbody tr').first();
  await expect(first).toContainText('Frame 2: Next a: Giá trị được phát');
  await expect(first).toContainText('Frame 2: Complete');
  await page.keyboard.press('Enter'); await expect(page.getByRole('table')).toBeHidden();
  expect(requests).toEqual([]);
});

test('SVG, legends, annotations and complete event text remain usable without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto('/?case=marble');
  await expect(page.locator('.marble-axis')).toHaveCount(4);
  await expect(page.getByRole('list', { name: 'Chú thích diễn biến' })).toContainText('Chờ inner hiện tại');
  await expect(page.getByRole('definition')).toHaveCount(4);
  await page.locator('.marble-text > summary').click();
  await expect(page.getByRole('table')).toContainText('Frame 5: Unsubscribe');
  await expect(page.getByRole('table')).toContainText('Frame 12: Complete');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await context.close();
});
