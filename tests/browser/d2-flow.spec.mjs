import { test, expect } from '@playwright/test';

async function open(page, mode = 'flow-fast') {
  await page.goto(`/?case=${mode}`);
  await expect(page.getByRole('group', { name: 'Request flow controls' })).toBeVisible();
  await expect(page.locator('.d2-flow-token')).toHaveCount(2);
  await expect(page.getByRole('alert')).toHaveCount(0);
}
const coordinates = (page) => page.locator('.d2-diagram-light .d2-flow-token').evaluate((node) => [Number(node.getAttribute('cx')), Number(node.getAttribute('cy'))]);
async function freezeClock(page) {
  await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2030-01-01T00:01:00Z'));
}


test('plays along actual D2 geometry, pauses in place, resumes and finishes once', async ({ page }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await open(page);
  const start = await coordinates(page);
  await page.getByRole('combobox', { name: 'Speed', exact: true }).selectOption('0.5');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => coordinates(page)).not.toEqual(start);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const paused = await coordinates(page);
  await page.waitForTimeout(150);
  expect(await coordinates(page)).toEqual(paused);
  await page.getByRole('combobox', { name: 'Speed', exact: true }).selectOption('2');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.d2-flow-count')).toHaveText('5 / 5');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await page.waitForTimeout(200);
  await expect(page.locator('.d2-flow-count')).toHaveText('5 / 5');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.locator('.d2-flow-count')).toHaveText('1 / 5');
  expect(await coordinates(page)).toEqual(start);
  expect(errors).toEqual([]);
});

test('scenario selection maps the second parallel edge and response direction, including manual stepping', async ({ page }) => {
  await open(page);
  await page.getByRole('combobox', { name: 'Scenario', exact: true }).selectOption('miss');
  await expect(page.locator('.d2-flow-count')).toHaveText('1 / 9');
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.d2-flow-current')).toContainText('ghi dữ liệu vào cache');
  await expect(page.locator('.d2-diagram-light [data-d2-flow-edge="e6"] .d2-flow-track')).toHaveCount(1);
  await expect(page.locator('.d2-flow-phase')).toHaveText('Arrived at cache');
  await expect(page.locator('.d2-diagram-light [data-d2-flow-edge="e2"]')).not.toHaveAttribute('data-d2-flow-active');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.d2-flow-current')).toContainText('cache → api');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.d2-flow-current')).toContainText('api → client');
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(page.locator('.d2-flow-count')).toHaveText('8 / 9');
  await page.getByRole('combobox', { name: 'Scenario', exact: true }).selectOption('hit');
  await expect(page.locator('.d2-flow-count')).toHaveText('1 / 5');
  await page.getByLabel('All steps (5)', { exact: true }).click();
  await page.locator('.d2-flow-transcript li').nth(2).getByRole('button').click();
  await expect(page.locator('.d2-flow-count')).toHaveText('3 / 5');
});

test('reduced motion keeps steps, dark theme, zoom and mobile layout usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.d2-flow-count')).toHaveText('2 / 5');
  await page.evaluate(() => document.body.classList.add('dark'));
  await expect(page.locator('.d2-viewport .d2-diagram-dark')).toBeVisible();
  await expect(page.locator('.d2-viewport .d2-diagram-light')).toBeHidden();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/d2-flow-mobile-dark.png', fullPage: true });
});

test('fullscreen keeps playback running and restores working controls', async ({ page }) => {
  await open(page);
  await freezeClock(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect(page.locator('.d2-flow-token')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.clock.runFor(20); // Flush the fullscreen focus-restoration frame.
  await expect(page.getByRole('button', { name: 'Fullscreen', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.d2-flow-count')).toHaveText('2 / 5');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('all flow scenarios remain readable without JavaScript or after a viewer chunk failure', async ({ browser, page }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const noJS = await context.newPage();
  await noJS.goto('/?case=flow');
  await expect(noJS.locator('.d2-flow-fallback')).toContainText('Cache hit');
  await expect(noJS.locator('.d2-flow-fallback')).toContainText('Cache miss');
  await expect(noJS.locator('.d2-flow-fallback li')).toHaveCount(14);
  await context.close();
  await page.route('**/d2-viewer-*.js', (route) => route.abort());
  await page.goto('/?case=flow');
  await expect(page.getByRole('alert')).toContainText('static views are still available');
  await expect(page.locator('.d2-flow-fallback')).toContainText('database → api');
});

for (const mode of ['flow-fast', 'flow-sketch']) {
  test(`${mode}: completes the line and keeps every animated point on a connection, never inside the node`, async ({ page }) => {
    await open(page, mode);
    await freezeClock(page);
    const geometry = await page.evaluate(() => {
      const path = document.querySelector('.d2-diagram-light .d2-flow-track');
      const length = path.getTotalLength();
      const end = path.getPointAtLength(length);
      window.__lineSamples = [];
      const record = () => {
        const path = document.querySelector('.d2-diagram-light .d2-flow-track');
        const circle = document.querySelector('.d2-diagram-light .d2-flow-token');
        if (path && circle) {
          const expected = path.getPointAtLength(path.getTotalLength() * Number(circle.getAttribute('data-flow-progress')));
          window.__lineSamples.push({
            error: Math.hypot(Number(circle.getAttribute('cx')) - expected.x, Number(circle.getAttribute('cy')) - expected.y),
            phase: circle.getAttribute('data-flow-phase'),
            step: document.querySelector('.d2-flow-count').textContent,
          });
        }
        requestAnimationFrame(record);
      };
      requestAnimationFrame(record);
      return { end: [end.x, end.y], d: path.getAttribute('d') };
    });
    expect(geometry.d.match(/[Mm]/g)).toHaveLength(1);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.clock.runFor(360);
    await expect(page.locator('.d2-flow-count')).toHaveText('1 / 5');
    await expect(page.locator('.d2-flow-phase')).toHaveText('Arrived at gateway');
    const end = await coordinates(page);
    expect(Math.hypot(end[0] - geometry.end[0], end[1] - geometry.end[1])).toBeLessThan(0.01);
    await expect(page.locator('.d2-diagram-light .d2-flow-token')).toHaveAttribute('opacity', '1');
    // The endpoint holds, then fades; there is no animated segment through the node's interior.
    await page.clock.runFor(200);
    expect(await coordinates(page)).toEqual(end);
    expect(Number(await page.locator('.d2-diagram-light .d2-flow-token').getAttribute('opacity'))).toBeLessThan(0.7);
    await page.clock.runFor(120);
    await expect(page.locator('.d2-flow-count')).toHaveText('2 / 5');
    await expect(page.locator('.d2-flow-phase')).toHaveText('Travelling');
    await page.clock.runFor(3200);
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    const samples = await page.evaluate(() => window.__lineSamples);
    expect(samples.length).toBeGreaterThan(100);
    expect(new Set(samples.map((sample) => sample.step)).size).toBe(5);
    expect(Math.max(...samples.map((sample) => sample.error))).toBeLessThan(0.01);
    expect(samples.every((sample) => ['travel', 'arrival'].includes(sample.phase))).toBe(true);
  });
}

for (const mode of ['flow-fast', 'flow-native']) {
  test(`${mode}: transparent toolbar and synchronized line, arrowhead, token and node colors`, async ({ page }) => {
    await open(page, mode);
    await expect(page.locator('.d2-toolbar')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    async function colors() {
      return page.evaluate(() => {
        const svg = document.querySelector(document.body.classList.contains('dark') ? '.d2-diagram-dark svg' : '.d2-diagram-light svg');
        const edge = svg.querySelector('[data-d2-flow-current]');
        const path = edge.querySelector('path.connection[fill="none"]');
        const reference = path.getAttribute('marker-end')?.match(/^url\(#([^)]*)\)$/)?.[1];
        const arrow = reference
          ? Array.from(svg.querySelectorAll('marker')).find((marker) => marker.id === reference).querySelector('path, polygon')
          : edge.querySelector('.connection[class*="fill-"]');
        return {
          track: getComputedStyle(edge.querySelector('.d2-flow-track')).stroke,
          line: getComputedStyle(path).stroke,
          arrow: getComputedStyle(arrow).fill,
          token: getComputedStyle(edge.querySelector('.d2-flow-token')).fill,
          node: getComputedStyle(svg.querySelector('[data-d2-flow-node][data-d2-flow-active] .shape')).stroke,
          inactive: getComputedStyle(svg.querySelector('[data-d2-flow-edge="e1"] path.connection[fill="none"]')).stroke,
          mask: edge.querySelector('.d2-flow-track').getAttribute('mask'),
          originalMask: path.getAttribute('mask'),
        };
      });
    }
    for (const [theme, color] of [['light', 'rgb(37, 99, 235)'], ['dark', 'rgb(147, 197, 253)']]) {
      await page.evaluate((dark) => document.body.classList.toggle('dark', dark), theme === 'dark');
      const result = await colors();
      for (const part of ['track', 'line', 'arrow', 'token', 'node']) expect(result[part], `${theme} ${part}`).toBe(color);
      expect(result.inactive).not.toBe(color);
      expect(result.mask).toBe(result.originalMask);
    }
    await page.evaluate(() => document.querySelector('.d2-interactive').style.setProperty('--d2-flow-accent', '#0f766e'));
    const custom = await colors();
    for (const part of ['track', 'line', 'arrow', 'token', 'node']) expect(custom[part]).toBe('rgb(15, 118, 110)');
    if (mode === 'flow-native') {
      const original = await page.locator('.d2-diagram-light [data-d2-flow-edge="e1"] path[marker-end]').getAttribute('marker-end');
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await expect(page.locator('.d2-diagram-light [data-d2-flow-edge="e0"] path[marker-end]')).toHaveAttribute('marker-end', original);
      await expect(page.locator('.d2-diagram-light marker[id*="-flow-"]')).toHaveCount(1);
      for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next', exact: true }).click();
      await expect(page.locator('.d2-diagram-light marker[id*="-flow-"]')).toHaveCount(1);
    }
  });
}

test('autoplay starts once in view, stops at the end and does not restart on fullscreen', async ({ page }) => {
  await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
    const spacer = document.createElement('div'); spacer.style.height = '1800px'; document.body.prepend(spacer);
  }));
  await open(page, 'flow-autoplay');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await page.waitForTimeout(200);
  await expect(page.locator('.d2-flow-count')).toHaveText('1 / 5');
  await page.locator('.d2-viewport').scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect(page.locator('.d2-flow-count')).toHaveText('5 / 5');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('.d2-viewport').scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await expect(page.locator('.d2-flow-count')).toHaveText('5 / 5');
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await page.waitForTimeout(200);
  await expect(page.locator('.d2-flow-count')).toHaveText('5 / 5');
});

test('autoplay respects reduced motion and manual pause after a hidden tab', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, 'flow-autoplay');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  await page.waitForTimeout(300);
  await expect(page.locator('.d2-flow-count')).toHaveText('1 / 5');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  const position = await coordinates(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(250);
  expect(await coordinates(page)).toEqual(position);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
});

async function waitingForReplay(page) {
  await open(page, 'flow-loop-manual');
  await freezeClock(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.clock.runFor(3200);
  await expect(page.locator('.d2-flow-phase')).toHaveText('Replay after 2 s');
  await expect(page.locator('.d2-flow-count')).toHaveText('5 / 5');
}

test('loop holds the final frame for the delay, replays from the start and stays manually pausable', async ({ page }) => {
  await waitingForReplay(page);
  const endpoint = await coordinates(page);
  await page.clock.runFor(1600);
  await expect(page.locator('.d2-flow-count')).toHaveText('5 / 5');
  expect(await coordinates(page)).toEqual(endpoint);
  await page.clock.runFor(700);
  await expect(page.locator('.d2-flow-count')).toHaveText('1 / 5');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const paused = await coordinates(page);
  await page.clock.runFor(12000);
  expect(await coordinates(page)).toEqual(paused);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
});

for (const action of ['pause', 'reset', 'scenario', 'hidden', 'reduced-motion']) {
  test(`pending replay is cancelled by ${action}`, async ({ page }) => {
    await waitingForReplay(page);
    if (action === 'pause') await page.getByRole('button', { name: 'Pause', exact: true }).click();
    if (action === 'reset') await page.getByRole('button', { name: 'Reset', exact: true }).click();
    if (action === 'scenario') await page.getByRole('combobox', { name: 'Scenario', exact: true }).selectOption('miss');
    if (action === 'hidden') await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    if (action === 'reduced-motion') await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    const count = await page.locator('.d2-flow-count').textContent();
    const point = await coordinates(page);
    await page.clock.runFor(10000);
    await expect(page.locator('.d2-flow-count')).toHaveText(count);
    expect(await coordinates(page)).toEqual(point);
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
  });
}

test('highlight uses a thicker route, a larger point, a soft halo and a tinted active node without dimming labels', async ({ page }) => {
  await open(page);
  await expect(page.locator('.d2-diagram-light .d2-flow-track')).toHaveCSS('stroke-width', '4px');
  await expect(page.locator('.d2-diagram-light .d2-flow-token')).toHaveAttribute('r', '7.5');
  await expect(page.locator('.d2-flow-halo')).toHaveCount(2);
  const style = await page.evaluate(() => {
    const root = document.querySelector('.d2-diagram-light');
    const shape = root.querySelector('[data-d2-flow-node][data-d2-flow-active] .shape[class*="fill-"]');
    const inactive = root.querySelector('[data-d2-flow-edge="e1"]');
    return { fill: getComputedStyle(shape).fill, strokeWidth: getComputedStyle(shape).strokeWidth,
      lineOpacity: getComputedStyle(inactive.querySelector('path.connection')).filter,
      labelOpacity: getComputedStyle(inactive.querySelector('text')).opacity };
  });
  expect(style.strokeWidth).toBe('3px');
  expect(style.fill).toContain('color(srgb');
  expect(style.lineOpacity).toBe('opacity(0.45)');
  expect(style.labelOpacity).toBe('1');
});

for (const width of [1280, 390]) {
  test(`playback uses accessible canvas icons without covering the drawing at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    const canvas = page.locator('.d2-canvas-flow');
    const actions = canvas.getByRole('group', { name: 'Request flow controls', exact: true });
    await expect(actions).toBeVisible();
    await expect(page.locator('.d2-flow-player .d2-flow-actions')).toHaveCount(0);
    for (const name of ['Previous', 'Play', 'Next', 'Reset']) {
      const button = actions.getByRole('button', { name, exact: true });
      await expect(button).toHaveAttribute('title', name);
      await expect(button.locator('svg')).toHaveAttribute('aria-hidden', 'true');
      await expect(button).toHaveText('');
    }
    const toolbar = await canvas.locator('.d2-toolbar').boundingBox();
    const diagram = await canvas.locator('.d2-diagram-light > svg').boundingBox();
    const bounds = await canvas.boundingBox();
    expect(toolbar.x).toBeGreaterThanOrEqual(bounds.x);
    expect(toolbar.x + toolbar.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
    expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(diagram.y);
    await actions.getByRole('button', { name: 'Next', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.d2-flow-count')).toHaveText('2 / 5');
    await actions.getByRole('button', { name: 'Reset', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.d2-flow-count')).toHaveText('1 / 5');
    await actions.getByRole('combobox', { name: 'Speed', exact: true }).selectOption('2');
    await expect(actions.getByRole('combobox', { name: 'Speed', exact: true })).toHaveValue('2');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

for (const width of [1280, 390]) {
  test(`compact header keeps the current explanation and moves all steps into a dismissable toolbar panel at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    const header = page.locator('.d2-flow-player');
    expect((await header.boundingBox()).height).toBeLessThan(width > 480 ? 50 : 100);
    await expect(header.getByRole('combobox', { name: 'Scenario', exact: true })).toBeVisible();
    await expect(header).toContainText('Gateway nhận request');
    await expect(header.locator('.d2-flow-phase')).toHaveClass(/d2-sr-only/);
    await expect(header.locator('details')).toHaveCount(0);
    const steps = page.getByLabel('All steps (5)', { exact: true });
    await steps.click();
    const panel = page.locator('.d2-flow-transcript .d2-source-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('button')).toHaveCount(5);
    const bounds = await panel.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await panel.getByRole('button').nth(2).click();
    await expect(page.locator('.d2-flow-count')).toHaveText('3 / 5');
    await expect(panel).toBeHidden();
    await expect(steps).toBeFocused();
    await steps.click();
    await page.getByRole('heading', { name: 'Architecture lab' }).click();
    await expect(panel).toBeHidden();
    await steps.click();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(steps).toBeFocused();
  });
}

test('source closes on outside click without swallowing the next action; inside clicks and text selection keep it open', async ({ page }) => {
  await open(page);
  const source = page.getByLabel('D2 source', { exact: true });
  const menu = source.locator('..');
  await source.click();
  const code = page.getByLabel('D2 source code', { exact: true });
  await code.click();
  await expect(menu).toHaveAttribute('open');
  await code.evaluate((element) => {
    const selection = window.getSelection(); const range = document.createRange();
    range.selectNodeContents(element); selection.removeAllRanges(); selection.addRange(range);
  });
  await expect(menu).toHaveAttribute('open');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(menu).not.toHaveAttribute('open');
  await expect(page.locator('.d2-flow-count')).toHaveText('2 / 5');
  await source.click();
  await page.getByRole('heading', { name: 'Architecture lab' }).click();
  await expect(menu).not.toHaveAttribute('open');
  await source.click();
  await page.getByLabel('All steps (5)', { exact: true }).click();
  await expect(menu).not.toHaveAttribute('open');
  await expect(page.locator('.d2-flow-transcript')).toHaveAttribute('open');
});

test('Escape closes the source before fullscreen and restores focus to its icon', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const source = dialog.getByLabel('D2 source', { exact: true });
  await source.click();
  await dialog.getByLabel('D2 source code', { exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(source.locator('..')).not.toHaveAttribute('open');
  await expect(source).toBeFocused();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

for (const mode of ['flow-fast', 'flow-native']) {
  test(`${mode}: scenario membership dims unused components, not future steps in the same flow`, async ({ page }) => {
    await open(page, mode);
    for (const theme of ['light', 'dark']) {
      const root = page.locator(`.d2-diagram-${theme}`);
      await expect(root.locator('[data-d2-flow-node="n4"]')).toHaveAttribute('data-d2-flow-participates', 'false');
      await expect(root.locator('[data-d2-flow-node="n4"]')).toHaveCSS('filter', 'grayscale(1) opacity(0.35)');
      for (const edge of ['e4', 'e5', 'e6', 'e7']) {
        await expect(root.locator(`[data-d2-flow-edge="${edge}"]`)).toHaveAttribute('data-d2-flow-participates', 'false');
      }
      await expect(root.locator('[data-d2-flow-edge="e1"]')).toHaveAttribute('data-d2-flow-participates', 'true');
      await expect(root.locator('[data-d2-flow-edge="e1"]')).toHaveCSS('filter', 'none');
    }
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.d2-diagram-light [data-d2-flow-node="n4"]')).toHaveAttribute('data-d2-flow-participates', 'false');
    await page.getByRole('combobox', { name: 'Scenario', exact: true }).selectOption('miss');
    await expect(page.locator('.d2-flow-count')).toHaveText('1 / 9');
    await expect(page.locator('.d2-diagram-light [data-d2-flow-participates="false"]')).toHaveCount(0);
    await expect(page.locator('.d2-diagram-dark [data-d2-flow-participates="false"]')).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Scenario', exact: true }).selectOption('hit');
    await expect(page.locator('.d2-diagram-light [data-d2-flow-node="n4"]')).toHaveCSS('filter', 'grayscale(1) opacity(0.35)');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}

test('components unused in all scenarios remain dimmed, author-hidden nodes stay hidden and source links are not disabled', async ({ page }) => {
  await open(page, 'flow-scope');
  const metrics = page.locator('.d2-diagram-light [data-d2-flow-node="n5"]');
  await expect(metrics).toHaveAttribute('data-d2-flow-participates', 'false');
  await expect(metrics).toHaveCSS('filter', 'grayscale(1) opacity(0.35)');
  await page.getByRole('combobox', { name: 'Scenario', exact: true }).selectOption('miss');
  await expect(metrics).toHaveAttribute('data-d2-flow-participates', 'false');
  const hidden = page.locator('.d2-diagram-light [data-d2-flow-node="n6"]');
  if (await hidden.count()) await expect(hidden).toHaveCSS('opacity', '0');
  await metrics.getByText('Metrics', { exact: true }).click();
  await expect(page.locator('.source-drawer')).toBeVisible();
  await expect(page.locator('.source-drawer')).toContainText('export const demo = 1;');
});

test('a participating nested component keeps its container enabled, then updates when changing scenario', async ({ page }) => {
  await open(page, 'flow-nested');
  const root = page.locator('.d2-diagram-light');
  await expect(root.locator('[data-d2-flow-node="n0"]')).toHaveAttribute('data-d2-flow-participates', 'true');
  await expect(root.locator('[data-d2-flow-node="n0"]')).toHaveCSS('filter', 'none');
  await expect(root.locator('[data-d2-flow-node="n1"]')).toHaveAttribute('data-d2-flow-participates', 'true');
  await expect(root.locator('[data-d2-flow-node="n3"]')).toHaveAttribute('data-d2-flow-participates', 'false');
  await page.getByRole('combobox', { name: 'Scenario', exact: true }).selectOption('outer');
  await expect(root.locator('[data-d2-flow-node="n0"]')).toHaveAttribute('data-d2-flow-participates', 'false');
  await expect(root.locator('[data-d2-flow-node="n3"]')).toHaveAttribute('data-d2-flow-participates', 'true');
});

test('autoplay restarts the newly selected scenario in both directions, including after manual Pause', async ({ page }) => {
  await open(page, 'flow-autoplay');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await freezeClock(page);
  const scenario = page.getByRole('combobox', { name: 'Scenario', exact: true });
  for (const [id, count] of [['miss', '1 / 9'], ['hit', '1 / 5'], ['miss', '1 / 9']]) {
    await scenario.selectOption(id);
    await expect(page.locator('.d2-flow-count')).toHaveText(count);
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    const start = await coordinates(page);
    await page.clock.runFor(160);
    expect(await coordinates(page)).not.toEqual(start);
  }
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('switching scenario during a replay delay cancels the old timer and immediately autoplays the new flow', async ({ page }) => {
  await open(page, 'flow-loop');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await freezeClock(page);
  const scenario = page.getByRole('combobox', { name: 'Scenario', exact: true });
  await scenario.selectOption('miss');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.clock.runFor(5900);
  await expect(page.locator('.d2-flow-count')).toHaveText('9 / 9');
  await expect(page.locator('.d2-flow-phase')).toHaveText('Replay after 2 s');
  await scenario.selectOption('hit');
  await expect(page.locator('.d2-flow-count')).toHaveText('1 / 5');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.clock.runFor(2300);
  // The previous scenario's pending replay must not reset the new flow after two seconds.
  await expect(page.locator('.d2-flow-count')).toHaveText('4 / 5');
});

test('scenario changes still respect autoplay=false and reduced motion', async ({ page }) => {
  await open(page);
  await freezeClock(page);
  const scenario = page.getByRole('combobox', { name: 'Scenario', exact: true });
  await scenario.selectOption('miss');
  await page.clock.runFor(4000);
  await expect(page.locator('.d2-flow-count')).toHaveText('1 / 9');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await page.clock.resume();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, 'flow-autoplay');
  await scenario.selectOption('miss');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  const point = await coordinates(page);
  await page.waitForTimeout(350);
  expect(await coordinates(page)).toEqual(point);
  await expect(page.locator('.d2-flow-count')).toHaveText('1 / 9');
});

test('fullscreen preserves scenario, step, speed and exact progress while running, then keeps a manual pause', async ({ page }) => {
  await open(page);
  await freezeClock(page);
  await page.getByRole('combobox', { name: 'Scenario', exact: true }).selectOption('miss');
  await page.getByRole('combobox', { name: 'Speed', exact: true }).selectOption('0.5');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.clock.runFor(150);
  const before = await coordinates(page);
  const progress = await page.locator('.d2-diagram-light .d2-flow-token').getAttribute('data-flow-progress');
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Scenario', exact: true })).toHaveValue('miss');
  await expect(page.getByRole('combobox', { name: 'Speed', exact: true })).toHaveValue('0.5');
  await expect(page.locator('.d2-flow-count')).toHaveText('2 / 9');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect(page.locator('.d2-diagram-light .d2-flow-token')).toHaveAttribute('data-flow-progress', progress);
  expect(await coordinates(page)).toEqual(before);
  await page.clock.runFor(150);
  expect(await coordinates(page)).not.toEqual(before);
  const expanded = await coordinates(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  expect(await coordinates(page)).toEqual(expanded);
  await page.clock.runFor(150);
  expect(await coordinates(page)).not.toEqual(expanded);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const paused = await coordinates(page);
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await page.clock.runFor(1500);
  expect(await coordinates(page)).toEqual(paused);
  await expect(page.locator('.d2-flow-count')).toHaveText('2 / 9');
});

test('fullscreen preserves the remaining loop delay instead of stopping or restarting it', async ({ page }) => {
  await waitingForReplay(page);
  await page.clock.runFor(1400);
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.d2-flow-phase')).toHaveText('Replay after 2 s');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.clock.runFor(700);
  await expect(page.locator('.d2-flow-count')).toHaveText('1 / 5');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const paused = await coordinates(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.clock.runFor(10000);
  expect(await coordinates(page)).toEqual(paused);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
});
