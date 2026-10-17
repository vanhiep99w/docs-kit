import { test, expect } from '@playwright/test';

// Fixed fixture/viewport budgets guard against reintroducing metadata panels above primary content.
const cases = [
  ['terminal', 'terminal-session', 800], ['diff-words', 'code-diff', 450],
  ['annotated', 'annotated-example', 290], ['walkthrough', 'code-walkthrough', 400],
  ['inspector', 'data-inspector', 900], ['protocol', 'protocol-exchange', 950],
  ['waterfall', 'span-waterfall', 650], ['concurrency', 'concurrency-lanes', 650],
  ['state-model', 'state-transition', 650], ['marble', 'marble-diagram', 650],
];

test('all new viewers prioritize content and keep a compact default footprint without reducing code font size', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  for (const [name, cls, budget] of cases) {
    await page.goto('/?case=' + name);
    const figure = page.locator('.' + cls).first();
    await expect(figure).toBeVisible();
    expect((await figure.boundingBox()).height, name).toBeLessThan(budget);
    if (name === 'terminal' || name === 'diff-words' || name === 'annotated') {
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

test('diff opens on the actual change; title, caption, counts and ordinary LF metadata stay in a native details footer', async ({ page }) => {
  await page.goto('/?case=diff-contract');
  const figure = page.locator('.code-diff'); const info = figure.locator('.code-diff-info');
  await expect(figure.locator('.code-diff-header, .code-diff-files, .code-diff-guide, .code-diff-no-newline')).toHaveCount(0);
  await expect(info).not.toHaveAttribute('open'); await expect(info.locator('strong')).not.toBeVisible();
  const top = (await figure.boundingBox()).y;
  expect((await figure.locator('.code-diff-row').first().boundingBox()).y - top).toBeLessThan(100);
  await expect(figure.locator('.code-diff-content').filter({ hasText: 'fullName' })).toBeVisible();
  await info.locator('summary').focus(); await page.keyboard.press('Enter');
  await expect(info).toContainText('strict schema'); await expect(info).toContainText('+2 thêm · −1 xóa'); await expect(info).toContainText('Response v1 · LF');
  await info.locator('summary').click();
  await figure.screenshot({ path: 'test-results/compact-diff-contract.png' });
});

test('nested inspectors have no repeated card headers or permanently expanded search/copy chrome', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/?case=protocol');
  const inspector = page.locator('[data-variant="ok"] .data-inspector').nth(1);
  await expect(inspector).toHaveAttribute('data-embedded', 'true');
  expect(await inspector.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('0px');
  await expect(inspector.getByRole('searchbox')).toHaveCount(0);
  await inspector.getByRole('button', { name: 'Chọn /id', exact: true }).click();
  await expect(inspector.locator('.data-inspector-tools')).toHaveAttribute('open', '');
  await expect(inspector.getByRole('searchbox')).toBeVisible();
  await inspector.getByRole('button', { name: 'Sao chép value', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('9007199254740993');
});

test('every viewer stays contained on touch/mobile in light and dark, with visible warning and usable compact controls', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  for (const [name, cls] of cases) {
    await page.goto('http://127.0.0.1:4178/?case=' + name);
    const figure = page.locator('.' + cls).first();
    const light = await figure.evaluate((el) => getComputedStyle(el).backgroundColor);
    await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
    expect(await figure.evaluate((el) => getComputedStyle(el).backgroundColor), name).not.toBe(light);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name).toBe(true);
    await figure.screenshot({ path: `test-results/compact-${name}-mobile-dark.png` });
  }
  await page.goto('http://127.0.0.1:4178/?case=terminal-rollback');
  await expect(page.getByRole('note')).toBeVisible();
  await context.close();
});

test('metadata and expected results remain available without JavaScript, alongside the actual code and warnings', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false }); const page = await context.newPage();
  await page.goto('http://127.0.0.1:4178/?case=terminal-rollback');
  await expect(page.getByRole('note')).toBeVisible();
  await page.locator('.terminal-session-notes > summary').first().click();
  await expect(page.locator('.terminal-session-notes[open]')).toContainText('Đúng cluster');
  await page.locator('.terminal-session-info > summary').click();
  await expect(page.locator('.terminal-session-info')).toContainText('không paused');
  await page.goto('http://127.0.0.1:4178/?case=diff-contract');
  await expect(page.locator('.code-diff-row').first()).toBeVisible();
  await page.locator('.code-diff-info > summary').click();
  await expect(page.locator('.code-diff-info')).toContainText('strict schema');
  await expect(page.getByRole('button')).toHaveCount(0);
  await context.close();
});
