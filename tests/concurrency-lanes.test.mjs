import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import * as runtime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { compile, run } from '@mdx-js/mdx';
import { parseConcurrencyLanesDescriptor, remarkConcurrencyLanes } from '@vanhiep99w/docs-kit/concurrency-lanes';
import { validateConcurrencyLanes, layoutConcurrencyLanes, formatConcurrencyTime } from '@vanhiep99w/docs-kit/concurrency-lanes/data';
import { ConcurrencyLanes } from '@vanhiep99w/docs-kit/components/concurrency-lanes';

const input = {
  title: 'Hai actor 👋', unit: 'step', provenance: { kind: 'illustrative', description: 'Tổng hợp, không chạy hệ thống.' },
  lanes: [{ id: 'a', label: 'Actor A', description: 'Lane đầu.' }, { id: 'b', label: 'Actor B' }, { id: 'empty', label: 'Không có mục' }],
  events: [
    { id: 'write', lane: 'a', at: 1, label: 'Write', description: 'Một action.' },
    { id: 'same', lane: 'a', at: 1, label: 'Cùng mốc' },
    { id: 'release', lane: 'a', at: 5, label: 'Release' },
    { id: 'read', lane: 'b', at: 6, label: 'Read' },
    { id: 'done', lane: 'b', at: 8, label: 'Done' },
  ],
  intervals: [
    { id: 'hold', lane: 'a', start: 1, end: 5, kind: 'hold', label: 'Hold' },
    { id: 'wait', lane: 'b', start: 2, end: 6, kind: 'wait', label: 'Wait' },
    { id: 'work', lane: 'b', start: 6, end: 8, kind: 'work', label: 'Work' },
  ],
  relations: [{ id: 'edge', from: 'release', to: 'read', label: 'Explicit relation', description: 'Do tác giả khai báo.' }],
};
const clone = () => structuredClone(input);
const descriptor = 'title: Demo\nunit: step\nprovenance: {kind: illustrative, description: Synthetic}\nlanes: [{id: a, label: A}]\nevents: [{id: e, lane: a, at: 0, label: Event}]';
const fence = (body, language = 'concurrency-lanes') => '\x60\x60\x60' + language + '\n' + body + '\n\x60\x60\x60';

test('layout is deterministic, immutable and keeps same-coordinate items aligned while stacking vertically', () => {
  const original = clone(); const layout = layoutConcurrencyLanes(input);
  assert.deepEqual(input, original); assert.deepEqual(layoutConcurrencyLanes(input), layout);
  const byId = new Map(layout.items.map((entry) => [entry.id, entry]));
  assert.equal(layout.extent, 8); assert.equal(byId.get('write').x, 98);
  assert.equal(byId.get('same').x, byId.get('write').x);
  assert.notEqual(byId.get('same').y, byId.get('write').y);
  assert.notEqual(byId.get('hold').y, byId.get('write').y);
  assert.equal(byId.get('hold').x, byId.get('write').x);
  assert.equal(byId.get('hold').endX, byId.get('release').x);
  assert.deepEqual(layout.lanes.map((lane) => lane.id), ['a', 'b', 'empty']);
  assert.ok(layout.lanes.at(-1).height >= 56);
  assert.equal(formatConcurrencyTime(0.1 + 0.2), '0.3');
});

test('rejects invalid schemas, sparse arrays, unknown fields, references and globally duplicate IDs', () => {
  for (const value of [null, { ...input, title: '' }, { ...input, title: 1 }, { ...input, unit: 'ns' },
    { ...input, provenance: undefined }, { ...input, provenance: { kind: 'real', description: 'X' } },
    { ...input, provenance: { ...input.provenance, typo: true } }, { ...input, lanes: [] }, { ...input, lanes: new Array(1) },
    { ...input, events: new Array(1) }, { ...input, events: undefined }, { ...input, intervals: new Array(1) },
    { ...input, relations: new Array(1) }, { ...input, typo: true }, { ...input, events: [], intervals: [], relations: [] }]) {
    assert.throws(() => validateConcurrencyLanes(value), /Concurrency Lanes/);
  }
  for (const [key, change] of [
    ['lanes', { id: 'bad id' }], ['lanes', { label: '' }], ['events', { lane: 'missing' }], ['events', { id: 'a' }],
    ['events', { label: '' }], ['events', { typo: true }], ['intervals', { lane: 'missing' }], ['intervals', { kind: 'lock' }],
    ['relations', { from: 'hold' }], ['relations', { to: 'missing' }], ['relations', { to: 'release' }],
    ['relations', { description: '' }], ['relations', { description: undefined }], ['relations', { id: 'write' }],
  ]) {
    const value = clone(); Object.assign(value[key][0], change);
    assert.throws(() => layoutConcurrencyLanes(value), /Concurrency Lanes/);
  }
  const duplicate = clone(); duplicate.events.push(duplicate.events[0]);
  assert.throws(() => validateConcurrencyLanes(duplicate), /duplicate id/);
});

test('validates logical integers, finite relative times, interval direction and resource bounds', () => {
  for (const at of [-1, 0.5, NaN, Infinity, '1', 1e12 + 1]) {
    const value = clone(); value.events[0].at = at;
    assert.throws(() => validateConcurrencyLanes(value), /coordinates|non-negative/);
  }
  for (const change of [{ start: -1 }, { end: Infinity }, { start: 5, end: 5 }, { start: 6, end: 5 }, { start: 1.5 }]) {
    const value = clone(); Object.assign(value.intervals[0], change);
    assert.throws(() => validateConcurrencyLanes(value), /Concurrency Lanes/);
  }
  for (const [key, length] of [['lanes', 17], ['events', 257], ['intervals', 129], ['relations', 129]]) {
    const value = clone(); value[key] = Array(length).fill(value[key][0]);
    assert.throws(() => validateConcurrencyLanes(value), /at most/);
  }
  const total = clone(); delete total.relations;
  total.events = Array.from({ length: 256 }, (_, i) => ({ id: 'e' + i, lane: 'a', at: i, label: 'E' }));
  assert.throws(() => validateConcurrencyLanes(total), /1–256/);
  const budget = clone(); delete budget.relations; delete budget.intervals;
  budget.events = Array.from({ length: 100 }, (_, i) => ({ id: 'e' + i, lane: 'a', at: i, label: 'x'.repeat(16384) }));
  assert.throws(() => validateConcurrencyLanes(budget), /1048576/);
  const text = clone(); text.title = 'x'.repeat(16385);
  assert.throws(() => validateConcurrencyLanes(text), /16384/);
  assert.throws(() => parseConcurrencyLanesDescriptor('x'.repeat(2097153)), /2097152/);
});

test('relative physical units, zero-origin fallback, interval-only input and long labels stay representable', () => {
  for (const unit of ['ms', 'us', 's']) {
    const value = { title: 'Physical', unit, provenance: { kind: 'measured', description: 'Aligned shared origin, filtered.' }, lanes: [{ id: 'a', label: 'A' }], events: [{ id: 'e', lane: 'a', at: 1e-15, label: 'Tiny' }] };
    const layout = layoutConcurrencyLanes(value);
    assert.equal(layout.extent, 1e-15); assert.equal(layout.items[0].x, 616);
  }
  const zero = parseConcurrencyLanesDescriptor(descriptor);
  assert.equal(layoutConcurrencyLanes(zero).extent, 1);
  const html = renderToStaticMarkup(createElement(ConcurrencyLanes, { data: zero }));
  assert.match(html, /Tất cả ở mốc 0/); assert.doesNotMatch(html, /NaN|Infinity/);
  const intervalsOnly = clone(); intervalsOnly.events = []; intervalsOnly.relations = [];
  assert.equal(layoutConcurrencyLanes(intervalsOnly).items.length, 3);
  const long = clone(); long.lanes[0].label = 'Long 👋 '.repeat(300); long.lanes[0].description = 'Description '.repeat(300);
  assert.match(renderToStaticMarkup(createElement(ConcurrencyLanes, { data: long })), /Long 👋/);
});

test('layout avoids badge collisions in every packed track, keeps original numbering and time ratios', () => {
  const data = clone(); data.unit = 'ms'; data.events = Array.from({ length: 60 }, (_, i) => ({ id: 'e' + i, lane: 'a', at: (i % 20) / 3, label: 'E' + i })); delete data.relations;
  const layout = layoutConcurrencyLanes(data);
  const tracks = new Map();
  for (const item of layout.items) {
    const key = item.lane + '/' + item.track; const track = tracks.get(key) ?? [];
    const center = (item.x + item.endX) / 2;
    const left = Math.min(item.x, center - 14); const right = Math.max(item.endX, center + 14);
    if (track.length) assert.ok(track.at(-1).right + 8 < left);
    track.push({ left, right }); tracks.set(key, track);
  }
  for (const [index, event] of data.events.entries()) {
    const item = layout.items.find((entry) => entry.id === event.id);
    assert.equal(item.number, index + 1); assert.equal(item.x, 24 + event.at / layout.extent * 592);
  }
});

test('relations preserve author assertions, including reverse coordinates and cycles, without inferring new edges', () => {
  const data = clone(); data.relations.push({ id: 'reverse', from: 'read', to: 'release', label: 'Reverse assertion', description: 'Not a verified partial order.' });
  validateConcurrencyLanes(data);
  const html = renderToStaticMarkup(createElement(ConcurrencyLanes, { data }));
  assert.equal([...html.matchAll(/data-relation="/g)].length, 2);
  assert.match(html, /Explicit relation/); assert.match(html, /Reverse assertion/);
  assert.match(html, /không tự tạo happens-before/);
});

test('SSR exposes all labels and native disclosures, scoped anchors and unique SVG marker references', () => {
  const html = renderToStaticMarkup(createElement('div', null, createElement(ConcurrencyLanes, { data: input }), createElement(ConcurrencyLanes, { data: input })));
  assert.match(html, /Bảng timeline đầy đủ/); assert.match(html, /Trục bước logic, không phải thời gian vật lý/);
  assert.match(html, /Lane đầu/); assert.match(html, /Không có mục trong lane này/);
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  assert.ok([...html.matchAll(/href="#([^"]+)"/g)].every((match) => ids.includes(match[1])));
  assert.ok([...html.matchAll(/marker-end="url\(#([^\)]+)\)"/g)].every((match) => ids.includes(match[1])));
  assert.match(html, /#1 Write/); assert.match(html, /data-kind="wait"/); assert.match(html, /data-kind="hold"/);
});

test('SQL and Java MDX fixtures compile and SSR with all timelines and relations', async () => {
  for (const name of ['sql-row-lock', 'java-publication']) {
    const path = new URL(`../examples/concurrency-lanes/${name}.mdx`, import.meta.url);
    const result = await compile({ value: await readFile(path, 'utf8'), path: path.pathname }, { remarkPlugins: [remarkConcurrencyLanes], outputFormat: 'function-body' });
    const { default: Content } = await run(String(result), { ...runtime, baseUrl: import.meta.url });
    const html = renderToStaticMarkup(createElement(Content, { components: { ConcurrencyLanes } }));
    assert.match(html, /concurrency-lanes-svg/); assert.match(html, /Quan hệ được khai báo/); assert.match(html, /Bảng timeline đầy đủ/);
  }
});

test('remark failures preserve file/fence positions, reject duplicate YAML keys and ignore unrelated fences', async () => {
  for (const body of ['title: [', descriptor + '\ntitle: duplicate', descriptor + '\nunknown: true', descriptor.replace('lane: a', 'lane: missing')]) {
    await assert.rejects(() => compile({ value: '\n\n' + fence(body), path: '/docs/bad-lanes.mdx' }, { remarkPlugins: [remarkConcurrencyLanes] }), (error) => {
      assert.match(error.message, /Concurrency Lanes failed/); assert.equal(error.file, '/docs/bad-lanes.mdx'); assert.equal(error.line, 3); return true;
    });
  }
  assert.equal(String(await compile(fence('text', 'concurrency'), { remarkPlugins: [remarkConcurrencyLanes] })), String(await compile(fence('text', 'concurrency'))));
});

test('MDX, SVG labels and descriptions escape markup without interpreting links or code', async () => {
  const value = clone(); value.title = '<script>bad</script>'; value.events[0].label = '<img src=x onerror=alert(1)>';
  value.relations[0].description = '<iframe src=x></iframe>'; value.lanes[0].description = '<b>plain</b>';
  const result = await compile(fence(JSON.stringify(value)), { remarkPlugins: [remarkConcurrencyLanes], outputFormat: 'function-body' });
  const { default: Content } = await run(String(result), { ...runtime, baseUrl: import.meta.url });
  const html = renderToStaticMarkup(createElement(Content, { components: { ConcurrencyLanes } }));
  assert.doesNotMatch(html, /<script|<iframe|<img|<b>/); assert.match(html, /&lt;iframe/); assert.match(html, /&lt;b&gt;plain/);
  assert.doesNotMatch(html, /href="https?:/);
});

test('browser entry has no parsers, Node, inspectors, renderers or execution/network code', async () => {
  const { build } = await import('esbuild');
  const result = await build({ stdin: { contents: "export { ConcurrencyLanes } from '@vanhiep99w/docs-kit/components/concurrency-lanes';", resolveDir: process.cwd() }, bundle: true, platform: 'browser', format: 'esm', write: false, metafile: true, external: ['react', 'react/jsx-runtime'], minify: true });
  const files = Object.keys(result.metafile.inputs).join('\n');
  assert.ok(result.outputFiles[0].contents.length < 25000);
  assert.doesNotMatch(files, /node_modules\/|jsonc-parser|yaml|shiki|source-explorer|d2\/|span-waterfall|marble|data-inspector/);
  const source = await readFile(new URL('../dist/components/concurrency-lanes.js', import.meta.url), 'utf8');
  assert.match(source, /^['"]use client['"]/); assert.doesNotMatch(source, /fetch\(|WebSocket|eval\(|dangerouslySetInnerHTML|XMLHttpRequest/);
  const css = await readFile(new URL('../dist/styles/concurrency-lanes.css', import.meta.url), 'utf8');
  assert.match(css, /concurrency-lanes/); assert.doesNotMatch(css, /@import|animation:|transition:/);
  console.log('Concurrency Lanes minified, React external:', result.outputFiles[0].contents.length, 'bytes');
});
