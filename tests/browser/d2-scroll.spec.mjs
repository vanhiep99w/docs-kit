import { test, expect } from '@playwright/test';

async function open(page) {
  await page.goto('/?case=preview-tall');
  await page.addStyleTag({ content: 'body { min-height: 300vh; }' });
  await expect(page.locator('.d2-viewport')).toBeVisible();
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await page.locator('.d2-viewport').hover();
}

test('wheel over a fitted inline diagram continues scrolling the article', async ({ page }) => {
  await open(page);
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 350);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
});

test('a zoomed inline diagram scrolls internally and hands off at its boundary', async ({ page }) => {
  await open(page);
  const viewport = page.locator('.d2-viewport');
  await viewport.focus(); await page.keyboard.press('0');
  await viewport.hover();
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 100);
  await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
  await viewport.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await page.mouse.wheel(0, 350);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
});

test('fullscreen keeps wheel scrolling from reaching the background article', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  const viewport = page.locator('.d2-viewport');
  await viewport.hover();
  await expect(viewport).toHaveCSS('overscroll-behavior', 'contain');
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 350);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
});
