import { test, expect } from '@playwright/test';
import { formatProtocolMessage } from '../../dist/protocol-exchange/data.js';
const url = '/?case=protocol';

test('copy keeps readable request/response transcripts without sending requests', async ({ page, context }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']); await page.goto(url);
  const data = await page.locator('#data').evaluate((el) => JSON.parse(el.textContent).exchange);
  const requests = []; page.on('request', (request) => requests.push(request.url()));
  for (const side of ['request', 'response']) {
    const button = page.getByRole('button', { name: `Sao chép ${side} — Thành công`, exact: true });
    await button.focus(); await page.keyboard.press('Enter');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(formatProtocolMessage(data.variants[0], side));
    await expect(button).toBeFocused();
  }
  await expect(page.getByRole('status')).toContainText('Đã sao chép response');
  expect(requests).toEqual([]); expect(errors).toEqual([]);
});

test('raw JSON keeps large numbers and repeated headers without descriptions or nested tools', async ({ page }) => {
  await page.goto(url);
  const response = page.locator('[data-variant="ok"] .protocol-exchange-message').nth(1);
  await expect(response.getByRole('rowheader', { name: 'Set-Cookie', exact: true })).toHaveCount(2);
  await expect(response.locator('pre')).toContainText('9007199254740993');
  await expect(response.getByRole('heading', { name: 'Response', exact: true })).toBeVisible();
  await expect(page.locator('.protocol-exchange-info, .protocol-exchange-description, .protocol-exchange-annotations, .data-inspector')).toHaveCount(0);
  await expect(page.getByRole('searchbox')).toHaveCount(0);
});

test('native variant disclosure is keyboard usable; missing body adds no placeholder clutter', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']); await page.goto(url);
  const error = page.locator('[data-variant="error"]');
  await error.locator(':scope > summary').focus(); await page.keyboard.press('Enter');
  await expect(error).toHaveAttribute('open', '');
  await error.getByRole('button', { name: 'Sao chép response — Không được phép', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('unauthorized\r\n');
  const head = page.locator('[data-variant="head"]'); await head.locator(':scope > summary').click();
  await expect(head.locator('pre')).toHaveCount(0); await expect(head).not.toContainText('Không có body');
  await head.getByRole('button', { name: 'Sao chép response — Chỉ đọc metadata', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('200\r\nContent-Length: 120');
});

test('clipboard denial leaves content readable', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) } }));
  await page.goto(url); await page.getByRole('button', { name: 'Sao chép request — Thành công', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Không thể sao chép');
  await expect(page.locator('.protocol-exchange-start').first()).toContainText('/demo?trace=1');
});

test('desktop request/response pair stacks on mobile, follows dark theme and contains wide bodies', async ({ page }) => {
  await page.goto(url); const pair = page.locator('.protocol-exchange-pair').first();
  expect((await pair.evaluate((el) => getComputedStyle(el).gridTemplateColumns)).split(' ')).toHaveLength(2);
  await page.screenshot({ path: 'test-results/protocol-exchange-desktop.png', fullPage: true });
  const figure = page.locator('.protocol-exchange'); const light = await figure.evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
  expect(await figure.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(light);
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await pair.evaluate((el) => getComputedStyle(el).gridTemplateColumns)).split(' ')).toHaveLength(1);
  await page.locator('[data-variant="error"] > summary').click();
  expect(await page.getByRole('region', { name: 'Body response — Không được phép', exact: true }).evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/protocol-exchange-mobile-dark.png', fullPage: true });
});

test('without JS every message remains readable through native disclosures', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); await page.goto(url);
  await expect(page.getByRole('button')).toHaveCount(0);
  await expect(page.locator('.protocol-exchange-message').nth(1)).toContainText('9007199254740993');
  await page.locator('[data-variant="error"] > summary').click(); await expect(page.locator('[data-variant="error"] pre')).toContainText('unauthorized');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});
