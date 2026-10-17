import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import * as runtime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { compile, run } from '@mdx-js/mdx';
import { prepareDataInspector, parseDataInspectorDescriptor, remarkDataInspector } from '@vanhiep99w/docs-kit/data-inspector';
import { decodeJSONPointer, encodeJSONPointer, inspectorValue, inspectorPreview, searchInspector, inspectorInitialExpanded, validatePreparedDataInspector, validateDataInspectorInput } from '@vanhiep99w/docs-kit/data-inspector/data';
import { DataInspector } from '@vanhiep99w/docs-kit/components/data-inspector';

const input = {
  title: 'Payload minh họa',
  expandedDepth: 0,
  json: ' \r\n{ "id": 9007199254740993, "items": [{ "name": "xin chào 👋", "enabled": true }], "nullable": null, "empty": [], "": {"a/b": {"~": -0}} }\r\n',
  annotations: [{ id: 'name', pointer: '/items/0/name', title: 'Tên sản phẩm', description: 'Nội dung tiếng Việt.' }],
};
const fence = (body) => '\x60\x60\x60data-inspector\n' + body + '\n\x60\x60\x60';
const descriptor = 'title: Demo\njson: \'{"a":1}\'';

test('RFC 6901 paths preserve arrays, empty keys, slashes and tilde escapes', () => {
  for (const segments of [[], [''], ['a/b', '~', '~1'], ['items', 0, 'name'], ['a.b', '0', '安全 👋']]) {
    assert.deepEqual(decodeJSONPointer(encodeJSONPointer(segments)), segments.map(String));
  }
  assert.equal(encodeJSONPointer(['', 'a/b', '~']), '//a~1b/~0');
  assert.deepEqual(decodeJSONPointer('/~01'), ['~1']);
  for (const pointer of ['a', '#/a', '$.a', '/bad~', '/~2']) assert.throws(() => decodeJSONPointer(pointer), /JSON Pointer/);
  assert.throws(() => encodeJSONPointer([-1]), /segments/);
});

test('strict source indexing preserves numeric lexemes and exact subtree/root copy', () => {
  const data = prepareDataInspector(input);
  assert.equal(inspectorValue(data, ''), input.json);
  assert.equal(inspectorValue(data, '/id'), '9007199254740993');
  assert.equal(inspectorValue(data, '/items/0/name'), '"xin chào 👋"');
  assert.equal(inspectorValue(data, '//a~1b/~0'), '-0');
  for (const json of ['null', 'false', '0', '-0', '1.2300', '1e309', '"\\u0061"', '[]', '{}']) {
    const data = prepareDataInspector({ title: 'Scalar', json });
    assert.equal(inspectorValue(data, ''), json);
    assert.equal(data.nodes[0].offset, 0);
  }
  const root = prepareDataInspector({ title: 'Large exponent', json: '1e309' });
  assert.equal(inspectorPreview(root, root.nodes[0]), '1e309');
  assert.doesNotMatch(JSON.stringify(data), /9007199254740992|Infinity/);
  assert.throws(() => inspectorValue(data, '/missing'), /does not exist/);
});

test('rejects JSONC, invalid JSON, duplicate decoded keys and excessive input/depth/nodes', () => {
  for (const json of ['{ "a":1, }', '{/* comment */"a":1}', '{"a":1} {}', '', 'NaN', '{unquoted:1}', '[undefined]', '{"a":1,"\\u0061":2}']) {
    assert.throws(() => prepareDataInspector({ title: 'Bad', json }), /Data Inspector/);
  }
  assert.throws(() => prepareDataInspector({ title: 'Bad', json: '['.repeat(34) + '0' + ']'.repeat(34) }), /32/);
  assert.throws(() => prepareDataInspector({ title: 'Bad', json: JSON.stringify(Array(1024).fill(0)) }), /1024/);
  assert.throws(() => prepareDataInspector({ title: 'Bad', json: ' '.repeat(262144) + '0' }), /262144/);
  const innocent = prepareDataInspector({ title: 'Quoted braces', json: JSON.stringify({ text: '{'.repeat(80) }) });
  assert.equal(innocent.nodes.length, 2);
  const proto = prepareDataInspector({ title: 'Own keys', json: '{"__proto__":{"polluted":true},"constructor":null}' });
  assert.equal(inspectorValue(proto, '/__proto__/polluted'), 'true');
  assert.equal({}.polluted, undefined);
});

test('schema and prepared structure validate references, source spans and canonical child links', () => {
  for (const value of [null, { ...input, title: '' }, { ...input, json: {} }, { ...input, expandedDepth: -1 }, { ...input, expandedDepth: 9 },
    { ...input, unknown: true }, { ...input, annotations: [] },
    { ...input, annotations: [{ ...input.annotations[0], id: 'bad id' }] },
    { ...input, annotations: [input.annotations[0], input.annotations[0]] }]) {
    assert.throws(() => validateDataInspectorInput(value), /Data Inspector/);
  }
  assert.throws(() => prepareDataInspector({ ...input, annotations: [{ ...input.annotations[0], pointer: '/items/01/name' }] }), /does not exist/);
  const data = prepareDataInspector(input);
  for (const mutate of [
    (d) => { d.nodes = []; }, (d) => { d.nodes = new Array(1); },
    (d) => { d.nodes[1].offset = -1; }, (d) => { d.nodes[1].length = d.json.length + 1; },
    (d) => { d.nodes[0].children.push('/missing'); }, (d) => { d.nodes[1].key = 'different'; },
    (d) => { d.nodes[1].type = 'boolean'; }, (d) => { d.nodes[1].children.push('/fake'); },
    (d) => { d.nodes[1].pointer = '/other'; }, (d) => { d.nodes.push(d.nodes[1]); },
  ]) {
    const copy = structuredClone(data); mutate(copy);
    assert.throws(() => validatePreparedDataInspector(copy), /Data Inspector/);
  }
});

test('literal search finds decoded strings, values and pointers with ancestor closure', () => {
  const data = prepareDataInspector(input);
  const found = searchInspector(data, 'CHÀO');
  assert.deepEqual(found.matches, ['/items/0/name']);
  assert.deepEqual(new Set(found.visible), new Set(['', '/items', '/items/0', '/items/0/name']));
  assert.deepEqual(new Set(found.ancestors), new Set(['', '/items', '/items/0']));
  assert.deepEqual(searchInspector(data, '9007199254740993').matches, ['/id']);
  assert.deepEqual(searchInspector(data, '.*').matches, []);
  assert.equal(searchInspector(data, '').visible.length, data.nodes.length);
  assert.deepEqual(new Set(inspectorInitialExpanded(data)), new Set(['', '/items', '/items/0']));
  const escaped = prepareDataInspector({ title: 'Escaped', json: '{"key":"\\u0061bc"}' });
  assert.deepEqual(searchInspector(escaped, 'abc').matches, ['/key']);
});

test('SSR exposes annotated ancestors, all node types and native raw source with unique IDs', () => {
  const data = prepareDataInspector(input);
  const html = renderToStaticMarkup(createElement(DataInspector, { data }));
  assert.match(html, /9007199254740993/);
  assert.match(html, /data-pointer="\/items\/0\/name"/);
  assert.match(html, /data-pointer="\/items\/0"[^>]*><details open=""/);
  assert.match(html, /JSON gốc/); assert.match(html, /JSON Pointer/);
  assert.match(html, /hidden=""[^>]*aria-label="Sao chép value"/);
  assert.match(html, /Tên sản phẩm/);
  const markup = renderToStaticMarkup(createElement('div', null, createElement(DataInspector, { data }), createElement(DataInspector, { data })));
  const ids = [...markup.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  const long = prepareDataInspector({ title: 'Long', json: JSON.stringify('👋'.repeat(140)) });
  const preview = inspectorPreview(long, long.nodes[0]);
  assert.ok(preview.endsWith('…')); assert.doesNotMatch(preview, /�/);
  assert.equal(inspectorValue(long, ''), long.json);
});

test('compiles MDX fixtures and rejects unresolved annotations with file/fence locations', async () => {
  for (const name of ['graphql', 'kafka-event', 'jwt-claims']) {
    const path = new URL(`../examples/data-inspector/${name}.mdx`, import.meta.url);
    const result = await compile({ value: await readFile(path, 'utf8'), path: path.pathname }, { remarkPlugins: [remarkDataInspector], outputFormat: 'function-body' });
    const { default: Content } = await run(String(result), { ...runtime, baseUrl: import.meta.url });
    const html = renderToStaticMarkup(createElement(Content, { components: { DataInspector } }));
    assert.match(html, /data-inspector/); assert.match(html, /Chú thích dữ liệu/);
  }
  for (const body of ['title: [', descriptor + '\ntitle: Duplicate', descriptor + '\nextra: true',
    descriptor + '\nannotations: [{id: a, pointer: /missing, title: A, description: B}]']) {
    await assert.rejects(() => compile({ value: '\n\n' + fence(body), path: '/docs/bad-inspector.mdx' }, { remarkPlugins: [remarkDataInspector] }), (error) => {
      assert.match(error.message, /Data Inspector failed/); assert.equal(error.file, '/docs/bad-inspector.mdx'); assert.equal(error.line, 3); return true;
    });
  }
  const ordinary = '\x60\x60\x60json\n{"a":1}\n\x60\x60\x60';
  assert.equal(String(await compile(ordinary, { remarkPlugins: [remarkDataInspector] })), String(await compile(ordinary)));
});

test('escapes payloads, keys and annotations without treating strings as links or scripts', async () => {
  const data = prepareDataInspector({
    title: '<script>title</script>', json: '{"<img src=x>":"</script><script>alert(1)</script>","url":"javascript:alert(1)"}',
    annotations: [{ id: 'html', pointer: '/<img src=x>', title: '<b>not HTML</b>', description: '<svg onload=alert(1)>' }],
  });
  const result = await compile(fence(JSON.stringify({ ...data, nodes: undefined })), { remarkPlugins: [remarkDataInspector], outputFormat: 'function-body' });
  const { default: Content } = await run(String(result), { ...runtime, baseUrl: import.meta.url });
  const html = renderToStaticMarkup(createElement(Content, { components: { DataInspector } }));
  assert.doesNotMatch(html, /<script|<img|<svg\s+onload|<b>|href="javascript/);
  assert.equal([...html.matchAll(/<svg /g)].length, 2); // Only the two decorative, authored copy icons.
  assert.match(html, /&lt;b&gt;not HTML&lt;\/b&gt;/);
  assert.match(html, /javascript:alert/);
});

test('browser entry has no JSONC/YAML parser, editor, highlighter, renderer or network runtime', async () => {
  const { build } = await import('esbuild');
  const result = await build({ stdin: { contents: "export { DataInspector } from '@vanhiep99w/docs-kit/components/data-inspector';", resolveDir: process.cwd() }, bundle: true, platform: 'browser', format: 'esm', write: false, metafile: true, external: ['react', 'react/jsx-runtime'], minify: true });
  assert.ok(result.outputFiles[0].contents.length < 24_000);
  assert.doesNotMatch(Object.keys(result.metafile.inputs).join('\n'), /node_modules\/|jsonc-parser|yaml|shiki|source-explorer|d2\//);
  const component = await readFile(new URL('../dist/components/data-inspector.js', import.meta.url), 'utf8');
  assert.match(component, /^['"]use client['"]/);
  assert.doesNotMatch(component, /fetch\(|WebSocket|eval\(|dangerouslySetInnerHTML/);
  const descriptor = parseDataInspectorDescriptor('title: Root\njson: "false"');
  assert.equal(descriptor.nodes[0].type, 'boolean');
});
