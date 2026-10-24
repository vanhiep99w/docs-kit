import { test, expect } from '@playwright/test';

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`fullscreen stays centered with host margin resets and scrolling at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/?case=preview-tall');
    await expect(page.getByRole('button', { name: 'Fullscreen', exact: true })).toBeVisible();
    // Tailwind/Fumadocs preflight resets the native dialog's UA margin:auto.
    await page.addStyleTag({ content: '*, ::before, ::after { margin: 0; } body { min-height: 300vh; }' });
    await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    for (const scrollY of [0, 600]) {
      await page.evaluate(y => window.scrollTo(0, y), scrollY);
      const box = await dialog.boundingBox();
      expect(box.x + box.width / 2).toBeCloseTo(viewport.width / 2, 0);
      expect(box.y + box.height / 2).toBeCloseTo(viewport.height / 2, 0);
      expect(box.height).toBeCloseTo(viewport.height * 0.9, 0);
    }
    await page.setViewportSize({ width: viewport.width, height: viewport.height - 100 });
    const resized = await dialog.boundingBox();
    expect(resized.y + resized.height / 2).toBeCloseTo((viewport.height - 100) / 2, 0);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Fullscreen', exact: true })).toBeFocused();
  });
}

for (const width of [1440, 390]) {
  test(`fullscreen centers the drawing vertically inside its available area at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    for (const fixture of ['flow-fast', 'preview-small', 'preview-wide', 'preview-tall']) {
      await page.goto(`/?case=${fixture}`);
      await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      async function centerOffset() {
        return page.locator('.d2-viewport').evaluate((viewport) => {
          const style = getComputedStyle(viewport);
          const top = parseFloat(style.paddingTop), bottom = parseFloat(style.paddingBottom);
          const contentCenter = viewport.getBoundingClientRect().top + viewport.clientTop + top + (viewport.clientHeight - top - bottom) / 2;
          const drawing = viewport.querySelector('.d2-zoom-space').getBoundingClientRect();
          return drawing.top + drawing.height / 2 - contentCenter;
        });
      }
      await expect.poll(async () => Math.abs(await centerOffset())).toBeLessThan(1.5);
      await page.setViewportSize({ width, height: 850 });
      await expect.poll(async () => Math.abs(await centerOffset())).toBeLessThan(1.5);
      await page.keyboard.press('Escape');
      await page.setViewportSize({ width, height: 1000 });
    }
  });
}

test('oversized fullscreen drawings keep both the start and end reachable by scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  for (const fixture of ['preview-tall', 'preview-wide']) {
    await page.goto(`/?case=${fixture}`);
    await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
    const viewport = page.locator('.d2-viewport');
    await viewport.focus(); await page.keyboard.press('0');
    const start = await viewport.evaluate((element) => {
      const drawing = element.querySelector('.d2-zoom-space').getBoundingClientRect();
      const box = element.getBoundingClientRect();
      return { top: drawing.top - box.top, left: drawing.left - box.left,
        overflows: element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth };
    });
    expect(start.overflows).toBe(true);
    expect(start.top).toBeGreaterThanOrEqual(0);
    expect(start.left).toBeGreaterThanOrEqual(0);
    const end = await viewport.evaluate((element) => {
      element.scrollTop = element.scrollHeight; element.scrollLeft = element.scrollWidth;
      const drawing = element.querySelector('.d2-zoom-space').getBoundingClientRect();
      const box = element.getBoundingClientRect();
      return { bottom: drawing.bottom - box.top, right: drawing.right - box.left,
        // An unoccupied stable gutter is part of the visible padding box,
        // even though clientWidth excludes it. With a vertical scrollbar use clientWidth.
        height: element.clientHeight, width: element.scrollHeight > element.clientHeight ? element.clientWidth : box.width, scrollTop: element.scrollTop, scrollLeft: element.scrollLeft };
    });
    expect(end.scrollTop + end.scrollLeft).toBeGreaterThan(0);
    expect(end.bottom).toBeLessThanOrEqual(end.height + 1);
    expect(end.right).toBeLessThanOrEqual(end.width + 1);
    await page.keyboard.press('Escape');
  }
});
