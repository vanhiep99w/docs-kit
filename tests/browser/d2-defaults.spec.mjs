import { test, expect } from '@playwright/test';

async function expectDefaultScale(page) {
  const size = await page.locator('.d2-diagram-light > svg').evaluate(svg => ({
    width: Number(svg.getAttribute('width')), height: Number(svg.getAttribute('height')),
    viewWidth: svg.viewBox.baseVal.width, viewHeight: svg.viewBox.baseVal.height,
  }));
  // D2 rounds rendered SVG dimensions to whole pixels.
  expect(Math.abs(size.width - size.viewWidth * 0.85)).toBeLessThanOrEqual(1);
  expect(Math.abs(size.height - size.viewHeight * 0.85)).toBeLessThanOrEqual(1);
}

test('a bare D2 fence gets scale 0.85 and working zoom/fit/fullscreen/source controls by default', async ({ page }) => {
  await page.goto('/?case=compiled-default');
  await expect(page.locator('.d2-viewport')).toBeVisible();
  await expectDefaultScale(page);
  for (const name of ['Zoom in', 'Zoom out', 'Fit', 'Fullscreen']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  }
  const canvas = page.locator('.d2-zoom-space');
  const before = await canvas.boundingBox();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  expect((await canvas.boundingBox()).width).toBeGreaterThan(before.width);
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  expect((await canvas.boundingBox()).width).toBeCloseTo(before.width, 0);
  await page.getByLabel('D2 source', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copy D2', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download SVG', exact: true })).toBeVisible();
  await page.getByLabel('D2 source', { exact: true }).click();
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('explicit interactive=false still renders a static server component', async ({ page }) => {
  await page.goto('/?case=compiled-static');
  await expect(page.locator('.d2-diagram-scroll')).toBeVisible();
  await expect(page.locator('.d2-toolbar, .d2-viewport, .d2-source-menu')).toHaveCount(0);
  await expectDefaultScale(page);
});

test('the default interactive fence keeps its source and SVG accessible with JavaScript disabled', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto('/?case=compiled-default');
    await expectDefaultScale(page);
    await page.getByLabel('D2 source', { exact: true }).click();
    await expect(page.getByLabel('D2 source code', { exact: true })).toContainText('client -> api: Request');
  } finally { await context.close(); }
});
