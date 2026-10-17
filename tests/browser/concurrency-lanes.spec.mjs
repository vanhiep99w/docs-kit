import { test, expect } from '@playwright/test';

const url = '/?case=concurrency';

test('SVG event anchors support keyboard selection and open the matching native detail', async ({ page }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  const anchor = page.getByRole('link', { name: '#4: T2 lấy lock, SELECT trả về', exact: true });
  await anchor.focus(); await page.keyboard.press('Enter');
  await expect(anchor).toHaveAttribute('aria-current', 'true');
  const detail = page.locator('[data-detail="t2-lock"]');
  await expect(detail).toHaveAttribute('open', '');
  await expect(detail).toHaveAttribute('data-selected', 'true');
  const target = await detail.getAttribute('id');
  expect(decodeURI(new URL(page.url()).hash)).toBe('#' + target);
  await expect(page.locator('[data-relation="unlock-then-lock"]')).toHaveAttribute('data-selected', 'true');
  expect(errors).toEqual([]);
});

test('declared relation selection highlights only its endpoints and links both directions to readable descriptions', async ({ page }) => {
  await page.goto('/?case=concurrency-java');
  await page.getByRole('link', { name: 'Quan hệ R2: Volatile write synchronizes-with read sau nó', exact: true }).click();
  const relation = page.locator('[data-relation-detail="publication"]');
  await expect(relation).toHaveAttribute('open', '');
  await expect(page.locator('[data-item="write-ready"]')).toHaveAttribute('data-selected', 'true');
  await expect(page.locator('[data-item="read-ready"]')).toHaveAttribute('data-selected', 'true');
  await expect(page.locator('[data-item="write-data"]')).toHaveAttribute('data-selected', 'false');
  await relation.getByRole('link', { name: '#3 Đọc ready == true (volatile read)', exact: true }).click();
  await expect(page.locator('[data-detail="read-ready"]')).toHaveAttribute('open', '');
  await expect(relation).toHaveAttribute('open', '');
  const writerRelation = page.locator('[data-relation-detail="writer-order"]');
  await writerRelation.locator(':scope > summary').focus(); await page.keyboard.press('Enter');
  await expect(writerRelation).toHaveAttribute('data-selected', 'true');
  await expect(page.locator('[data-relation="writer-order"]')).toHaveAttribute('data-selected', 'true');
});

test('same-coordinate events stack without shifting time, overlapping intervals stay separately readable', async ({ page }) => {
  await page.goto('/?case=concurrency-overlap');
  const circle = async (id) => page.locator(`[data-item="${id}"] circle`).evaluate((el) => ({ x: el.getAttribute('cx'), y: el.getAttribute('cy') }));
  const first = await circle('t1-lock'); const same = await circle('same-coordinate');
  expect(first.x).toBe(same.x); expect(first.y).not.toBe(same.y);
  const hold = await page.locator('[data-item="t1-hold"] .concurrency-lanes-interval').evaluate((el) => ({ x: el.getAttribute('x'), width: el.getAttribute('width') }));
  expect(hold.x).toBe(first.x); expect(Number(hold.width)).toBeGreaterThan(0);
  const badge = page.locator('[data-item="t2-wait"] .concurrency-lanes-badge');
  expect(await badge.evaluate((el) => el.tagName)).toBe('rect');
  await page.getByRole('link', { name: '#6: Cùng mốc với lock 👋', exact: true }).click();
  await expect(page.locator('[data-detail="same-coordinate"]')).toHaveAttribute('open', '');
  await expect(page.locator('.concurrency-lanes-details')).toContainText('Transaction có tên dài cần đọc đầy đủ');
  await expect(page.getByText('Không có mục trong lane này.', { exact: true })).toBeVisible();
});

test('mobile uses a contained horizontal scroller, dark colors and keyboard-readable timing table', async ({ page }) => {
  await page.goto(url);
  await page.screenshot({ path: 'test-results/concurrency-lanes-desktop.png', fullPage: true });
  const figure = page.locator('.concurrency-lanes');
  const light = await figure.evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
  const dark = await figure.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(dark).not.toBe(light);
  await page.evaluate(() => { delete document.documentElement.dataset.theme; document.body.classList.add('dark'); });
  expect(await figure.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(dark);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  const scroll = page.locator('.concurrency-lanes-scroll');
  expect(await scroll.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await scroll.focus(); await page.keyboard.press('ArrowRight');
  await expect.poll(() => scroll.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  const table = page.locator('.concurrency-lanes-table');
  await table.locator(':scope > summary').focus(); await page.keyboard.press('Enter');
  await expect(table.locator('tbody tr')).toHaveCount(8);
  await expect(table).toContainText('Chờ');
  await page.screenshot({ path: 'test-results/concurrency-lanes-mobile-dark.png', fullPage: true });
});

test('selection and disclosure interactions never request data or execute an external system', async ({ page }) => {
  await page.goto(url);
  const requests = []; page.on('request', (request) => requests.push(request.url()));
  await page.getByRole('link', { name: '#7: T2 chờ lock', exact: true }).click();
  const wait = page.locator('[data-detail="t2-wait"]');
  await expect(wait).toHaveAttribute('open', '');
  await wait.locator(':scope > summary').click();
  await expect(wait).not.toHaveAttribute('open');
  await page.getByRole('link', { name: '#7: T2 chờ lock', exact: true }).click();
  await expect(wait).toHaveAttribute('open', '');
  expect(requests).toEqual([]);
});

test('without JavaScript every event, interval and declared relation is readable through native disclosures', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); await page.goto('http://127.0.0.1:4178' + url);
  await expect(page.locator('.concurrency-lanes-header')).toContainText('Dữ liệu minh họa');
  await page.locator('.concurrency-lanes-reference > summary').click();
  const relation = page.locator('[data-relation-detail="unlock-then-lock"]');
  await relation.locator(':scope > summary').focus(); await page.keyboard.press('Enter');
  await expect(relation).toContainText('không phải bằng chứng JMM happens-before');
  const wait = page.locator('[data-detail="t2-wait"]');
  await wait.locator(':scope > summary').click();
  await expect(wait).toHaveAttribute('open', '');
  await expect(wait).toContainText('Khoảng chờ không phải CPU execution');
  await page.locator('.concurrency-lanes-table > summary').click();
  await expect(page.locator('.concurrency-lanes-table tbody tr')).toHaveCount(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});
