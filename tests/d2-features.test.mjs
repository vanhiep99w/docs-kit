import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile, truncate } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { D2 } from '@d2lang/d2';
import { compile, run } from '@mdx-js/mdx';
import * as runtime from 'react/jsx-runtime';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { remarkD2 } from '@vanhiep99w/docs-kit/d2';
import { D2InteractiveDiagram } from '@vanhiep99w/docs-kit/components/d2-interactive';
import { compileWithFittedLabels, renderDiagram } from '../dist/d2/render.mjs';
import { loadD2Resources } from '../dist/d2/resources.js';
import { shutdownPool } from '../dist/d2/pool-client.js';

const d2 = new D2();
const root = await mkdtemp(path.join(os.tmpdir(), 'docs-kit-features-'));
const cacheDir = path.join(root, 'cache');
after(async () => { await d2.dispose(); await shutdownPool({ cacheDir, concurrency: 1 }); await rm(root, { recursive: true, force: true }); });
const source = `balance: "10M"
steps: {
  update: {balance: "0 uncommitted"}
  rollback: {balance: "10M restored"}
}
scenarios: {
  committed: {balance: "Read committed"}
}`;
const fence = (meta = '', body = source) => '```d2 ' + meta + '\n' + body + '\n```';
const decode = (node) => Object.fromEntries(node.attributes.map(({ name, value }) => {
  const expression = value.data.estree.body[0].expression;
  return [name, expression.type === 'Literal' ? expression.value : JSON.parse(expression.arguments[0].value)];
}));
async function transform(value, options = {}) {
  let tree;
  const capture = () => (result) => { tree = result; };
  const compiled = await compile({ value, path: path.join(root, 'page.mdx'), cwd: root }, {
    remarkPlugins: [[remarkD2, { cacheDir, ...options }], capture],
  });
  return { tree, compiled: String(compiled), props: decode(tree.children[0]) };
}

test('preserves explicit label positions and sequence group/note semantics in every engine', async () => {
  const sequence = `shape: sequence_diagram
alice
bob
shower thoughts: {
  alice -> bob: Think
  bob."A note"
}
bob -> alice: Done`;
  for (const layout of ['elk', 'dagre', 'tala']) {
    const placed = await compileWithFittedLabels(d2, 'a: Hello {label.near: outside-bottom-center}\na -> b', { layout });
    assert.equal(placed.diagram.shapes.find((shape) => shape.id === 'a').labelPosition, 'OUTSIDE_BOTTOM_CENTER');
    assert.ok(!placed.labelLayout.some((shape) => shape.id === 'a'));
    const nestedLabel = await compileWithFittedLabels(d2, 'c: {a: Hello {label.near: outside-bottom-center}}', { layout });
    assert.equal(nestedLabel.diagram.shapes.find((shape) => shape.id === 'c.a').labelPosition, 'OUTSIDE_BOTTOM_CENTER');
    const result = await compileWithFittedLabels(d2, sequence, { layout });
    assert.equal(result.labelLayout.length, 0);
    assert.equal(result.diagram.shapes.find((shape) => shape.id === 'shower thoughts').labelPosition, 'INSIDE_TOP_LEFT');
    const nested = await compileWithFittedLabels(d2, `flow: {${sequence}}\nflow -> end`, { layout });
    assert.ok(!nested.labelLayout.some((shape) => shape.id.startsWith('flow.')));
    const deep = await compileWithFittedLabels(d2, `outer: {flow: {${sequence}}}`, { layout });
    assert.equal(deep.labelLayout.length, 0);
  }
});

test('fitLabels=off preserves original fixed boxes', async () => {
  const result = await compileWithFittedLabels(d2, 'a: "A very long label" {width: 30; height: 20}', { fitLabels: 'off' });
  assert.deepEqual(result.labelLayout, []);
  assert.equal(result.diagram.shapes[0].width, 30);
});

test('uses independent light/dark overrides from D2 source and explicit configuration', async () => {
  const source = 'vars: {d2-config: {theme-overrides: {B1: "#ff0000"}; dark-theme-overrides: {B1: "#00ff00"}}}\na -> b';
  const result = await renderDiagram(d2, { source, salt: 'palette' });
  assert.match(result.lightSvg, /#ff0000/); assert.doesNotMatch(result.lightSvg, /#00ff00/);
  assert.match(result.darkSvg, /#00ff00/); assert.doesNotMatch(result.darkSvg, /#ff0000/);
  const override = await renderDiagram(d2, { source, salt: 'palette', options: { lightOverrides: { B1: '#123456' }, darkOverrides: { B1: '#654321' } } });
  assert.match(override.lightSvg, /#123456/); assert.match(override.darkSvg, /#654321/);
});

test('builds every board with inheritance, isolated SVG IDs and native animation', async () => {
  const result = await renderDiagram(d2, { source, salt: 'boards', options: { mode: 'animation' } });
  assert.deepEqual(result.boards.map((board) => board.id), ['', 'scenarios.committed', 'steps.update', 'steps.rollback']);
  assert.match(result.boards[2].lightSvg, /uncommitted/);
  assert.match(result.boards[3].lightSvg, /restored/);
  assert.match(result.animation.lightSvg, /d2Transition/);
  const ids = new Set();
  for (const board of result.boards) for (const svg of [board.lightSvg, board.darkSvg]) {
    for (const [, id] of svg.matchAll(/\bid="([^"]+)"/g)) { assert.ok(!ids.has(id), `duplicate ${id}`); ids.add(id); }
  }
  const selected = await renderDiagram(d2, { source, salt: 'selected', options: { mode: 'steps', target: 'steps.update' } });
  assert.deepEqual(selected.boards.map((board) => board.id), ['steps.update']);
  await assert.rejects(renderDiagram(d2, { source, salt: 'limit', options: { mode: 'steps', maxBoards: 2 } }), /maxBoards/);
});

test('handles quoted layer names, descendants and folder-only roots', async () => {
  const result = await renderDiagram(d2, { source: `layers: { "api.v1": { a: "API"; layers: { detail: { b: "Handler" } } } }`, salt: 'layers', options: { mode: 'explorer' } });
  assert.deepEqual(result.boards.map((board) => board.id), ['layers."api.v1"', 'layers."api.v1".layers.detail']);
  assert.equal(result.boards[1].parent, 'layers."api.v1"');
});

test('opt-in MDX emits structured props without affecting the static default', async () => {
  const plain = await transform(fence('', 'a -> b'));
  assert.equal(plain.tree.children[0].name, 'D2Diagram');
  assert.ok(!('source' in plain.props));
  for (const mode of ['steps', 'tabs', 'explorer', 'animation']) {
    const result = await transform(fence(`mode=${mode} interval=1000 sketch=false scale=1 padding=20 lightTheme=4 darkTheme=200`));
    assert.equal(result.tree.children[0].name, 'D2InteractiveDiagram');
    assert.equal(result.props.source, source); assert.equal(result.props.mode, mode); assert.equal(result.props.interval, 1000);
    assert.equal(result.props.boards.length, mode === 'steps' ? 3 : mode === 'tabs' ? 2 : 4);
    assert.doesNotMatch(result.props.lightSvg, /<pattern id="streaks-/);
    assert.match(result.compiled, /JSON.parse/);
    assert.doesNotMatch(result.compiled, /@d2lang|node:fs/);
  }
  assert.equal((await transform(fence('interactive', 'a -> b'))).tree.children[0].name, 'D2InteractiveDiagram');
  assert.equal((await transform(fence('interactive=false', 'a -> b'), { interactive: true })).tree.children[0].name, 'D2Diagram');
});

test('rejects invalid new options and duplicate fences with source locations', async () => {
  for (const options of [{ mode: 'bad' }, { interactive: 'yes' }, { interval: 0 }, { maxBoards: 129 }, { fitLabels: 'bad' }, { target: '*' }, { themeOverrides: { light: { bad: '#fff' } } }]) {
    assert.throws(() => remarkD2(options), /docs-kit D2:/);
  }
  for (const meta of ['mode=bad', 'interval=NaN', 'interactive=maybe', 'sketch=foo', 'padding=-2', 'target=*', 'mode=steps mode=tabs', 'scale=', 'fitLabels=bad']) {
    await assert.rejects(transform(fence(meta)), (error) => { assert.match(error.file, /page.mdx/); assert.equal(error.line, 1); return true; });
  }
});

test('virtual imports and local images are bounded, portable and cache-invalidated', async () => {
  await mkdir(path.join(root, 'shared')); await mkdir(path.join(root, 'images'));
  await writeFile(path.join(root, 'shared', 'model.d2'), 'a: First');
  await writeFile(path.join(root, 'images', 'server.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>');
  const options = { importsRoot: 'shared', assetsRoot: 'images' };
  const body = '...@shared/model\na.icon: ./images/server.svg\na -> b';
  const one = await transform(fence('', body), options);
  assert.match(one.props.lightSvg, /First/); assert.match(one.props.lightSvg, /data:image\/svg\+xml;base64/);
  const before = (await readdir(cacheDir)).length;
  await writeFile(path.join(root, 'shared', 'model.d2'), 'a: Changed');
  const two = await transform(fence('', body), options);
  assert.match(two.props.lightSvg, /Changed/); assert.ok((await readdir(cacheDir)).length > before);
  await assert.rejects(transform(fence('', '...@../outside'), options), /D2 diagram failed/);
  await assert.rejects(loadD2Resources({ importsRoot: root }, '/outside/page.mdx', root), /inside file.cwd/);
  await symlink(path.join(root, 'page.mdx'), path.join(root, 'shared', 'escape.d2'));
  await assert.rejects(loadD2Resources(options, path.join(root, 'page.mdx'), root), /symlinks/);
  await rm(path.join(root, 'shared', 'escape.d2'));
});

test('custom font bytes are forwarded to compilation and fingerprinted resources', async () => {
  await writeFile(path.join(root, 'font.ttf'), new Uint8Array([0, 1, 2, 3]));
  const resources = await loadD2Resources({ fonts: { regular: 'font.ttf' } }, undefined, root);
  assert.equal(resources.fonts.fontRegular, 'AAECAw==');
  let received;
  await compileWithFittedLabels({ compile: async (input) => { received = input; return { diagram: { shapes: [] }, graph: {} }; } }, 'a', {}, resources);
  assert.deepEqual(JSON.parse(JSON.stringify(received.options.fontRegular)), [0, 1, 2, 3]);
  await assert.rejects(loadD2Resources({ fonts: { regular: 'font.woff' } }, undefined, root), /ttf/);
});

test('SSR has useful no-JS views and escaped source; controls auto-load after hydration', async () => {
  const html = renderToStaticMarkup(createElement(D2InteractiveDiagram, { id: 'ssr', caption: 'Example', source: '<script>alert(1)</script>',
    lightSvg: '<svg/>', darkSvg: '<svg/>', boards: [{ id: '', label: 'Overview', kind: 'root', lightSvg: '<svg/>', darkSvg: '<svg/>' },
      { id: 'steps.next', label: 'Next step', kind: 'step', lightSvg: '<svg/>', darkSvg: '<svg/>' }] }));
  assert.doesNotMatch(html, /Explore/); assert.match(html, /aria-label="D2 source"/);
  assert.match(html, /All views/); assert.match(html, /Next step/);
  assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>/);
  const entry = await readFile(new URL('../dist/components/d2-interactive.js', import.meta.url), 'utf8');
  assert.match(entry, /^['"]use client['"]/); assert.match(entry, /lazy\(\(\) => import\('\.\/d2-viewer.js'\)\)/);
  assert.doesNotMatch(entry, /@d2lang|node:|\.wasm/);
});


test('all shipped examples compile through the fitted renderer', async () => {
  const directory = new URL('../examples/d2/', import.meta.url);
  const files = (await readdir(directory)).filter((name) => name.endsWith('.d2'));
  const fs = Object.fromEntries(await Promise.all(files.map(async (name) => [name, await readFile(new URL(name, directory), 'utf8')])));
  for (const name of files.filter((name) => name !== 'shared.d2')) {
    const options = { mode: name === 'transaction.d2' ? 'steps' : name === 'scenarios.d2' ? 'tabs' : name === 'architecture.d2' ? 'explorer' : 'static' };
    const result = await renderDiagram(d2, { source: fs[name], salt: name, options, resources: { fs, inputPath: name } });
    assert.match(result.lightSvg, /^<svg/);
    if (options.mode !== 'static') assert.ok(result.boards.length > 1);
  }
});


test('fits inherited undersized labels in real boards, never literal containers named steps', async () => {
  for (const layout of ['elk', 'dagre', 'tala']) {
    const result = await compileWithFittedLabels(d2, `a: Base {width: 30; height: 20}
steps: {
  "first.step": {a: "Long inherited label"}
  second: {a: "A much longer inherited label"}
}`, { layout });
    assert.deepEqual(result.diagram.shapes.map((shape) => shape.id), ['a']);
    assert.equal(result.labelLayout.length, 3);
    assert.ok(result.labelLayout.every((shape) => shape.width >= shape.labelWidth + 24 && shape.height >= shape.labelHeight + 16));
    assert.ok(result.diagram.steps[1].shapes[0].width > result.diagram.steps[0].shapes[0].width);
  }
});

test('resources enforce file/byte limits before reading oversized data', async () => {
  const many = path.join(root, 'many'); await mkdir(many);
  await Promise.all(Array.from({ length: 257 }, (_, index) => writeFile(path.join(many, `${index}.d2`), 'a')));
  await assert.rejects(loadD2Resources({ importsRoot: 'many' }, path.join(root, 'page.mdx'), root), /256 files/);
  const large = path.join(root, 'large.ttf'); await writeFile(large, ''); await truncate(large, 9 * 1024 * 1024);
  await assert.rejects(loadD2Resources({ fonts: { regular: 'large.ttf' } }, undefined, root), /8 MB/);
});

test('invalid optional data in a disk cache is regenerated, not dereferenced', async () => {
  const value = fence('mode=steps', 'a: "Unique cache test"\nsteps: { next: {a: fixed} }');
  await transform(value);
  let corrupted = 0;
  for (const name of await readdir(cacheDir)) {
    if (!name.endsWith('.json')) continue;
    const file = path.join(cacheDir, name);
    const entry = JSON.parse(await readFile(file, 'utf8'));
    if (entry.boards?.length === 2 && entry.lightSvg.includes('Unique cache test')) {
      entry.boards = [null]; entry.animation = null; corrupted++;
      await writeFile(file, JSON.stringify(entry));
    }
  }
  assert.ok(corrupted > 0);
  const result = await transform(value);
  assert.equal(result.props.boards.length, 2);
});


test('structured board props survive actual MDX execution and SSR', async () => {
  const code = await compile({value: fence('mode=steps'),path:path.join(root,'executed.mdx'),cwd:root}, {
    outputFormat:'function-body', remarkPlugins:[[remarkD2,{cacheDir}]],
  });
  const module = await run(String(code), { ...runtime, baseUrl: import.meta.url });
  const html = renderToStaticMarkup(createElement(module.default,{components:{D2InteractiveDiagram}}));
  assert.doesNotMatch(html,/Explore/);
  assert.match(html,/All views \(3\)/);
  assert.match(html,/All views/);
});

test('normalizes native D2 links with quoted dots, Unicode and parent references', async () => {
  const {normalizeD2BoardLink} = await import('../dist/components/d2-navigation.js');
  assert.equal(normalizeD2BoardLink('root'), '');
  assert.equal(normalizeD2BoardLink('root.layers.detail'), 'layers.detail');
  assert.equal(normalizeD2BoardLink('root.layers."api.v1"'), 'layers."api.v1"');
  assert.equal(normalizeD2BoardLink('root.layers.Chi tiết'), 'layers."Chi tiết"');
});
