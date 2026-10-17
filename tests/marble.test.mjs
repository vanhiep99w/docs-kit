import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import * as runtime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { compile, run } from '@mdx-js/mdx';
import { parseMarbleDescriptor, remarkMarble } from '@vanhiep99w/docs-kit/marble';
import { parseMarble, prepareMarbleDiagram, validateMarbleDiagram } from '@vanhiep99w/docs-kit/marble/data';
import { MarbleDiagram } from '@vanhiep99w/docs-kit/components/marble';

const data = {
  title: 'Các sự kiện cùng frame',
  rows: [
    { id: 'source', label: 'Nguồn có nhãn dài để kiểm tra layout', marble: '--a-b-|', kind: 'source' },
    { id: 'out', label: 'Kết quả', marble: '--(x|)', kind: 'output' },
    { label: 'subscription', marble: '^--!', kind: 'subscription' },
    { label: 'error', marble: '----#', kind: 'inner' },
  ],
  values: { a: 'Giá trị tiếng Việt 👋', b: 'B', x: 'Kết quả' },
  annotations: [{ id: 'end', row: 'out', frames: [2, 2], title: 'Cùng frame', description: 'Next rồi complete.' }],
};
const clone = () => structuredClone(data);
const fence = (body) => '\x60\x60\x60marble\n' + body + '\n\x60\x60\x60';
const descriptor = 'title: Demo\nrows: [{label: source, marble: "--a-|"}]';

test('visual frames preserve whitespace, group semantics, marker types and trailing idle columns', () => {
  const row = parseMarble({ label: 'x', marble: ' ^ - (ab) - (c|) -- ' });
  assert.deepEqual(row.tokens, [
    { frame: 0, type: 'subscribe' }, { frame: 2, type: 'next', value: 'a' },
    { frame: 2, type: 'next', value: 'b' }, { frame: 4, type: 'next', value: 'c' }, { frame: 4, type: 'complete' },
  ]);
  assert.equal(row.frameCount, 7);
  assert.equal(parseMarble({ label: 'empty', marble: '' }).frameCount, 1);
  assert.deepEqual(parseMarble({ label: 'x', marble: '-#' }).tokens, [{ frame: 1, type: 'error' }]);
  const input = clone(); prepareMarbleDiagram(input); assert.deepEqual(input, data);
  assert.equal(prepareMarbleDiagram(data).frameCount, 7);
});

test('301 legacy visual rows keep the exact original parser frame positions', async () => {
  const snapshot = JSON.parse(await readFile(new URL('./fixtures/marble-legacy-rows.json', import.meta.url), 'utf8'));
  assert.equal(snapshot.rows.length, 301);
  // Deliberately simple reference implementation of the original site's column rules.
  function legacy(marble) {
    let frame = 0; const tokens = [];
    function emit(character) {
      const type = ({ '|': 'complete', '#': 'error', '^': 'subscribe', '!': 'unsubscribe' })[character] ?? 'next';
      tokens.push(type === 'next' ? { frame, type, value: character } : { frame, type });
    }
    for (let index = 0; index < marble.length; index++) {
      const character = marble[index];
      if (/\s/.test(character)) continue;
      if (character === '(') {
        const end = marble.indexOf(')', index + 1);
        for (const entry of marble.slice(index + 1, end).replace(/\s/g, '')) emit(entry);
        index = end;
      } else if (character !== '-') emit(character);
      frame++;
    }
    return { tokens, frameCount: Math.max(frame, 1) };
  }
  for (const marble of snapshot.rows) {
    const actual = parseMarble({ label: 'legacy', marble });
    assert.deepEqual({ tokens: actual.tokens, frameCount: actual.frameCount }, legacy(marble), marble);
  }
});

test('rejects unsupported TestScheduler syntax, malformed groups and events after termination', () => {
  for (const marble of ['--(ab', '--a)', '()', '((a))', '(a-b)', '.', 'a🙂', '10ms a|', '--2s--', '1.5m a', 'a|b', 'a#!', '^!a', '^^', '(a|b)', '(#|)', '(abcdefghijklm)']) {
    assert.throws(() => parseMarble({ label: 'bad', marble }), /Marble Diagram/, marble);
  }
  assert.throws(() => parseMarble({ label: 'huge', marble: '-'.repeat(513) }), /512 visual frames/);
  assert.throws(() => parseMarble({ label: 'huge', marble: ' '.repeat(4097) }), /4096 characters/);
});

test('validates diagram, values, row IDs and zero-based annotation ranges', () => {
  validateMarbleDiagram(data);
  for (const value of [null, { ...data, title: '' }, { ...data, rows: [] }, { ...data, rows: Array(41).fill(data.rows[0]) },
    { ...data, rows: [null] }, { ...data, rows: new Array(1) }, { ...data, rows: [{ label: 'x', marble: '-', kind: 'unknown' }] },
    { ...data, frameLabel: '' }, { ...data, showLegend: 'yes' }, { ...data, typo: true },
    { ...data, values: [] }, { ...data, values: { ab: 'two chars' } }, { ...data, values: { a: 1 } },
    { ...data, rows: [data.rows[0], data.rows[0]] }]) {
    assert.throws(() => validateMarbleDiagram(value), /Marble Diagram/);
  }
  for (const change of [{ row: 'missing' }, { frames: [-1, 2] }, { frames: [2, 1] }, { frames: [0, 7] },
    { frames: [0.5, 1] }, { frames: new Array(2) }, { id: 'bad id' }, { title: '' }, { typo: true }]) {
    const value = clone(); Object.assign(value.annotations[0], change);
    assert.throws(() => validateMarbleDiagram(value), /Marble Diagram/);
  }
  const duplicate = clone(); duplicate.annotations.push(duplicate.annotations[0]);
  assert.throws(() => validateMarbleDiagram(duplicate), /duplicate annotation/);
  // Annotations may describe an absent event after a shorter row, on the shared axis.
  const absence = clone(); absence.annotations[0].frames = [4, 6]; validateMarbleDiagram(absence);
});

test('SSR renders legacy JSX and data props equally with distinct markers and visible text fallback', () => {
  const direct = renderToStaticMarkup(createElement(MarbleDiagram, data));
  const wrapped = renderToStaticMarkup(createElement(MarbleDiagram, { data }));
  assert.equal(direct, wrapped);
  for (const type of ['next', 'complete', 'error', 'subscribe', 'unsubscribe']) assert.match(direct, new RegExp('data-type="' + type + '"'));
  assert.match(direct, /Bảng sự kiện/); assert.match(direct, /Frame 2: Next x: Kết quả/);
  assert.match(direct, /Frame 2: Complete/); assert.match(direct, /Next rồi complete/);
  assert.match(direct, /không mặc định là ms/);
  const markers = [...direct.matchAll(/data-frame="2"[^>]*transform="translate\((\d+) ([\d.]+)\)"/g)];
  assert.ok(markers.length >= 3);
  assert.ok(markers.every((match) => match[1] === '120'));
  assert.ok(new Set(markers.map((match) => match[2])).size > 1);
  const withoutLegend = renderToStaticMarkup(createElement(MarbleDiagram, { data: { ...data, showLegend: false } }));
  assert.doesNotMatch(withoutLegend, /aria-label="Chú thích ký hiệu"/);
  assert.match(withoutLegend, /Frame 2: Complete/);
  const two = renderToStaticMarkup(createElement('div', null, createElement(MarbleDiagram, { data }), createElement(MarbleDiagram, { data })));
  const ids = [...two.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size);
});

test('escapes labels, value descriptions, captions and annotations as text, never executable markup', async () => {
  const value = clone(); value.title = '<script>alert(1)</script>';
  value.rows[0].label = '<img src=x onerror=alert(1)>';
  value.values.a = '<b>not HTML</b>'; value.caption = '<iframe src=x>';
  value.annotations[0].description = '<svg onload=alert(1)>';
  const result = await compile(fence(JSON.stringify(value)), { remarkPlugins: [remarkMarble], outputFormat: 'function-body' });
  const { default: Content } = await run(String(result), { ...runtime, baseUrl: import.meta.url });
  const html = renderToStaticMarkup(createElement(Content, { components: { MarbleDiagram } }));
  assert.doesNotMatch(html, /<script|<img|<iframe|<b>|<svg onload/);
  assert.match(html, /&lt;b&gt;not HTML&lt;\/b&gt;/);
});

test('compiles the authored examples and validates the decisive lifecycle frames', async () => {
  for (const name of ['filter-map', 'switch-map', 'lifecycle']) {
    const path = new URL(`../examples/marble/${name}.mdx`, import.meta.url);
    const source = await readFile(path, 'utf8');
    const result = await compile({ value: source, path: path.pathname }, { remarkPlugins: [remarkMarble], outputFormat: 'function-body' });
    const { default: Content } = await run(String(result), { ...runtime, baseUrl: import.meta.url });
    assert.match(renderToStaticMarkup(createElement(Content, { components: { MarbleDiagram } })), /marble-diagram/);
    const descriptor = source.split('```marble\n')[1].split('```')[0];
    const parsed = prepareMarbleDiagram(parseMarbleDescriptor(descriptor));
    if (name === 'switch-map') {
      assert.equal(parsed.rows[0].tokens.at(-1).frame, 10);
      assert.deepEqual(parsed.rows[1].tokens.at(-1), { frame: 5, type: 'unsubscribe' });
      assert.equal(parsed.rows[3].tokens.at(-1).frame, 12);
    }
    if (name === 'lifecycle') assert.deepEqual(parsed.rows[0].tokens.map((token) => token.frame), [2, 2]);
  }
});

test('reports YAML/schema/syntax failures with file and fence location without touching other code', async () => {
  for (const body of ['title: [', descriptor + '\ntitle: duplicate', descriptor + '\nextra: nope', descriptor.replace('--a-|', '--a|b')]) {
    await assert.rejects(() => compile({ value: '\n\n' + fence(body), path: '/docs/bad-marble.mdx' }, { remarkPlugins: [remarkMarble] }), (error) => {
      assert.match(error.message, /Marble Diagram failed/); assert.equal(error.file, '/docs/bad-marble.mdx'); assert.equal(error.line, 3);
      return true;
    });
  }
  const plain = '```text\n--a--b--|\n```';
  assert.equal(String(await compile(plain, { remarkPlugins: [remarkMarble] })), String(await compile(plain)));
});

test('server-first component has no resize observers, client state, RxJS or highlighter dependency', async () => {
  const { build } = await import('esbuild');
  const result = await build({ stdin: { contents: "export { MarbleDiagram } from '@vanhiep99w/docs-kit/components/marble';", resolveDir: process.cwd() }, bundle: true, platform: 'browser', format: 'esm', write: false, metafile: true, external: ['react', 'react/jsx-runtime'], minify: true });
  assert.ok(result.outputFiles[0].contents.length < 20_000);
  assert.doesNotMatch(Object.keys(result.metafile.inputs).join('\n'), /node_modules\/|shiki|yaml|source-explorer|d2\//);
  const component = await readFile(new URL('../dist/components/marble.js', import.meta.url), 'utf8');
  assert.doesNotMatch(component, /use client|useEffect|useState|ResizeObserver|dangerouslySetInnerHTML|window\.|document\./);
});
