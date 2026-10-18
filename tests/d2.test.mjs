import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { compile } from '@mdx-js/mdx';
import { D2 } from '@d2lang/d2';
import { renderDiagram } from '../dist/d2/render.mjs';
import { renderToStaticMarkup } from 'react-dom/server';
import { remarkD2 } from '@vanhiep99w/docs-kit/d2';
import { D2Diagram } from '@vanhiep99w/docs-kit/components/d2';
import { shutdownPool } from '../dist/d2/pool-client.js';

const originalDirectory = process.cwd();
const workspace = await mkdtemp(path.join(os.tmpdir(), 'docs-kit-tests-'));
// There is no host lib/ or node_modules/ here. Package assets must resolve
// relative to the installed module, not to process.cwd().
process.chdir(workspace);
after(async () => {
  await Promise.all(['.cache/docs-kit/d2', 'custom-cache', 'portable-cache', 'layouts-cache', 'scale-cache'].map((directory) =>
    shutdownPool({ cacheDir: path.join(workspace, directory), concurrency: 1 })));
  process.chdir(originalDirectory);
  await rm(workspace, { recursive: true, force: true });
});

async function transform(value, options = {}, file = 'example.mdx', cwd = process.cwd()) {
  let tree;
  const capture = () => (result) => { tree = result; };
  const result = await compile({ value, path: file, cwd }, {
    remarkPlugins: [[remarkD2, options], capture],
  });
  return { tree, compiled: String(result) };
}

function props(node) {
  return Object.fromEntries(node.attributes.map(({ name, value }) => [
    name, value.data.estree.body[0].expression.value,
  ]));
}

function assertScale(svg, scale) {
  const [, viewWidth, viewHeight, width, height] = svg.match(
    /viewBox="0 0 ([\d.]+) ([\d.]+)" width="([\d.]+)" height="([\d.]+)"/,
  );
  assert.ok(Math.abs(+width - +viewWidth * scale) <= 1);
  assert.ok(Math.abs(+height - +viewHeight * scale) <= 1);
}

const fence = '```d2 title="Guard và resolver"\na -> b\n```';

test('renders from a foreign working directory with themed sketch SVGs', async () => {
  const { tree, compiled } = await transform(fence);
  const node = tree.children[0];
  assert.equal(node.name, 'D2Diagram');
  const result = props(node);
  assert.equal(result.caption, 'Guard và resolver');
  assert.match(result.lightSvg, /^<svg/);
  assert.match(result.darkSvg, /^<svg/);
  assert.notEqual(result.lightSvg, result.darkSvg);
  assertScale(result.lightSvg, 1);
  assertScale(result.darkSvg, 1);
  assert.match(result.lightSvg, /<pattern id="streaks-/);
  assert.match(result.lightSvg, /<rect\b[^>]*fill="transparent"/);
  assert.doesNotMatch(result.lightSvg, /prefers-color-scheme|<\?xml/);
  assert.doesNotMatch(compiled, /@terrastruct|@d2lang|child_process|labelLayout/);
});

test('direct renderer defaults to scale 1 and preserves explicit overrides', async () => {
  const d2 = new D2();
  try {
    for (const scale of [undefined, 0.6]) {
      const result = await renderDiagram(d2, {
        source: 'a -> b', salt: 'scale-regression', options: { scale },
      });
      assertScale(result.lightSvg, scale ?? 1);
      assertScale(result.darkSvg, scale ?? 1);
    }
  } finally {
    await d2.dispose();
  }
});

test('default scale shares cache with explicit 1, not the previous 0.8', async () => {
  const options = { cacheDir: './scale-cache' };
  const legacy = props((await transform(fence, { ...options, scale: 0.8 })).tree.children[0]);
  const native = props((await transform(fence, options)).tree.children[0]);
  for (const theme of ['lightSvg', 'darkSvg']) {
    assertScale(legacy[theme], 0.8);
    assertScale(native[theme], 1);
  }
  assert.equal((await readdir(options.cacheDir)).filter((file) => file.endsWith('.json')).length, 2);
  const explicit = props((await transform(fence, { ...options, scale: 1 })).tree.children[0]);
  assert.deepEqual(explicit, native);
  assert.equal((await readdir(options.cacheDir)).filter((file) => file.endsWith('.json')).length, 2);

  const overridden = props((await transform('```d2 scale=0.6\na -> b\n```', { ...options, scale: 0.8 })).tree.children[0]);
  assertScale(overridden.lightSvg, 0.6);
  assertScale(overridden.darkSvg, 0.6);
});

test('reuses disk cache without rewriting it', async () => {
  await transform(fence);
  const directory = path.join(workspace, '.cache/docs-kit/d2');
  const filesBefore = (await readdir(directory)).filter((f) => f.endsWith('.json')).sort();
  const dataBefore = await Promise.all(filesBefore.map((f) => readFile(path.join(directory, f), 'utf8')));
  await transform(fence);
  const filesAfter = (await readdir(directory)).filter((f) => f.endsWith('.json')).sort();
  assert.deepEqual(filesAfter, filesBefore);
  assert.deepEqual(await Promise.all(filesAfter.map((f) => readFile(path.join(directory, f), 'utf8'))), dataBefore);
});

test('keeps normal code and ASCII fences unchanged', async () => {
  const { tree } = await transform('```text\na -> b\n```\n\n```ts\nconst n = 1;\n```');
  assert.deepEqual(tree.children.map(({ type, lang }) => [type, lang]), [
    ['code', 'text'], ['code', 'ts'],
  ]);
});

test('uses independent SVG IDs for duplicate diagrams and documents', async () => {
  const { tree } = await transform(`${fence}\n\n${fence}`, {}, 'duplicates.mdx');
  const first = props(tree.children[0]);
  const second = props(tree.children[1]);
  const other = props((await transform(fence, {}, 'other.mdx')).tree.children[0]);
  const ids = (svg) => [...svg.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const firstIds = ids(first.lightSvg);
  assert.ok(firstIds.length);
  for (const svg of [first.darkSvg, second.lightSvg, other.lightSvg]) {
    const nextIds = new Set(ids(svg));
    assert.ok(firstIds.every((id) => !nextIds.has(id)));
  }
});

test('accepts renderer settings and isolates cache entries by settings', async () => {
  const { tree } = await transform('```d2\na -> b\n```', {
    cacheDir: './custom-cache', sketch: false, layout: 'dagre', scale: 0.5,
    padding: 8, themes: { light: 100, dark: 200 }, defaultCaption: 'Sơ đồ', concurrency: 1,
  });
  const result = props(tree.children[0]);
  assert.equal(result.caption, 'Sơ đồ');
  assert.doesNotMatch(result.lightSvg, /<pattern id="streaks-/);
  const [, viewWidth, , width] = result.lightSvg.match(
    /viewBox="0 0 ([\d.]+) ([\d.]+)" width="([\d.]+)" height="([\d.]+)"/,
  );
  assert.ok(Math.abs(+width / +viewWidth - 0.5) < 0.02);
  assert.equal((await readdir('custom-cache')).filter((p) => p.endsWith('.json')).length, 1);
  await transform('```d2\na -> b\n```', { cacheDir: './custom-cache', scale: 0.75 });
  assert.equal((await readdir('custom-cache')).filter((p) => p.endsWith('.json')).length, 2);
});

test('renders all three layout engines and keeps their disk caches separate', async () => {
  const options = { cacheDir: './layouts-cache' };
  for (const layout of ['elk', 'dagre', 'tala']) {
    const { tree } = await transform(fence, { ...options, layout });
    const result = props(tree.children[0]);
    assert.match(result.lightSvg, /^<svg/);
    assert.match(result.darkSvg, /^<svg/);
    assert.notEqual(result.lightSvg, result.darkSvg);
    assert.match(result.lightSvg, /<pattern id="streaks-/);
    assert.match(result.lightSvg, /<rect\b[^>]*fill="transparent"/);
  }
  const files = (await readdir(options.cacheDir)).filter((file) => file.endsWith('.json'));
  assert.equal(files.length, 3);
  const before = await Promise.all(files.map((file) => readFile(path.join(options.cacheDir, file), 'utf8')));
  await transform(fence, { ...options, layout: 'tala' });
  assert.equal((await readdir(options.cacheDir)).filter((file) => file.endsWith('.json')).length, 3);
  assert.deepEqual(await Promise.all(files.map((file) => readFile(path.join(options.cacheDir, file), 'utf8'))), before);
});

test('reports the source filename and position for invalid D2', async () => {
  await assert.rejects(transform('```d2\na: {\n```', {}, 'broken.mdx'), (error) => {
    assert.match(error.message, /D2 diagram failed/);
    assert.match(error.file, /broken\.mdx$/);
    assert.equal(error.line, 1);
    return true;
  });
  const { tree } = await transform('```d2\na: Fixed\n```', {}, 'broken.mdx');
  assert.match(props(tree.children[0]).lightSvg, /Fixed/);
});

test('reuses cache and SVG IDs after moving a checkout to a different absolute path', async () => {
  const options = { cacheDir: path.join(workspace, 'portable-cache') };
  const one = path.join(workspace, 'checkout-one');
  const two = path.join(workspace, 'checkout-two');
  const first = props((await transform(fence, options, path.join(one, 'content/page.mdx'), one)).tree.children[0]);
  const second = props((await transform(fence, options, path.join(two, 'content/page.mdx'), two)).tree.children[0]);
  assert.deepEqual(second, first);
  const files = (await readdir(options.cacheDir)).filter((file) => file.endsWith('.json'));
  assert.equal(files.length, 1);
});

test('rejects invalid options before starting a renderer', () => {
  for (const options of [{ scale: 0 }, { padding: -1 }, { concurrency: 0 },
    { concurrency: 9 }, { poolIdleTimeoutMs: 0 }, { layout: 'unknown' }, { defaultCaption: '' }, { themes: { light: -1 } }]) {
    assert.throws(() => remarkD2(options), /docs-kit D2:/);
  }
});

test('the component is a pure React entry point with accessible captions', async () => {
  const source = await readFile(new URL(import.meta.resolve('@vanhiep99w/docs-kit/components/d2')), 'utf8');
  assert.doesNotMatch(source, /node:|@terrastruct|@d2lang|child_process|\.wasm/);
  const markup = renderToStaticMarkup(D2Diagram({
    id: 'diagram', caption: 'Guard <resolver>', className: 'custom',
    lightSvg: '<svg data-theme="light"></svg>', darkSvg: '<svg data-theme="dark"></svg>',
  }));
  assert.match(markup, /aria-labelledby="diagram-caption"/);
  assert.match(markup, /id="diagram-caption"/);
  assert.match(markup, /Guard &lt;resolver&gt;/);
  assert.match(markup, /d2-diagram not-prose custom/);
});

test('ships isolated component CSS without site-wide layout overrides', async () => {
  const css = await readFile(new URL(import.meta.resolve('@vanhiep99w/docs-kit/styles/d2.css')), 'utf8');
  assert.match(css, /\.d2-diagram/);
  assert.match(css, /data-theme='dark'/);
  assert.doesNotMatch(css, /#nd-docs-layout|--fd-layout-width|@import/);
});
