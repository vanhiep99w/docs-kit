import { test, expect } from '@playwright/test';

const url = '/?case=walkthrough';
const nav = (page) => page.getByRole('navigation', { name: 'Các bước walkthrough', exact: true });
const step = (page, id) => nav(page).locator(`[data-step="${id}"] a`);
const panel = (page, id) => page.locator(`.code-walkthrough-snapshots > [data-snapshot="${id}"]`);

test('previous/next and ordered revisits retain focus, respect boundaries and do not navigate or fetch', async ({ page }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  const requests = []; page.on('request', (request) => requests.push(request.url()));
  const previous = nav(page).getByRole('button', { name: '← Bước trước', exact: true });
  const next = nav(page).getByRole('button', { name: 'Bước sau →', exact: true });
  await expect(previous).toHaveAttribute('aria-disabled', 'true');
  await previous.focus(); await page.keyboard.press('Enter');
  await expect(step(page, 'old')).toHaveAttribute('aria-current', 'step');
  await next.focus(); await page.keyboard.press('Enter');
  await expect(next).toBeFocused();
  await expect(step(page, 'new')).toHaveAttribute('aria-current', 'step');
  await expect(panel(page, 'after')).toHaveAttribute('open', '');
  await expect(panel(page, 'before')).not.toHaveAttribute('open');
  await page.keyboard.press('Enter');
  await expect(step(page, 'log')).toHaveAttribute('aria-current', 'step');
  await page.keyboard.press('Enter');
  await expect(step(page, 'revisit')).toHaveAttribute('aria-current', 'step');
  await expect(panel(page, 'before')).toHaveAttribute('open', '');
  await expect(next).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Enter');
  await expect(step(page, 'revisit')).toHaveAttribute('aria-current', 'step');
  await previous.click();
  await expect(step(page, 'log')).toHaveAttribute('aria-current', 'step');
  expect(new URL(page.url()).hash).toBe('');
  expect(requests).toEqual([]); expect(errors).toEqual([]);
});

test('step links and existing annotation links synchronize selection, all ranges and only the code viewport scroll', async ({ page }) => {
  await page.goto(url);
  await step(page, 'log').focus();
  const scroll = await page.evaluate(() => scrollY);
  await page.keyboard.press('Enter');
  await expect(step(page, 'log')).toBeFocused();
  const after = panel(page, 'after');
  await expect(after.locator('[data-highlighted="true"]')).toHaveCount(2);
  await expect(after.locator('[data-line="72"]')).toHaveAttribute('data-highlighted', 'true');
  await expect(after.locator('[data-line="1"]')).toHaveAttribute('data-highlighted', 'true');
  await expect.poll(() => after.locator('pre').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => scrollY)).toBe(scroll);
  const note = after.getByRole('list', { name: 'Chú thích code', exact: true }).getByRole('link', { name: /Đổi giá trị/ });
  await note.click();
  await expect(note).toBeFocused();
  await expect(step(page, 'new')).toHaveAttribute('aria-current', 'step');
  await expect(after.locator('[data-highlighted="true"]')).toHaveCount(1);
  await expect(after.getByRole('list', { name: 'Chú thích code', exact: true })).toContainText('Hai vùng ở xa nhau');
});

test('copy preserves the whole chosen snapshot, Unicode, CRLF and final newline rather than highlighted lines', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(url);
  const data = await page.locator('#data').evaluate((el) => JSON.parse(el.textContent).walkthrough);
  for (const [id, snapshotId] of [['old', 'before'], ['new', 'after'], ['log', 'after'], ['revisit', 'before']]) {
    await step(page, id).click();
    const snapshot = panel(page, snapshotId);
    await snapshot.getByRole('button', { name: 'Sao chép code', exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(data.snapshots.find((entry) => entry.id === snapshotId).code);
    await expect(snapshot.getByRole('status')).toHaveText('Đã sao chép code.');
    await expect(step(page, id)).toHaveAttribute('aria-current', 'step');
  }
});

test('clipboard denial retains code and accessible feedback through the existing Annotated Example', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) } }));
  await page.goto(url);
  const before = panel(page, 'before');
  await before.getByRole('button', { name: 'Sao chép code', exact: true }).click();
  await expect(before.getByRole('status')).toContainText('Không thể sao chép');
  await expect(before.locator('[data-line="1"]')).toContainText('const value = 1;');
});

test('data replacement with the same IDs resets the step, disclosures and controlled highlights', async ({ page }) => {
  await page.goto(url);
  await step(page, 'log').click();
  await expect(panel(page, 'after')).toHaveAttribute('open', '');
  await page.getByRole('button', { name: 'Đổi dữ liệu ví dụ', exact: true }).click();
  await expect(step(page, 'old')).toHaveAttribute('aria-current', 'step');
  await expect(panel(page, 'before')).toHaveAttribute('open', '');
  await expect(panel(page, 'after')).not.toHaveAttribute('open');
  await expect(panel(page, 'before').locator('[data-line="1"]')).toContainText('value = 91');
  await expect(panel(page, 'before').locator('[data-highlighted="true"]')).toHaveCount(1);
  await expect(page.getByRole('status', { name: 'Bước đang chọn', exact: true })).toContainText('Bước 1/4');
});

test('optional source adapter opens the correct snapshot and remains a plain reference outside a provider', async ({ page }) => {
  await page.goto('/?case=walkthrough-source');
  for (const [id, snapshot, code] of [['old', 'before', 'export const demo = 0;'], ['new', 'after', 'export const demo = 1;']]) {
    await step(page, id).click();
    await panel(page, snapshot).getByRole('link', { name: /Mở source đầy đủ/ }).click();
    await expect(page.locator('.source-drawer')).toBeVisible();
    await expect(page.locator('.source-drawer')).toContainText(code);
    await page.goBack();
    await expect(page.locator('.source-drawer')).toHaveCount(0);
    await expect(step(page, id)).toHaveAttribute('aria-current', 'step');
  }
  await page.goto('/?case=walkthrough-no-provider');
  await expect(panel(page, 'before').getByRole('link', { name: /Mở source đầy đủ/ })).toHaveAttribute('href', '?source=demo&snapshot=v0&file=src%2Fmain.ts');
  await expect(page.locator('.source-drawer')).toHaveCount(0);
});

test('mobile layout, light/dark tokens and reduced motion use Annotated Example without page overflow', async ({ page }) => {
  await page.goto(url);
  await step(page, 'log').click();
  await page.screenshot({ path: 'test-results/code-walkthrough-desktop.png', fullPage: true });
  const after = panel(page, 'after'); const token = after.locator('.annotated-example-token').first();
  const light = await token.evaluate((el) => getComputedStyle(el).color);
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
  const dark = await token.evaluate((el) => getComputedStyle(el).color);
  expect(dark).not.toBe(light);
  await page.evaluate(() => { delete document.documentElement.dataset.theme; document.body.classList.add('dark'); });
  expect(await token.evaluate((el) => getComputedStyle(el).color)).toBe(dark);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await after.locator('.annotated-example-layout').evaluate((el) => getComputedStyle(el).gridTemplateColumns)).split(' ')).toHaveLength(1);
  expect(await after.locator('pre').evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/code-walkthrough-mobile-dark.png', fullPage: true });
});

test('without JavaScript, every snapshot and step explanation remains readable with native disclosures and line anchors', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); await page.goto('http://127.0.0.1:4178' + url);
  await expect(nav(page).getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sao chép code', exact: true })).toHaveCount(0);
  const after = panel(page, 'after');
  await after.locator(':scope > summary').focus(); await page.keyboard.press('Enter');
  await expect(after).toHaveAttribute('open', '');
  await expect(after.getByRole('list', { name: 'Chú thích code', exact: true })).toContainText('Hai vùng ở xa nhau');
  await after.getByRole('link', { name: /Đọc dòng cuối/ }).click();
  await expect(after.locator('.annotated-example-line:target')).toHaveAttribute('data-line', '72');
  await expect(panel(page, 'before')).toContainText('Thứ tự bước không phải lịch sử Git.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});
