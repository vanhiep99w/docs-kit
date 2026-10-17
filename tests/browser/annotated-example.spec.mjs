import { test, expect } from '@playwright/test';

const url = '/?case=annotated';

test('selects all ranges by mouse and keyboard without moving focus or hiding prose', async ({ page, context }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  const notes = page.getByRole('list', { name: 'Chú thích code' });
  const first = notes.getByRole('link', { name: /Ghép pipeline/ });
  const second = notes.getByRole('link', { name: /Bắt đầu execution/ });
  await first.click();
  await expect(first).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('[data-highlighted="true"]')).toHaveCount(4);
  await second.focus(); await page.keyboard.press('Enter');
  await expect(second).toHaveAttribute('aria-current', 'true');
  await expect(second).toBeFocused();
  await expect(first).not.toHaveAttribute('aria-current');
  await expect(page.locator('[data-highlighted="true"]')).toHaveCount(2);
  await expect(page.locator('[data-line="3"]')).toHaveAttribute('data-highlighted', 'true');
  await expect(page.locator('[data-line="8"]')).toHaveAttribute('data-highlighted', 'true');
  await expect(notes).toContainText('filter giữ 2');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Sao chép code' }).click();
  await expect(page.getByRole('status')).toHaveText('Đã sao chép code.');
  const original = await page.locator('#data').evaluate((el) => JSON.parse(el.textContent).example.code);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(original);
  expect(errors).toEqual([]);
});

test('failed clipboard access has accessible feedback', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) } }));
  await page.goto(url);
  await page.getByRole('button', { name: 'Sao chép code' }).click();
  await expect(page.getByRole('status')).toContainText('Không thể sao chép');
});

test('responsive layout keeps wide code inside its viewport and follows host dark theme', async ({ page }) => {
  await page.goto(url);
  const layout = page.locator('.annotated-example-layout');
  expect((await layout.evaluate((el) => getComputedStyle(el).gridTemplateColumns)).split(' ')).toHaveLength(2);
  await page.screenshot({ path: 'test-results/annotated-desktop.png', fullPage: true });
  const token = page.locator('.annotated-example-token').first();
  const light = await token.evaluate((el) => getComputedStyle(el).color);
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
  expect(await token.evaluate((el) => getComputedStyle(el).color)).not.toBe(light);
  await page.evaluate(() => { delete document.documentElement.dataset.theme; document.body.classList.add('dark'); });
  expect(await token.evaluate((el) => getComputedStyle(el).color)).not.toBe(light);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await layout.evaluate((el) => getComputedStyle(el).gridTemplateColumns)).split(' ')).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const code = page.locator('.annotated-example-code');
  expect(await code.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await page.getByRole('link', { name: /Bắt đầu execution/ }).click();
  await expect(page.locator('[data-line="8"]')).toHaveAttribute('data-highlighted', 'true');
  await page.screenshot({ path: 'test-results/annotated-mobile-dark.png', fullPage: true });
});

test('source adapter opens the existing drawer and is optional outside a provider', async ({ page }) => {
  await page.goto('/?case=annotated-source');
  await page.getByRole('link', { name: /Mở source đầy đủ/ }).click();
  await expect(page.locator('.source-drawer')).toBeVisible();
  await expect(page.locator('.source-drawer')).toContainText('export const demo = 1;');
  await page.goBack();
  await expect(page.locator('.source-drawer')).toHaveCount(0);
  await expect(page.locator('.annotated-example')).toBeVisible();
  await page.goto('/?case=annotated-no-provider');
  await expect(page.getByRole('link', { name: /Mở source đầy đủ/ })).toHaveAttribute('href', '?source=demo&file=src%2Fmain.ts&lines=1');
  await expect(page.locator('.source-drawer')).toHaveCount(0);
});

test('all code and explanations remain available without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(url);
  await expect(page.getByRole('button', { name: 'Sao chép code' })).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Chú thích code' })).toContainText('Source phát đồng bộ');
  await expect(page.locator('[data-line="8"]')).toContainText('result$.subscribe');
  const link = page.getByRole('link', { name: /Bắt đầu execution/ });
  await link.click();
  await expect(page.locator('.annotated-example-line:target')).toHaveAttribute('data-line', '3');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await context.close();
});
