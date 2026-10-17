import { test, expect } from '@playwright/test';

test('copies lossless JSON values, escaped paths, empty keys and complete root text', async ({ page, context }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/?case=inspector');
  const payload = await page.locator('#data').evaluate((el) => JSON.parse(el.textContent).inspector.json);
  await page.getByRole('button', { name: 'Sao chép value', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(payload);
  await page.getByRole('button', { name: 'Sao chép path', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('');
  for (const [pointer, value] of [['/sequence', '9007199254740993'], ['/value/name', '"xin chào 👋"'], ['/value/details/a~1b/~0', 'true'], ['/', '"empty key"']]) {
    await page.getByRole('button', { name: 'Chọn ' + pointer, exact: true }).click();
    await page.getByRole('button', { name: 'Sao chép path', exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(pointer);
    await page.getByRole('button', { name: 'Sao chép value', exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(value);
  }
  await expect(page.getByRole('status', { name: 'Sao chép', exact: true })).toHaveText('Đã sao chép JSON value.');
  expect(errors).toEqual([]);
});

test('literal search reveals match ancestors, retains selection and reports empty results', async ({ page }) => {
  await page.goto('/?case=inspector');
  const search = page.getByRole('searchbox', { name: 'Tìm field, path hoặc giá trị' });
  await search.fill('abc-001');
  await expect(page.getByRole('status', { name: 'Kết quả tìm kiếm' })).toContainText('1 kết quả');
  await expect(page.locator('.data-inspector-node[data-match="true"]')).toHaveAttribute('data-pointer', '/value/items/0/sku');
  await expect(page.getByRole('button', { name: 'Chọn /value/items/0/sku', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mở tất cả', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Thu tất cả', exact: true })).toBeDisabled();
  await search.fill('.*');
  await expect(page.getByText('Không tìm thấy field phù hợp.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'SKU sản phẩm', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(page.locator('.data-inspector-node:target')).toHaveAttribute('data-pointer', '/value/items/0/sku');
  await expect(page.locator('.data-inspector-selection')).toContainText('/value/items/0/sku');
  await expect(page.getByRole('button', { name: 'Mở tất cả', exact: true })).toBeEnabled();
});

test('summary keyboard, expand/collapse all and annotation reveal remain consistent', async ({ page }) => {
  await page.goto('/?case=inspector');
  const unopened = page.locator('.data-inspector-node[data-pointer="/unopened"] > details');
  await expect(unopened).not.toHaveAttribute('open');
  await unopened.locator(':scope > summary').focus(); await page.keyboard.press('Enter');
  await expect(unopened).toHaveAttribute('open', '');
  await page.keyboard.press('Enter'); await expect(unopened).not.toHaveAttribute('open');
  await page.getByRole('button', { name: 'Mở tất cả', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Chọn /unopened/child/status', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Thu tất cả', exact: true }).click();
  await expect(page.locator('.data-inspector-node[data-pointer=""] > details')).not.toHaveAttribute('open');
  await page.getByRole('link', { name: 'Key có slash và tilde', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Chọn /value/details/a~1b/~0', exact: true })).toBeVisible();
  await expect(page.locator('.data-inspector-node:target')).toHaveAttribute('data-pointer', '/value/details/a~1b/~0');
});

test('clipboard failure leaves native full JSON available', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) } }));
  await page.goto('/?case=inspector');
  await page.getByRole('button', { name: 'Sao chép value', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Sao chép', exact: true })).toContainText('Không thể sao chép');
  await page.locator('.data-inspector-source > summary').click();
  await expect(page.getByRole('region', { name: 'JSON gốc đầy đủ' })).toContainText('9007199254740993');
});

test('host dark mode, mobile and reduced motion keep tree and raw source contained', async ({ page }) => {
  await page.goto('/?case=inspector');
  await page.screenshot({ path: 'test-results/data-inspector-desktop.png', fullPage: true });
  const light = await page.locator('.data-inspector').evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
  const dark = await page.locator('.data-inspector').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(dark).not.toBe(light);
  await page.evaluate(() => { delete document.documentElement.dataset.theme; document.body.classList.add('dark'); });
  expect(await page.locator('.data-inspector').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(dark);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.data-inspector-source > summary').click();
  const raw = page.getByRole('region', { name: 'JSON gốc đầy đủ' });
  expect(await raw.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/data-inspector-mobile-dark.png', fullPage: true });
});

test('scalar roots remain exact and interactions do not request external data', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/?case=inspector-scalar');
  const requests = []; page.on('request', (req) => requests.push(req.url()));
  await expect(page.locator('.data-inspector-value')).toHaveText('1e309');
  await page.getByRole('button', { name: 'Sao chép value', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('1e309');
  await page.getByRole('searchbox').fill('1e309');
  await expect(page.getByRole('status', { name: 'Kết quả tìm kiếm' })).toContainText('1 kết quả');
  expect(requests).toEqual([]);
});

test('without JS annotation ancestors and native source disclosure retain complete content', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto('/?case=inspector');
  await expect(page.getByRole('searchbox')).toHaveCount(0);
  await expect(page.getByRole('button')).toHaveCount(0);
  await expect(page.locator('.data-inspector-node[data-pointer="/value/items/0/sku"]')).toBeVisible();
  await page.getByRole('link', { name: 'SKU sản phẩm', exact: true }).click();
  await expect(page.locator('.data-inspector-node:target')).toHaveAttribute('data-pointer', '/value/items/0/sku');
  const unopened = page.locator('.data-inspector-node[data-pointer="/unopened"] > details');
  await unopened.locator(':scope > summary').click(); await expect(unopened).toHaveAttribute('open', '');
  await page.locator('.data-inspector-source > summary').click();
  await expect(page.getByRole('region', { name: 'JSON gốc đầy đủ' })).toContainText('long-value-'.repeat(25));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await context.close();
});
