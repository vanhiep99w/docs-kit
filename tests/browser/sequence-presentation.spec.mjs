import { test, expect } from '@playwright/test';

const themeSelector = dark => dark ? '.d2-diagram-dark' : '.d2-diagram-light';
async function expectReadableFrames(page, dark = false) {
  const shapes = page.locator(`${themeSelector(dark)} svg .shape.blend`);
  await expect(shapes).toHaveCount(3);
  for (const shape of await shapes.all()) {
    await expect(shape).toHaveCSS('mix-blend-mode', 'normal');
    await expect(shape).toHaveCSS('opacity', '1');
    const rectangle = shape.locator('rect');
    await expect(rectangle).toHaveCSS('fill', 'rgba(0, 0, 0, 0)');
    await expect(rectangle).toHaveCSS('stroke', dark ? 'rgb(148, 163, 184)' : 'rgb(100, 116, 139)');
    await expect(rectangle).toHaveCSS('stroke-width', '2px');
    await expect(rectangle).toHaveCSS('vector-effect', 'non-scaling-stroke');
  }
}

for (const width of [1440, 390]) {
  test(`shared sequence defaults work without host overrides at ${width}px, light/dark and fullscreen`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/?case=sequence');
    const viewport = page.locator('.d2-viewport');
    await expect(viewport).toBeVisible();
    for (const dark of [false, true]) {
      await page.evaluate(dark => document.body.classList.toggle('dark', dark), dark);
      await expectReadableFrames(page, dark);
      await expect(viewport).toHaveCSS('padding', '48px 16px 24px');
      expect(await viewport.evaluate(el => parseFloat(getComputedStyle(el).maxHeight))).toBe(810);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect((await page.getByRole('dialog').boundingBox()).height).toBeCloseTo(810, 0);
    await expectReadableFrames(page, true);
    await page.keyboard.press('Escape');
  });
}

test('static and no-JS fallbacks get frame styling without hydration or a host adapter', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    for (const [name, padding] of [['sequence', '48px 16px 24px'], ['sequence-static', '16px']]) {
      await page.goto(`/?case=${name}`);
      await expectReadableFrames(page);
      await expect(page.locator('.d2-diagram-scroll')).toHaveCSS('padding', padding);
      await expect(page.locator('.d2-diagram-scroll')).toHaveCSS('border-top-width', '1px');
    }
  } finally { await context.close(); }
});

test('padding is configurable and only the active sequence board gets the extra space', async ({ page }) => {
  await page.goto('/?case=sequence-boards');
  const viewport = page.locator('.d2-viewport');
  await expect(viewport).toHaveCSS('padding', '8px');
  await page.getByRole('combobox', { name: 'View' }).selectOption('layers.sequence');
  await expect(viewport).toHaveCSS('padding', '48px 16px 24px');
  await expectReadableFrames(page);
  await page.addStyleTag({ content: '.d2-interactive { --d2-sequence-padding: 2rem; --d2-sequence-border-color: rgb(1, 2, 3); }' });
  await expect(viewport).toHaveCSS('padding', '32px');
  await expect(page.locator('.d2-canvas')).toHaveCSS('border-top-color', 'rgb(1, 2, 3)');
  await page.getByRole('combobox', { name: 'View' }).selectOption('layers.ordinary');
  await expect(viewport).toHaveCSS('padding', '8px');
  await expect(page.locator('.d2-canvas')).toHaveCSS('border-top-width', '0px');
});

test('native opt-out leaves the old group presentation and canvas padding intact', async ({ page }) => {
  await page.goto('/?case=sequence-native');
  await expect(page.locator('.d2-viewport')).toHaveCSS('padding', '8px');
  await expect(page.locator('svg[data-d2-sequence]')).toHaveCount(0);
  await expect(page.locator('.d2-diagram-light .shape.blend').first()).toHaveCSS('opacity', '0.5');
});

test('downloaded SVG keeps readable frames without docs-kit or host stylesheets', async ({ page }) => {
  await page.goto('/?case=sequence');
  await expect(page.locator('.d2-viewport')).toBeVisible();
  await page.getByLabel('D2 source', { exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'), page.getByRole('button', { name: 'Download SVG', exact: true }).click(),
  ]);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const svg = Buffer.concat(chunks).toString();
  await page.setContent(svg);
  await expect(page.locator('svg .shape.blend')).toHaveCount(3);
  for (const shape of await page.locator('svg .shape.blend').all()) {
    await expect(shape).toHaveCSS('opacity', '1');
    await expect(shape).toHaveCSS('mix-blend-mode', 'normal');
    await expect(shape.locator('rect')).toHaveCSS('stroke-width', '2px');
  }
});
