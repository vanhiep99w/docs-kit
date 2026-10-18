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
