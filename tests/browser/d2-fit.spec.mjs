import { test, expect } from '@playwright/test';

const dimensions = { wide: [2400, 600], tall: [600, 2400], small: [160, 80] };

async function expectCanvasFits(page, name) {
  await expect(page.locator('.d2-viewport')).toBeVisible();
  await expect.poll(() => page.locator('.d2-viewport').evaluate((element) =>
    element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  const box = await page.locator('.d2-zoom-space').boundingBox();
  const [width, height] = dimensions[name];
  expect(box.width / box.height).toBeCloseTo(width / height, 2);
  expect(box.width).toBeLessThanOrEqual(width + 1);
  expect(box.height).toBeLessThanOrEqual(height + 1);
}

for (const name of Object.keys(dimensions)) {
  test(`${name} auto-fits on mount and resize, without upscaling, in desktop and dark mobile`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/?case=preview-${name}`);
    await expectCanvasFits(page, name);
    const viewport = page.locator('.d2-viewport');
    expect(await viewport.evaluate(e => parseFloat(getComputedStyle(e).maxHeight))).toBe(810);
    await expect(page.getByRole('button', { name: /^Explore|^Expand/ })).toHaveCount(0);
    await expect(page.locator('.d2-viewer-status, .d2-source-fallback')).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await expectCanvasFits(page, name);
    await page.evaluate(() => document.body.classList.add('dark'));
    await expect(viewport.locator('.d2-diagram-dark')).toBeVisible();
    await expect(viewport.locator('.d2-diagram-light')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('source is an overlay icon, not a bottom row, including inside 90vh fullscreen', async ({ page }) => {
  await page.goto('/?case=preview-tall');
  await expectCanvasFits(page, 'tall');
  for (const fullscreen of [false, true]) {
    if (fullscreen) {
      await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      expect((await dialog.boundingBox()).height).toBeCloseTo(page.viewportSize().height * 0.9, 0);
      await expectCanvasFits(page, 'tall');
      expect(await dialog.evaluate(e => e.scrollHeight <= e.clientHeight + 1)).toBe(true);
    }
    const figure = page.locator('.d2-viewer');
    const before = await figure.boundingBox();
    const canvas = await page.locator('.d2-canvas').boundingBox();
    const viewport = await page.locator('.d2-viewport').boundingBox();
    const toolbar = await page.locator('.d2-toolbar').boundingBox();
    await expect(page.locator('.d2-toolbar')).toHaveCSS('position', 'absolute');
    expect(viewport.y).toBeCloseTo(canvas.y, 0);
    expect(viewport.height).toBeCloseTo(canvas.height, 0);
    expect(before.height).toBeCloseTo(viewport.height, 0);
    expect(toolbar.y).toBeGreaterThanOrEqual(viewport.y);
    expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(viewport.y + viewport.height);
    for (const button of await page.locator('.d2-toolbar > button').all()) {
      expect(await button.textContent()).toBe('');
      await expect(button.locator('svg')).toHaveCount(1);
      expect(await button.getAttribute('aria-label')).toBeTruthy();
    }
    await page.getByLabel('D2 source', { exact: true }).click();
    await expect(page.getByLabel('D2 source code', { exact: true })).toBeVisible();
    const after = await figure.boundingBox();
    expect(after.height).toBeCloseTo(before.height, 0);
    expect((await page.locator('.d2-source-panel').boundingBox()).y).toBeLessThan(before.y + 100);
    await page.getByLabel('D2 source', { exact: true }).click();
  }
});

test('SSR still fits without JavaScript, with compact source and every board available', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await page.goto('/?case=preview-tall');
    const svg = page.locator('.d2-diagram-light > svg');
    const box = await svg.boundingBox();
    expect(box.width).toBeLessThanOrEqual(390);
    expect(box.height).toBeLessThanOrEqual(844 * 0.9);
    expect(box.width / box.height).toBeCloseTo(0.25, 2);
    await expect(svg).toHaveAttribute('height', '2400');
    await page.getByLabel('D2 source', { exact: true }).click();
    await expect(page.getByLabel('D2 source code', { exact: true })).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    expect((await svg.boundingBox()).height).toBeGreaterThan(844 * 0.9);
  } finally { await context.close(); }
});

test('the interactive viewport height budget is host-configurable', async ({ page }) => {
  await page.goto('/?case=preview-tall');
  await expectCanvasFits(page, 'tall');
  await page.addStyleTag({ content: '.d2-interactive { --d2-viewport-max-height: 40vh; }' });
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await expectCanvasFits(page, 'tall');
  expect((await page.locator('.d2-zoom-space').boundingBox()).height).toBeLessThanOrEqual(page.viewportSize().height * 0.4);
});

for (const boxSizing of ['content-box', 'border-box']) {
  test(`Fit contains both axes with ${boxSizing} and restores native size via keyboard`, async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    for (const name of ['tall', 'wide']) {
      await page.goto(`/?case=preview-${name}`);
      await page.addStyleTag({ content: `.d2-viewport { box-sizing: ${boxSizing}; }` });
      await expectCanvasFits(page, name);
      for (const fullscreen of [false, true]) {
        if (fullscreen) await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
        await page.getByRole('button', { name: 'Fit', exact: true }).click();
        await expectCanvasFits(page, name);
        const viewport = page.locator('.d2-viewport');
        await viewport.focus(); await page.keyboard.press('0');
        const [width, height] = dimensions[name];
        await expect(page.locator('.d2-zoom-space')).toHaveCSS('width', `${width}px`);
        await expect(page.locator('.d2-zoom-space')).toHaveCSS('height', `${height}px`);
        await page.getByRole('button', { name: 'Zoom out' }).click();
        await expect(page.locator('.d2-zoom-space')).toHaveCSS('width', `${width / 1.25}px`);
      }
    }
  });
}

test('manual zoom survives canvas height changes and Fit never enlarges small diagrams', async ({ page }) => {
  await page.goto('/?case=preview-small');
  await expectCanvasFits(page, 'small');
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.locator('.d2-zoom-space')).toHaveCSS('width', '200px');
  await page.waitForTimeout(100);
  await expect(page.locator('.d2-zoom-space')).toHaveCSS('width', '200px');
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await expect(page.locator('.d2-zoom-space')).toHaveCSS('width', '160px');
});
