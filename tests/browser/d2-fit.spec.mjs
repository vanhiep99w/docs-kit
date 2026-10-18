import { test, expect } from '@playwright/test';

const dimensions = { wide: [2400, 600], tall: [600, 2400], small: [160, 80] };

async function expectPreviewFits(page, name, theme = 'light', maxHeight = 0.65) {
  const [width, height] = dimensions[name];
  const preview = page.locator(`.d2-diagram-scroll > .d2-diagram-${theme} > svg`);
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.evaluate((svg) => {
    const rect = svg.getBoundingClientRect();
    const region = svg.closest('.d2-diagram-scroll');
    return { width: rect.width, height: rect.height, available: region.clientWidth,
      overflow: document.documentElement.scrollWidth > window.innerWidth };
  }).then((box) => box.width > 0 && box.height > 0 &&
    box.width <= box.available + 1 && box.height <= page.viewportSize().height * maxHeight + 1 && !box.overflow)).toBe(true);
  const box = await preview.boundingBox();
  expect(box.width / box.height).toBeCloseTo(width / height, 2);
  expect(box.width).toBeLessThanOrEqual(width);
  expect(box.height).toBeLessThanOrEqual(height);
  // Fitting is display-only: the downloadable SVG still has its native dimensions.
  await expect(preview).toHaveAttribute('width', String(width));
  await expect(preview).toHaveAttribute('height', String(height));
}

for (const name of Object.keys(dimensions)) {
  test(`${name} preview fits both axes on desktop, resize and dark mobile without upscaling`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/?case=preview-${name}`);
    await expectPreviewFits(page, name);
    await page.setViewportSize({ width: 390, height: 844 });
    await expectPreviewFits(page, name);
    await page.evaluate(() => document.body.classList.add('dark'));
    await expectPreviewFits(page, name, 'dark');
    await expect(page.locator('.d2-viewport')).toHaveCount(0);
  });
}

test('tall preview fits without JavaScript and is not height-limited in print', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await page.goto('/?case=preview-tall');
    await expectPreviewFits(page, 'tall');
    await page.emulateMedia({ media: 'print' });
    expect((await page.locator('.d2-diagram-light > svg').boundingBox()).height).toBeGreaterThan(844 * 0.65);
  } finally { await context.close(); }
});

test('the preview height budget is host-configurable', async ({ page }) => {
  await page.goto('/?case=preview-tall');
  await page.addStyleTag({ content: '.d2-interactive { --d2-preview-max-height: 40vh; }' });
  await expectPreviewFits(page, 'tall', 'light', 0.4);
});

for (const boxSizing of ['content-box', 'border-box']) {
  test(`Fit contains tall and wide canvases with ${boxSizing}, including expanded view`, async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    for (const name of ['tall', 'wide']) {
      await page.goto(`/?case=preview-${name}`);
      await page.addStyleTag({ content: `.d2-viewport { box-sizing: ${boxSizing}; }` });
      await page.getByRole('button', { name: /^Explore/ }).click();
      const viewport = page.locator('.d2-viewport');
      for (const expanded of [false, true]) {
        if (expanded) await page.getByRole('button', { name: 'Expand' }).click();
        await page.getByRole('button', { name: 'Fit', exact: true }).click();
        await expect.poll(() => viewport.evaluate((element) =>
          element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1)).toBe(true);
        const space = await page.locator('.d2-zoom-space').boundingBox();
        const [width, height] = dimensions[name];
        expect(space.width / space.height).toBeCloseTo(width / height, 2);
        await page.getByRole('button', { name: 'Reset zoom' }).click();
        await expect(page.getByRole('button', { name: 'Reset zoom' })).toHaveText('100%');
        await expect(page.locator('.d2-zoom-space')).toHaveCSS('width', `${width}px`);
        await expect(page.locator('.d2-zoom-space')).toHaveCSS('height', `${height}px`);
      }
    }
  });
}

test('Fit never enlarges a small diagram', async ({ page }) => {
  await page.goto('/?case=preview-small');
  await page.getByRole('button', { name: /^Explore/ }).click();
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reset zoom' })).toHaveText('100%');
});
