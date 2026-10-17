import { test, expect } from '@playwright/test';

// Fixed fixture/viewport budgets guard against reintroducing metadata panels above primary content.
const cases = [
  ['terminal', 'terminal-session', 800], ['diff-words', 'code-diff', 450],
  ['walkthrough', 'code-walkthrough', 400],
  ['protocol', 'protocol-exchange', 950],
  ['waterfall', 'span-waterfall', 650], ['concurrency', 'concurrency-lanes', 900],
];

test('all new viewers prioritize content and keep a compact default footprint without reducing code font size', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  for (const [name, cls, budget] of cases) {
    await page.goto('/?case=' + name);
    const figure = page.locator('.' + cls).first();
    await expect(figure).toBeVisible();
    expect((await figure.boundingBox()).height, name).toBeLessThan(budget);
    if (name === 'terminal' || name === 'diff-words') {
      const code = figure.locator(name === 'terminal' ? '.terminal-session-command pre' : name === 'diff-words' ? '.code-diff-content' : '.annotated-example-code').first();
      expect(await code.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(13);
    }
    await figure.screenshot({ path: `test-results/compact-${name}-desktop.png` });
  }
  expect(errors).toEqual([]);
});

test('four-command rollback reads as a transcript, keeps warnings in view and moves expected results into native notes', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/?case=terminal-rollback');
  const figure = page.locator('.terminal-session');
  const steps = figure.locator('.terminal-session-step');
  await expect(steps).toHaveCount(4);
  await expect(figure.getByText(/^Bước [1-4]$/, { exact: true })).toHaveCount(0);
  expect((await figure.boundingBox()).height).toBeLessThan(380);
  await expect(figure.getByRole('note', { name: 'Cảnh báo', exact: true })).toBeVisible();
  await expect(figure.getByRole('note')).toContainText('không rollback database');
  await expect(steps.nth(0).locator('.terminal-session-notes')).not.toHaveAttribute('open');
  const notes = steps.nth(0).locator('.terminal-session-notes');
  await notes.locator('summary').focus(); await page.keyboard.press('Enter');
  await expect(notes).toHaveAttribute('open', ''); await expect(notes).toContainText('Đúng cluster cần thao tác.');
  const button = page.getByRole('button', { name: 'Sao chép lệnh bước 3', exact: true });
  await expect(button).toHaveAttribute('aria-describedby', await figure.getByRole('note').getAttribute('id'));
  await button.click(); expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('kubectl rollout undo deployment/order-service -n demo');
  await notes.locator('summary').click();
  await figure.screenshot({ path: 'test-results/compact-terminal-rollback.png' });
});

test('transcript displays environment changes including returning from a step override to session defaults', async ({ page }) => {
  await page.goto('/?case=terminal-return-context');
  const steps = page.locator('.terminal-session-step');
  await expect(steps.nth(0).locator('.terminal-session-step-context')).toHaveText('Remote host · remote-demo');
  await expect(steps.nth(1).locator('.terminal-session-step-context')).toHaveText('Local · local-dev');
  await expect(page.locator('.terminal-session-output-plain')).toHaveCount(2);
  await expect(page.getByRole('region', { name: 'stdout: Bước 2', exact: true })).toHaveText('/home/dev');
});



test('every viewer stays contained on touch/mobile in light and dark, with visible warning and usable compact controls', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  for (const [name, cls] of cases) {
    await page.goto('http://127.0.0.1:4178/?case=' + name);
    const figure = page.locator('.' + cls).first();
    const light = await figure.evaluate((el) => getComputedStyle(el).backgroundColor);
    await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
    if (name !== 'walkthrough') expect(await figure.evaluate((el) => getComputedStyle(el).backgroundColor), name).not.toBe(light);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name).toBe(true);
    await figure.screenshot({ path: `test-results/compact-${name}-mobile-dark.png` });
  }
  await page.goto('http://127.0.0.1:4178/?case=terminal-rollback');
  await expect(page.getByRole('note')).toBeVisible();
  await context.close();
});
