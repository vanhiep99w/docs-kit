import { test, expect } from '@playwright/test';
const url = '/?case=walkthrough';
const picker = (page) => page.getByRole('combobox', { name: 'Chọn bước' });
const panel = (page, id) => page.locator(`.code-walkthrough-code[data-snapshot="${id}"]`);

test('step navigation handles boundaries, ordered revisits, keyboard selection and data replacement', async ({ page }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  const previous = page.getByRole('button', { name: 'Bước trước', exact: true });
  const next = page.getByRole('button', { name: 'Bước sau', exact: true });
  await expect(previous).toBeDisabled();
  const requests = []; page.on('request', (request) => requests.push(request.url()));
  await next.focus(); await page.keyboard.press('Enter');
  await expect(next).toBeFocused(); await expect(picker(page)).toHaveValue('1');
  await expect(panel(page, 'after')).toBeVisible(); await expect(panel(page, 'before')).toBeHidden();
  await picker(page).focus(); await page.keyboard.press('ArrowDown');
  await expect(picker(page)).toHaveValue('2');
  await next.click(); await expect(picker(page)).toHaveValue('3'); await expect(next).toBeDisabled();
  await expect(panel(page, 'before')).toBeVisible();
  await previous.click(); await expect(picker(page)).toHaveValue('2');
  expect(new URL(page.url()).hash).toBe(''); expect(requests).toEqual([]);
  await page.getByRole('button', { name: 'Đổi dữ liệu ví dụ' }).click();
  await expect(picker(page)).toHaveValue('0'); await expect(previous).toBeDisabled();
  await expect(panel(page, 'before')).toContainText('value = 91');
  expect(errors).toEqual([]);
});

test('selecting a distant range highlights all ranges and scrolls only the code viewport', async ({ page }) => {
  await page.goto(url);
  const scroll = await page.evaluate(() => scrollY);
  await picker(page).selectOption('2');
  const after = panel(page, 'after');
  await expect(after.locator('[data-highlighted="true"]')).toHaveCount(2);
  await expect(after.locator('[data-line="72"]')).toHaveAttribute('data-highlighted', 'true');
  await expect.poll(() => after.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => scrollY)).toBe(scroll);
  await expect(page.locator('.code-walkthrough-note')).toContainText('Hai vùng ở xa nhau');
});

test('copy keeps exact snapshot source, CRLF and Unicode, and reports clipboard denial', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(url);
  const data = await page.locator('#data').evaluate((el) => JSON.parse(el.textContent).walkthrough);
  for (const index of [0, 1, 2, 3]) {
    await picker(page).selectOption(String(index));
    await page.getByRole('button', { name: 'Sao chép code', exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(data.snapshots.find((s) => s.id === data.steps[index].snapshot).code);
    await expect(page.locator('.code-walkthrough-sr-only[role="status"]')).toHaveText('Đã sao chép code.');
  }
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) } }));
  await page.getByRole('button', { name: 'Sao chép code', exact: true }).click();
  await expect(page.locator('.code-walkthrough-sr-only[role="status"]')).toContainText('Không thể sao chép');
});

test('source adapter opens the selected snapshot and has URL fallback without provider', async ({ page }) => {
  await page.goto('/?case=walkthrough-source');
  for (const [index, code] of [['0', 'export const demo = 0;'], ['1', 'export const demo = 1;']]) {
    await picker(page).selectOption(index);
    await page.getByRole('link', { name: /Mở source đầy đủ/ }).click();
    await expect(page.locator('.source-drawer')).toContainText(code);
    await page.goBack(); await expect(page.locator('.source-drawer')).toHaveCount(0);
  }
  await page.goto('/?case=walkthrough-no-provider');
  await expect(page.getByRole('link', { name: /Mở source đầy đủ/ })).toHaveAttribute('href', '?source=demo&snapshot=v0&file=src%2Fmain.ts');
});

test('terminal keeps readable dark tokens, contained mobile scroll and no redundant panels', async ({ page }) => {
  await page.goto(url); await picker(page).selectOption('2');
  const color = await page.locator('.code-walkthrough-token').first().evaluate((el) => getComputedStyle(el).color);
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
  expect(await page.locator('.code-walkthrough-token').first().evaluate((el) => getComputedStyle(el).color)).toBe(color);
  await expect(page.locator('.code-walkthrough-info, .annotated-example, .code-walkthrough-snapshots')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/code-walkthrough-desktop.png', fullPage: true });
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.setViewportSize({ width: 390, height: 844 });
  expect(await panel(page, 'after').evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/code-walkthrough-mobile.png', fullPage: true });
});

test('without JS all snapshots and authored step notes are readable', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); await page.goto(url);
  await expect(page.getByRole('button', { name: 'Sao chép code', exact: true })).toHaveCount(0);
  await expect(panel(page, 'before')).toBeVisible(); await expect(panel(page, 'after')).toBeVisible();
  await expect(page.locator('.code-walkthrough ol')).toContainText('Thứ tự bước không phải lịch sử Git.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});
