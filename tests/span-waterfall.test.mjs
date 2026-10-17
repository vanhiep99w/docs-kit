import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import * as runtime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { compile, run } from '@mdx-js/mdx';
import { prepareSpanWaterfall, parseSpanWaterfallDescriptor, remarkSpanWaterfall } from '@vanhiep99w/docs-kit/span-waterfall';
import { validateSpanWaterfallInput, validatePreparedSpanWaterfall, waterfallRows, waterfallExtent, formatSpanTime } from '@vanhiep99w/docs-kit/span-waterfall/data';
import { inspectorValue } from '@vanhiep99w/docs-kit/data-inspector/data';
import { SpanWaterfall } from '@vanhiep99w/docs-kit/components/span-waterfall';

const input = {
  title: 'Fan-out 👋', unit: 'ms', provenance: { kind: 'illustrative', description: 'Synthetic fixture, shared clock.' },
  spans: [
    { id: 'query', parent: 'a', name: 'Query', service: 'db', start: 12.5, duration: 5, attributes: ' \r\n{"id":9007199254740993,"huge":1e309}\r\n' },
    { id: 'root', name: 'Request', service: 'api', start: 5, duration: 30, status: 'ok' },
    { id: 'a', parent: 'root', name: 'Call A', service: 'a', start: 10, duration: 20, status: 'error' },
    { id: 'b', parent: 'root', name: 'Call B', service: 'b', start: 10, duration: 8 },
    { id: 'zero', parent: 'root', name: 'Zero', service: 'api', start: 35, duration: 0 },
  ],
  annotations: [{ id: 'parallel', span: 'b', title: 'Overlap', description: 'Do not sum overlapping durations.' }],
};
const clone = () => structuredClone(input);
const descriptor = 'title: Demo\nunit: ms\nprovenance: {kind: illustrative, description: Synthetic}\nspans: [{id: r, name: Root, service: api, start: 0, duration: 10}]';
const fence = (body, lang = 'span-waterfall') => '\x60\x60\x60' + lang + '\n' + body + '\n\x60\x60\x60';

test('prepares lossless attributes without mutation, accepts forward parents and preserves sibling order', () => {
  const original = clone(); const data = prepareSpanWaterfall(input);
  assert.deepEqual(input, original);
  assert.equal(data.spans[0].attributes.json, input.spans[0].attributes);
  assert.equal(inspectorValue(data.spans[0].attributes, '/id'), '9007199254740993');
  assert.equal(inspectorValue(data.spans[0].attributes, '/huge'), '1e309');
  assert.deepEqual(waterfallRows(data.spans).map(({ span, depth }) => [span.id, depth]), [['root', 0], ['a', 1], ['query', 2], ['b', 1], ['zero', 1]]);
  assert.equal(waterfallExtent(data.spans), 35);
  assert.equal(formatSpanTime(0.1 + 0.2), '0.3');
});

test('rejects malformed schemas, nonfinite/negative times, imprecise ends, duplicates and cycles', () => {
  for (const value of [null, { ...input, title: '' }, { ...input, unit: 'ns' }, { ...input, provenance: undefined },
    { ...input, provenance: { kind: 'real', description: 'x' } }, { ...input, provenance: { ...input.provenance, typo: true } },
    { ...input, spans: [] }, { ...input, spans: new Array(1) }, { ...input, spans: Array(257).fill(input.spans[1]) }, { ...input, typo: true }]) {
    assert.throws(() => validateSpanWaterfallInput(value), /Span Waterfall/);
  }
  for (const change of [{ id: 'bad id' }, { name: '' }, { service: '' }, { status: 'success' }, { start: -1 }, { start: NaN },
    { start: Infinity }, { start: '1' }, { duration: -1 }, { duration: Infinity }, { start: 1e12, duration: 1 },
    { start: 1e11, duration: 1e-20 }, { parent: 'absent' }, { parent: 'query' }, { typo: true }]) {
    const value = clone(); Object.assign(value.spans[0], change);
    assert.throws(() => prepareSpanWaterfall(value), /Span Waterfall/);
  }
  const duplicated = clone(); duplicated.spans.push(duplicated.spans[0]);
  assert.throws(() => prepareSpanWaterfall(duplicated), /duplicate span/);
  const cycle = clone(); cycle.spans[1].parent = 'query';
  assert.throws(() => prepareSpanWaterfall(cycle), /cycle/);
});

test('multiple roots, zero durations, very small times and out-of-parent async spans remain explicit', () => {
  const value = clone(); value.spans[0].start = 40; value.spans[0].duration = 10;
  value.spans.push({ id: 'other-root', name: 'Other root', service: 'worker', start: 0, duration: 0 });
  const data = prepareSpanWaterfall(value);
  assert.equal(waterfallExtent(data.spans), 50);
  assert.equal(waterfallRows(data.spans).at(-1).depth, 0);
  assert.equal(waterfallExtent([{ start: 0, duration: 0 }]), 1);
  const zero = prepareSpanWaterfall({ ...input, spans: [{ id: 'r', name: 'Zero', service: 'api', start: 0, duration: 0 }], annotations: undefined });
  const zeroHTML = renderToStaticMarkup(createElement(SpanWaterfall, { data: zero }));
  assert.match(zeroHTML, /mốc cuối 0 ms/); assert.match(zeroHTML, /chỉ là scale hiển thị/);
  assert.equal(waterfallExtent([{ start: 0, duration: 1e-15 }]), 1e-15);
  const html = renderToStaticMarkup(createElement(SpanWaterfall, { data }));
  assert.match(html, /data-zero="true"/); assert.doesNotMatch(html, /NaN|Infinity/);
});

test('bounds nesting, annotations, text and aggregate attribute sources', () => {
  const deep = clone(); delete deep.annotations;
  deep.spans = Array.from({ length: 18 }, (_, i) => ({ id: 's' + i, ...(i ? { parent: 's' + (i - 1) } : {}), name: 'S', service: 'api', start: 0, duration: 1 }));
  assert.throws(() => prepareSpanWaterfall(deep), /depth 16/);
  deep.spans.pop(); prepareSpanWaterfall(deep);
  for (const change of [{ span: 'missing' }, { span: '' }, { id: 'bad id' }, { title: '' }, { description: '' }, { typo: true }]) {
    const value = clone(); Object.assign(value.annotations[0], change);
    assert.throws(() => prepareSpanWaterfall(value), /Span Waterfall/);
  }
  const duplicate = clone(); duplicate.annotations.push(duplicate.annotations[0]);
  assert.throws(() => prepareSpanWaterfall(duplicate), /duplicate annotation/);
  const many = clone(); many.annotations = Array(101).fill(many.annotations[0]);
  assert.throws(() => prepareSpanWaterfall(many), /100/);
  const long = clone(); long.spans[0].name = 'x'.repeat(16385);
  assert.throws(() => prepareSpanWaterfall(long), /16384/);
  const total = clone(); total.spans = Array.from({ length: 5 }, (_, i) => ({ id: 's' + i, name: 'S', service: 'api', start: 0, duration: 1, attributes: '"' + 'x'.repeat(250000) + '"' })); delete total.annotations;
  assert.throws(() => prepareSpanWaterfall(total), /1048576/);
  assert.throws(() => parseSpanWaterfallDescriptor('x'.repeat(2097153)), /2097152/);
});

test('uses strict Inspector parser and validates prepared attributes before rendering', () => {
  for (const attributes of ['{"id":1,"id":2}', '{"id":1,}', '{broken}', '{} //comment', { id: 1 }, 'x'.repeat(262145)]) {
    const value = clone(); value.spans[0].attributes = attributes;
    assert.throws(() => prepareSpanWaterfall(value), /Data Inspector/);
  }
  const data = prepareSpanWaterfall(input); data.spans[0].attributes.nodes[0].offset = -1;
  assert.throws(() => validatePreparedSpanWaterfall(data), /node offsets/);
  assert.throws(() => renderToStaticMarkup(createElement(SpanWaterfall, { data })), /node offsets/);
});

test('SSR contains accessible timing, status, provenance, all details and a complete native table', () => {
  const data = prepareSpanWaterfall(input);
  const html = renderToStaticMarkup(createElement(SpanWaterfall, { data }));
  assert.match(html, /Trace minh họa/); assert.match(html, /Bảng thời gian đầy đủ/);
  assert.match(html, /Bắt đầu 12.5 ms, thời lượng 5 ms, cấp 2/);
  assert.match(html, /Call A/); assert.match(html, /Lỗi/); assert.match(html, /data-inspector/);
  assert.match(html, /left:35.714285714285715%;width:14.285714285714285%/);
  const two = renderToStaticMarkup(createElement('div', null, createElement(SpanWaterfall, { data }), createElement(SpanWaterfall, { data })));
  const ids = [...two.matchAll(/ id="([^"]+)"/g)].map((x) => x[1]);
  assert.equal(ids.length, new Set(ids).size);
  assert.ok([...two.matchAll(/href="#([^"]+)"/g)].every((x) => ids.includes(x[1])));
  const measured = { ...data, provenance: { kind: 'measured', description: 'Filtered capture from local demo, aligned clocks.' } };
  assert.match(renderToStaticMarkup(createElement(SpanWaterfall, { data: measured })), /Trace đo thực tế/);
});

test('two MDX fixtures compile, SSR and reuse Inspector for attributes', async () => {
  for (const name of ['api-cache', 'parallel-services']) {
    const path = new URL(`../examples/span-waterfall/${name}.mdx`, import.meta.url);
    const result = await compile({ value: await readFile(path, 'utf8'), path: path.pathname }, { remarkPlugins: [remarkSpanWaterfall], outputFormat: 'function-body' });
    const { default: Content } = await run(String(result), { ...runtime, baseUrl: import.meta.url });
    const html = renderToStaticMarkup(createElement(Content, { components: { SpanWaterfall } }));
    assert.match(html, /span-waterfall-chart/); assert.match(html, /data-inspector/); assert.match(html, /Chú thích span/);
  }
});

test('remark failures retain file and fence position, duplicate YAML keys fail, other fences untouched', async () => {
  for (const body of ['title: [', descriptor + '\ntitle: duplicate', descriptor + '\nunknown: true', descriptor.replace('duration: 10', 'duration: -1')]) {
    await assert.rejects(() => compile({ value: '\n\n' + fence(body), path: '/docs/bad-trace.mdx' }, { remarkPlugins: [remarkSpanWaterfall] }), (error) => {
      assert.match(error.message, /Span Waterfall failed/); assert.equal(error.file, '/docs/bad-trace.mdx'); assert.equal(error.line, 3); return true;
    });
  }
  assert.equal(parseSpanWaterfallDescriptor(descriptor).spans[0].duration, 10);
  assert.equal(String(await compile(fence('anything', 'trace'), { remarkPlugins: [remarkSpanWaterfall] })), String(await compile(fence('anything', 'trace'))));
});

test('untrusted-looking labels and sources are escaped, never interpreted or linked', async () => {
  const value = clone(); value.title = '<script>bad</script>'; value.spans[0].name = '<img src=x>';
  value.spans[0].attributes = '{"text":"</script><iframe src=x>"}'; value.annotations[0].description = '<b>text</b>';
  const result = await compile(fence(JSON.stringify(value)), { remarkPlugins: [remarkSpanWaterfall], outputFormat: 'function-body' });
  const { default: Content } = await run(String(result), { ...runtime, baseUrl: import.meta.url });
  const html = renderToStaticMarkup(createElement(Content, { components: { SpanWaterfall } }));
  assert.doesNotMatch(html, /<script|<iframe|<img|<b>/); assert.match(html, /&lt;b&gt;text/);
});

test('browser entry excludes parsers, Node, renderers and network clients; CSS imports Inspector', async () => {
  const { build } = await import('esbuild');
  const result = await build({ stdin: { contents: "export { SpanWaterfall } from '@vanhiep99w/docs-kit/components/span-waterfall';", resolveDir: process.cwd() }, bundle: true, platform: 'browser', format: 'esm', write: false, metafile: true, external: ['react', 'react/jsx-runtime'], minify: true });
  assert.ok(result.outputFiles[0].contents.length < 30000);
  const files = Object.keys(result.metafile.inputs).join('\n');
  assert.match(files, /components\/data-inspector/); assert.doesNotMatch(files, /node_modules\/|jsonc-parser|yaml|shiki|source-explorer|d2\//);
  const source = await readFile(new URL('../dist/components/span-waterfall.js', import.meta.url), 'utf8');
  assert.match(source, /^['"]use client['"]/); assert.doesNotMatch(source, /fetch\(|WebSocket|eval\(|dangerouslySetInnerHTML|XMLHttpRequest/);
  assert.match(await readFile(new URL('../dist/styles/span-waterfall.css', import.meta.url), 'utf8'), /@import '.\/data-inspector.css'/);
  console.log('Span Waterfall minified, React external:', result.outputFiles[0].contents.length, 'bytes');
});
