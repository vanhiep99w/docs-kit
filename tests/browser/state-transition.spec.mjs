import { test, expect } from '@playwright/test';

const url = '/?case=state-model';
const choose = (page, id) => page.locator(`[data-transition-choice="${id}"] button`);
const status = (page) => page.getByRole('status', { name: 'Trạng thái mô hình', exact: true });
const history = (page) => page.getByRole('region', { name: 'Đường đi đã chọn', exact: true });

test('same-event branches are chosen explicitly, self-loops retain a history entry and disappearing controls preserve focus', async ({ page }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  await expect(page.locator('[data-transition-choice]')).toHaveCount(3);
  await expect(choose(page, 'below-threshold')).toHaveAccessibleDescription(/giả định.*dưới ngưỡng/i);
  await choose(page, 'below-threshold').focus(); await page.keyboard.press('Enter');
  await expect(status(page)).toHaveText('Closed · 1 chuyển đã chọn');
  await expect(page.getByRole('heading', { name: 'Hiện tại: Closed', exact: true })).toBeFocused();
  await expect(history(page).locator('ol > li')).toHaveCount(1);
  await choose(page, 'trip').click();
  await expect(status(page)).toHaveText('Open · 2 chuyển đã chọn');
  await expect(page.getByRole('heading', { name: 'Hiện tại: Open', exact: true })).toBeFocused();
  const last = page.getByRole('region', { name: 'Chuyển trạng thái vừa chọn', exact: true });
  await expect(last).toContainText('Closed'); await expect(last).toContainText('REQUEST_FAILED'); await expect(last).toContainText('Open');
  await expect(last).toContainText('Đã đạt ngưỡng');
  await expect(choose(page, 'cooldown')).toBeVisible();
  expect(errors).toEqual([]);
});

test('terminal states, back and reset operate on the authored path without losing toolbar focus', async ({ page }) => {
  await page.goto('/?case=state-form');
  await choose(page, 'submit').click(); await choose(page, 'resolve').click();
  await expect(status(page)).toHaveText('Success · 2 chuyển đã chọn');
  await expect(page.locator('[data-transition-choice]')).toHaveCount(0);
  await expect(page.getByText('Đây là trạng thái kết thúc do tác giả khai báo.', { exact: true })).toBeVisible();
  const back = page.getByRole('button', { name: '← Quay lại', exact: true });
  await back.focus(); await page.keyboard.press('Enter');
  await expect(status(page)).toHaveText('Submitting · 1 chuyển đã chọn');
  await expect(back).toBeFocused();
  await choose(page, 'cancel').click();
  await expect(status(page)).toHaveText('Cancelled · 2 chuyển đã chọn');
  const reset = page.getByRole('button', { name: 'Về ban đầu', exact: true });
  await reset.click();
  await expect(status(page)).toHaveText('Idle · 0 chuyển đã chọn');
  await expect(history(page).locator('ol')).toHaveCount(0);
  await expect(reset).toBeFocused();
  await expect(back).toHaveAttribute('aria-disabled', 'true');
  await back.focus(); await page.keyboard.press('Enter');
  await expect(status(page)).toHaveText('Idle · 0 chuyển đã chọn');
  await page.goto('/?case=state-dead-end');
  await expect(page.getByText('Không có chuyển tiếp từ trạng thái này; không tự suy ra đây là trạng thái kết thúc.', { exact: true })).toBeVisible();
});

test('history links open full references; inspecting states and transitions does not change the current state', async ({ page }) => {
  await page.goto(url); await choose(page, 'trip').click();
  const reference = page.locator('.state-transition-reference');
  await expect(reference).not.toHaveAttribute('open');
  await history(page).getByRole('link', { name: 'Chi tiết bước 1: REQUEST_FAILED', exact: true }).click();
  await expect(reference).toHaveAttribute('open', '');
  await expect(page.locator('.state-transition-table-scroll tr:target')).toContainText('Đã đạt ngưỡng');
  await page.locator('.state-transition-table-scroll tr:target').getByRole('link', { name: 'Closed', exact: true }).click();
  await expect(page.locator('.state-transition-states > div:target')).toContainText('Closed');
  await expect(status(page)).toHaveText('Open · 1 chuyển đã chọn');
  await expect(reference.locator('tbody tr')).toHaveCount(7);
});

test('history cap stops traversal without discarding the prefix, and back/reset allow continuing', async ({ page }) => {
  await page.goto(url);
  for (let i = 0; i < 128; i++) await choose(page, 'healthy').evaluate((button) => button.click());
  await expect(status(page)).toHaveText('Closed · 128 chuyển đã chọn');
  await expect(history(page).locator('ol > li')).toHaveCount(128);
  await expect(choose(page, 'healthy')).toHaveAttribute('aria-disabled', 'true');
  await choose(page, 'healthy').focus(); await page.keyboard.press('Enter');
  await expect(status(page)).toHaveText('Closed · 128 chuyển đã chọn');
  await expect(page.locator('.state-transition-limit')).toContainText('lịch sử không bị cắt âm thầm');
  await page.getByRole('button', { name: '← Quay lại', exact: true }).click();
  await expect(status(page)).toHaveText('Closed · 127 chuyển đã chọn');
  await expect(choose(page, 'trip')).toHaveAttribute('aria-disabled', 'false');
  await choose(page, 'trip').click();
  await expect(status(page)).toHaveText('Open · 128 chuyển đã chọn');
  await page.getByRole('button', { name: 'Về ban đầu', exact: true }).click();
  await expect(status(page)).toHaveText('Closed · 0 chuyển đã chọn');
});

test('replacing a model with identical IDs clears the path and old transition explanation', async ({ page }) => {
  await page.goto(url); await choose(page, 'trip').click();
  await page.getByRole('button', { name: 'Đổi mô hình', exact: true }).click();
  await expect(status(page)).toHaveText('Closed mới · 0 chuyển đã chọn');
  await expect(history(page).locator('ol > li')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Chuyển trạng thái vừa chọn', exact: true })).toHaveCount(0);
  await expect(choose(page, 'trip')).toBeVisible();
});

test('guard/effect strings are never executed and elapsed time never fires a transition', async ({ page }) => {
  const dialogs = []; page.on('dialog', async (dialog) => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?case=state-unsafe-looking');
  const requests = []; page.on('request', (request) => requests.push(request.url()));
  await choose(page, 'trip').click();
  await expect(status(page)).toHaveText('Open · 1 chuyển đã chọn');
  expect(await page.evaluate(() => globalThis.__stateGuardRuns)).toBeUndefined();
  await page.clock.install(); await page.clock.runFor(60_000);
  await expect(status(page)).toHaveText('Open · 1 chuyển đã chọn');
  expect(requests).toEqual([]); expect(dialogs).toEqual([]); expect(errors).toEqual([]);
  await choose(page, 'cooldown').click();
  await expect(status(page)).toHaveText('Half-open · 2 chuyển đã chọn');
});

test('light/dark, mobile keyboard controls, reduced motion and wide reference table remain contained', async ({ page }) => {
  await page.goto(url);
  await choose(page, 'trip').click();
  await page.screenshot({ path: 'test-results/state-transition-desktop.png', fullPage: true });
  const figure = page.locator('.state-transition');
  const light = await figure.evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
  const dark = await figure.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(dark).not.toBe(light);
  await page.evaluate(() => { delete document.documentElement.dataset.theme; document.body.classList.add('dark'); });
  expect(await figure.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(dark);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await page.locator('.state-transition-layout').evaluate((el) => getComputedStyle(el).gridTemplateColumns)).split(' ')).toHaveLength(1);
  await choose(page, 'cooldown').focus(); await page.keyboard.press('Enter');
  await expect(status(page)).toHaveText('Half-open · 2 chuyển đã chọn');
  await page.locator('.state-transition-reference > summary').click();
  const table = page.locator('.state-transition-table-scroll');
  expect(await table.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/state-transition-mobile-dark.png', fullPage: true });
});

test('without JavaScript, native reference disclosure exposes every state, branch, condition and effect', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); await page.goto('http://127.0.0.1:4178/?case=state-form');
  await expect(page.locator('.state-transition').getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Hiện tại: Idle', exact: true })).toBeVisible();
  const reference = page.locator('.state-transition-reference');
  await reference.locator(':scope > summary').focus(); await page.keyboard.press('Enter');
  await expect(reference).toHaveAttribute('open', '');
  await expect(reference.locator('.state-transition-states > div')).toHaveCount(5);
  await expect(reference.locator('tbody tr')).toHaveCount(7);
  await expect(reference).toContainText('Kết thúc · success');
  await expect(reference).toContainText('Giả định được phép retry');
  await expect(reference).toContainText('không thực thi thao tác hủy thật');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});
