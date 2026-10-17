import { test, expect } from '@playwright/test';

const url = '/?case=terminal';

test('copies each exact command, never prompt or output, with keyboard and clipboard feedback', async ({ page, context }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(url);
  const data = await page.locator('#data').evaluate((el) => JSON.parse(el.textContent).terminal);
  const requests = []; page.on('request', (request) => requests.push(request.url()));
  for (let index = 0; index < data.steps.length; index++) {
    const button = page.getByRole('button', { name: `Sao chép lệnh bước ${index + 1}`, exact: true });
    await button.focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toHaveText(`Đã sao chép lệnh bước ${index + 1}.`);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(data.steps[index].command);
    await expect(button).toBeFocused();
  }
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test('keeps warning, environment, expected result and stream names explicit', async ({ page }) => {
  await page.goto(url);
  const session = page.locator('.terminal-session');
  await expect(session).toContainText('Local · dev · ~/work/api');
  await expect(session).toContainText('Remote host · demo.example.invalid · /srv/api');
  await expect(session).toContainText('Container · redis-dev / redis-cli');
  await expect(session.getByRole('note', { name: 'Cảnh báo' })).toContainText('không dán secrets');
  const warningId = await session.getByRole('note').getAttribute('id');
  await expect(page.getByRole('button', { name: 'Sao chép lệnh bước 1', exact: true })).toHaveAttribute('aria-describedby', warningId);
  await expect(session).toContainText('Kết quả kỳ vọng: Nhận đúng giá trị');
  await expect(session).toContainText('Exit code: 0');
  await expect(session).toContainText('Exit code: 1');
  await expect(page.locator('.terminal-session-output[data-stream="stderr"]').first()).toContainText('diagnostic, not failure');
  await expect(page.locator('.terminal-session-output-line[data-highlighted="true"]')).toHaveCount(1);
  await page.getByRole('link', { name: 'Giá trị trả về' }).click();
  await expect(page.locator('.terminal-session-output-line:target')).toHaveAttribute('data-line', '1');
});

test('native output disclosure works by keyboard and long output stays scrollable', async ({ page }) => {
  await page.goto(url);
  const output = page.locator('.terminal-session-output').nth(2);
  await expect(output).not.toHaveAttribute('open');
  await output.locator('summary').focus(); await page.keyboard.press('Enter');
  await expect(output).toHaveAttribute('open', '');
  await expect(output).toContainText('log line 65');
  expect(await output.locator('pre').evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await page.keyboard.press('Enter'); await expect(output).not.toHaveAttribute('open');
});

test('clipboard failure does not hide transcript or remove focus', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) } }));
  await page.goto(url);
  const button = page.getByRole('button', { name: 'Sao chép lệnh bước 1', exact: true });
  await button.click();
  await expect(page.getByRole('status')).toContainText('Không thể sao chép');
  await expect(page.getByRole('region', { name: 'Lệnh: In giá trị thử nghiệm' })).toContainText('printf');
  await expect(button).toBeFocused();
});

test('mobile, host dark theme and reduced motion preserve readable content', async ({ page }) => {
  await page.goto(url);
  await page.screenshot({ path: 'test-results/terminal-desktop.png', fullPage: true });
  const light = await page.locator('.terminal-session').evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
  const attrDark = await page.locator('.terminal-session').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(attrDark).not.toBe(light);
  await page.evaluate(() => { delete document.documentElement.dataset.theme; document.body.classList.add('dark'); });
  expect(await page.locator('.terminal-session').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(attrDark);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const output = page.locator('.terminal-session-output[data-stream="stdout"]').first().locator('pre');
  expect(await output.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await expect(page.getByRole('note')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sao chép lệnh bước 3', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/terminal-mobile-dark.png', fullPage: true });
});

test('SSR transcript, annotations and collapsed output remain usable without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(url);
  await expect(page.getByRole('button', { name: /Sao chép lệnh/ })).toHaveCount(0);
  await expect(page.getByRole('note')).toContainText('không dán secrets');
  await expect(page.locator('.terminal-session')).toContainText('Remote host');
  const output = page.locator('.terminal-session-output').nth(2);
  await output.locator('summary').click();
  await expect(output).toHaveAttribute('open', '');
  await expect(output.locator('pre')).toContainText('log line 65');
  await page.getByRole('link', { name: 'Giá trị trả về' }).click();
  await expect(page.locator('.terminal-session-output-line:target')).toHaveAttribute('data-line', '1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await context.close();
});
