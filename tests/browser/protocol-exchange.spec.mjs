import { test, expect } from '@playwright/test';
import { formatProtocolMessage, protocolBodySource } from '../../dist/protocol-exchange/data.js';

const url = '/?case=protocol';

test('copies readable transcripts and exact body sources without sending a request', async ({ page, context }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(url);
  const data = await page.locator('#data').evaluate((el) => JSON.parse(el.textContent).exchange);
  const requests = []; page.on('request', (request) => requests.push(request.url()));
  const variant = data.variants[0];
  for (const side of ['request', 'response']) {
    const messageButton = page.getByRole('button', { name: `Sao chép ${side} — Thành công`, exact: true });
    await messageButton.focus(); await page.keyboard.press('Enter');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(formatProtocolMessage(variant, side));
    await expect(messageButton).toBeFocused();
    await page.getByRole('button', { name: `Sao chép body ${side} — Thành công`, exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(protocolBodySource(variant[side].body));
  }
  await expect(page.getByRole('status', { name: 'Sao chép trao đổi', exact: true })).toContainText('Đã sao chép body response');
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test('JSON payload reuses Inspector selection, search and lossless numeric copying', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(url);
  const response = page.locator('[data-variant="ok"] .protocol-exchange-message').nth(1);
  await response.getByRole('button', { name: 'Chọn /id', exact: true }).click();
  await response.getByRole('button', { name: 'Sao chép value', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('9007199254740993');
  await response.getByRole('searchbox').fill('Nguyễn');
  await expect(response.getByRole('status', { name: 'Kết quả tìm kiếm', exact: true })).toContainText('1 kết quả');
  await expect(response.locator('[data-pointer="/profile/name"]')).toBeVisible();
  await expect(response.getByRole('list', { name: 'Chú thích dữ liệu' })).toContainText('ID nguyên lớn');
});

test('annotation links target the right side/header instance and preserve repeated headers', async ({ page }) => {
  await page.goto(url);
  const response = page.locator('[data-variant="ok"] .protocol-exchange-message').nth(1);
  await expect(response.getByRole('rowheader', { name: 'Set-Cookie', exact: true })).toHaveCount(2);
  await page.getByRole('link', { name: 'Cookie thứ hai', exact: true }).click();
  await expect(page.locator('.protocol-exchange-headers tr:target')).toContainText('two=FAKE');
  await page.getByRole('link', { name: 'Credential giả', exact: true }).click();
  await expect(page.locator('.protocol-exchange-headers tr:target')).toContainText('Bearer DEMO_NOT_REAL');
  await page.getByRole('link', { name: 'Đọc JSON response', exact: true }).click();
  await expect(page.locator('.protocol-exchange-body:target')).toContainText('9007199254740993');
  await expect(page.locator('a[href^="https:"]')).toHaveCount(0);
});

test('native variant disclosure is keyboard usable, persists after copy, and supports absent body', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(url);
  const error = page.locator('[data-variant="error"]');
  await expect(error).not.toHaveAttribute('open');
  await error.locator(':scope > summary').focus(); await page.keyboard.press('Enter');
  await expect(error).toHaveAttribute('open', '');
  await page.getByRole('button', { name: 'Sao chép body response — Không được phép', exact: true }).click();
  await expect(error).toHaveAttribute('open', '');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('unauthorized\r\n');
  const head = page.locator('[data-variant="head"]');
  await head.locator(':scope > summary').click();
  await expect(head).toContainText('Không có body.');
  await expect(head.getByRole('button', { name: /Sao chép body/ })).toHaveCount(0);
  await head.getByRole('button', { name: 'Sao chép response — Chỉ đọc metadata', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('200\r\nContent-Length: 120');
});

test('failed clipboard access leaves all fields and body inspectable', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) } }));
  await page.goto(url);
  await page.getByRole('button', { name: 'Sao chép request — Thành công', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Sao chép trao đổi', exact: true })).toContainText('Không thể sao chép');
  await expect(page.locator('.protocol-exchange-start').first()).toContainText('/demo?trace=1');
});

test('desktop paired layout stacks on mobile and nested Inspector follows dark mode', async ({ page }) => {
  await page.goto(url);
  const pair = page.locator('.protocol-exchange-pair').first();
  expect((await pair.evaluate((el) => getComputedStyle(el).gridTemplateColumns)).split(' ')).toHaveLength(2);
  await page.screenshot({ path: 'test-results/protocol-exchange-desktop.png', fullPage: true });
  const inspector = pair.locator('.data-inspector').first();
  const light = await inspector.evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
  const dark = await inspector.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(dark).not.toBe(light);
  await page.evaluate(() => { delete document.documentElement.dataset.theme; document.body.classList.add('dark'); });
  expect(await inspector.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(dark);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await pair.evaluate((el) => getComputedStyle(el).gridTemplateColumns)).split(' ')).toHaveLength(1);
  const error = page.locator('[data-variant="error"]');
  await error.locator(':scope > summary').click();
  const text = error.getByRole('region', { name: 'Body response — Không được phép', exact: true });
  expect(await text.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/protocol-exchange-mobile-dark.png', fullPage: true });
});

test('without JS, every variant, JSON payload and annotation remains readable', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(url);
  await expect(page.getByRole('button')).toHaveCount(0);
  await expect(page.locator('.protocol-exchange-message').nth(1)).toContainText('9007199254740993');
  const error = page.locator('[data-variant="error"]');
  await error.locator(':scope > summary').click();
  await expect(error).toContainText('unauthorized');
  await page.getByRole('link', { name: 'Cookie thứ hai', exact: true }).click();
  await expect(page.locator('.protocol-exchange-headers tr:target')).toContainText('two=FAKE');
  const json = page.locator('[data-variant="ok"] .data-inspector').nth(1);
  await json.locator('.data-inspector-source > summary').click();
  await expect(json.getByRole('region', { name: 'JSON gốc đầy đủ', exact: true })).toContainText('9007199254740993');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await context.close();
});
