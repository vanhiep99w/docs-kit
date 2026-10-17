import { test, expect } from '@playwright/test';

test('copies complete originals exactly, without gutters, folded summaries or diff signs', async ({ page, context }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/?case=diff');
  const data = await page.locator('#data').evaluate((el) => JSON.parse(el.textContent).diff);
  for (const [side, label] of [['before', 'trước'], ['after', 'sau']]) {
    const button = page.getByRole('button', { name: 'Sao chép bản ' + label, exact: true });
    await button.focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toHaveText('Đã sao chép bản ' + label + '.');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(data[side].code);
    await expect(button).toBeFocused();
  }
  await expect(page.locator('.code-diff-no-newline')).toHaveCount(0); // Both sides omit the final newline: no redundant inline note.
  await page.locator('.code-diff-info > summary').click();
  await expect(page.locator('.code-diff-info')).toContainText('Không có newline cuối');
  expect(errors).toEqual([]);
});

test('line references remain side-specific after insertion and annotated equal lines stay visible', async ({ page }) => {
  await page.goto('/?case=diff');
  await page.getByRole('link', { name: 'Giá trị cũ' }).click();
  await expect(page.locator('.code-diff-number:target')).toHaveAttribute('data-before-line', '9');
  await page.getByRole('link', { name: 'Giá trị mới' }).click();
  await expect(page.locator('.code-diff-number:target')).toHaveAttribute('data-after-line', '10');
  await expect(page.locator('.code-diff-number:target').locator('..')).toHaveAttribute('data-type', 'add');
  const pinned = page.locator('[data-after-line="3"]');
  await expect(pinned).toBeVisible();
  await page.getByRole('link', { name: 'Dòng không đổi cần giải thích' }).click();
  await expect(pinned).toHaveJSProperty('id', decodeURIComponent(new URL(page.url()).hash.slice(1)));
});

test('unchanged sections use keyboard-native disclosure and do not fetch extra data', async ({ page }) => {
  await page.goto('/?case=diff');
  const requests = []; page.on('request', (req) => requests.push(req.url()));
  const fold = page.locator('.code-diff-fold').first();
  await expect(fold).not.toHaveAttribute('open');
  await fold.locator('summary').focus(); await page.keyboard.press('Enter');
  await expect(fold).toHaveAttribute('open', '');
  await expect(fold).toContainText('shared header 1');
  await page.keyboard.press('Enter');
  await expect(fold).not.toHaveAttribute('open');
  expect(requests).toEqual([]);
});

test('clipboard failure leaves code readable with an accessible error', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) } }));
  await page.goto('/?case=diff');
  await page.getByRole('button', { name: 'Sao chép bản sau', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Không thể sao chép');
  await expect(page.locator('[data-after-line="10"]').locator('..')).toContainText('const value = 2;');
});

test('responsive inline diff keeps wide lines scrollable and uses the host theme', async ({ page }) => {
  await page.goto('/?case=diff');
  await page.screenshot({ path: 'test-results/code-diff-desktop.png', fullPage: true });
  const token = page.locator('[data-after-line="10"]').locator('..').locator('.code-diff-token').first();
  const light = await token.evaluate((el) => getComputedStyle(el).color);
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
  expect(await token.evaluate((el) => getComputedStyle(el).color)).not.toBe(light);
  await page.evaluate(() => { delete document.documentElement.dataset.theme; document.body.classList.add('dark'); });
  expect(await token.evaluate((el) => getComputedStyle(el).color)).not.toBe(light);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const scroll = page.getByRole('region', { name: 'Diff: Giữ đúng số dòng sau khi chèn' });
  expect(await scroll.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await expect(page.getByRole('list', { name: 'Giải thích thay đổi' })).toBeVisible();
  await page.screenshot({ path: 'test-results/code-diff-mobile-dark.png', fullPage: true });
});

test('optional Source Explorer adapter opens the correct file snapshot for each side', async ({ page }) => {
  await page.goto('/?case=diff-source');
  await page.getByRole('link', { name: 'Source trước', exact: true }).click();
  await expect(page.locator('.source-drawer')).toContainText('export const demo = 0;');
  await expect(page).toHaveURL(/snapshot=v0/);
  await page.goBack(); await expect(page.locator('.source-drawer')).toHaveCount(0);
  await page.getByRole('link', { name: 'Source sau', exact: true }).click();
  await expect(page.locator('.source-drawer')).toContainText('export const demo = 1;');
  await expect(page).toHaveURL(/snapshot=v1/);
  await page.goto('/?case=diff-no-provider');
  await expect(page.getByRole('link', { name: 'Source trước', exact: true })).toHaveAttribute('href', /snapshot=v0/);
  await expect(page.locator('.source-drawer')).toHaveCount(0);
});

test('all edits, annotations and unchanged source remain available without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto('/?case=diff');
  await expect(page.getByRole('button', { name: /Sao chép bản/ })).toHaveCount(0);
  await expect(page.locator('.code-diff-row[data-type="add"]').first()).toBeVisible();
  await expect(page.locator('.code-diff-row[data-type="remove"]').first()).toBeVisible();
  const fold = page.locator('.code-diff-fold').first();
  await fold.locator('summary').click(); await expect(fold).toContainText('shared header 1');
  await page.getByRole('link', { name: 'Giá trị mới' }).click();
  await expect(page.locator('.code-diff-number:target')).toHaveAttribute('data-after-line', '10');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await context.close();
});
