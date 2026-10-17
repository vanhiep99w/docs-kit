import { test, expect } from '@playwright/test';

async function explore(page, mode = 'static') {
  await page.goto(`/?case=${mode}`);
  await page.getByRole('button', { name: /^Explore/ }).click();
  await expect(page.getByRole('group', { name: 'Diagram controls' })).toBeVisible();
}

test('loads viewer on demand, supports zoom/pan, copy, download and native modal focus', async ({ page, context }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  const requests = []; page.on('request', (request) => requests.push(request.url()));
  await page.goto('/');
  const count = requests.filter((url) => url.endsWith('.js')).length;
  await page.getByRole('button', { name: /^Explore/ }).click();
  await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible();
  expect(requests.filter((url) => url.endsWith('.js')).length).toBeGreaterThan(count);
  expect(requests.some((url) => /wasm|d2\.wasm/.test(url))).toBe(false);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.getByRole('button', { name: 'Reset zoom' })).toHaveText('125%');
  const viewport = page.locator('.d2-viewport');
  await viewport.focus(); await page.keyboard.press('-');
  await expect(page.getByRole('button', { name: 'Reset zoom' })).toHaveText('100%');
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  expect(await page.getByRole('button', { name: 'Reset zoom' }).textContent()).not.toBe('100%');
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  const box = await viewport.boundingBox();
  await page.mouse.move(box.x + 500, box.y + 190); await page.mouse.down(); await page.mouse.move(box.x + 200, box.y + 190, { steps: 8 }); await page.mouse.up();
  expect(await viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy D2' }).click();
  await expect(page.getByRole('status')).toContainText('copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('api -> db');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'SVG ↓', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('demo.svg');
  await page.getByRole('button', { name: 'Expand' }).click();
  await expect(page.getByRole('dialog', { name: 'Architecture overview' })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Expand' })).toBeFocused();
  expect(errors).toEqual([]);
});

test('steps navigate by button/keyboard and play is user-controlled', async ({ page }) => {
  await explore(page, 'steps');
  const counter = page.locator('.d2-step-count');
  await expect(counter).toHaveText('1 / 3');
  await page.getByRole('button', { name: 'Next →' }).click();
  await expect(counter).toHaveText('2 / 3');
  await page.locator('.d2-viewport').focus(); await page.keyboard.press('ArrowRight');
  await expect(counter).toHaveText('3 / 3');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(counter).toHaveText('3 / 3');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
});

test('tabs have roving keyboard focus and selected panel labels', async ({ page }) => {
  await explore(page, 'tabs');
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(2);
  await tabs.first().focus(); await page.keyboard.press('End');
  await expect(tabs.last()).toBeFocused(); await expect(tabs.last()).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', await tabs.last().getAttribute('id'));
  await page.keyboard.press('Home'); await expect(tabs.first()).toBeFocused();
});

test('layer explorer handles SVG drill-down and back links', async ({ page }) => {
  await explore(page, 'explorer');
  await page.locator('.d2-diagram-light a').filter({ hasText: 'API' }).click();
  await expect(page.getByRole('combobox')).toHaveValue('layers.detail');
  await expect(page.locator('.d2-viewport')).toContainText('Handler');
  await page.locator('.d2-diagram-light a').filter({ hasText: 'Handler' }).click();
  await expect(page.getByRole('combobox')).toHaveValue('');
});

test('source links open in-place and Back closes the drawer', async ({ page }) => {
  await explore(page);
  await page.locator('.d2-diagram-light a').click();
  await expect(page.locator('.source-drawer')).toBeVisible();
  await expect(page.locator('.source-drawer')).toContainText('export const demo = 1;');
  await expect(page).toHaveURL(/source=demo/);
  await page.goBack(); await expect(page.locator('.source-drawer')).toHaveCount(0);
  await expect(page.locator('.d2-toolbar')).toBeVisible();
});

test('reduced motion, dark theme and mobile layout remain readable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await explore(page, 'animation');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Motion off' })).toBeDisabled();
  await page.evaluate(() => document.body.classList.add('dark'));
  await expect(page.locator('.d2-viewport .d2-diagram-dark')).toBeVisible();
  await expect(page.locator('.d2-viewport .d2-diagram-light')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/d2-mobile-dark.png', fullPage: true });
});

test('all boards and source remain available without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/?case=steps');
  await page.getByText('All views (3)', { exact: true }).click();
  await expect(page.locator('.d2-board-fallback')).toContainText('rollback');
  await page.getByText('D2 source', { exact: true }).click();
  await expect(page.locator('pre')).toContainText('steps:');
  await context.close();
});


test('a failed viewer chunk leaves static boards and source usable', async ({ page }) => {
  await page.route('**/d2-viewer-*.js', (route) => route.abort());
  await page.goto('/?case=steps');
  await page.getByRole('button', {name:/^Explore/}).click();
  await expect(page.getByRole('alert')).toContainText('static views are still available');
  await page.getByText('All views (3)',{exact:true}).click();
  await expect(page.locator('.d2-board-fallback')).toContainText('rollback');
});

test('source adapter preserves a heading anchor when opening source', async ({ page }) => {
  await page.goto('/#architecture');
  await page.getByRole('button', {name:/^Explore/}).click();
  await page.locator('.d2-diagram-light a').click();
  await expect(page.locator('.source-drawer')).toBeVisible();
  expect(new URL(page.url()).hash).toBe('#architecture');
});
