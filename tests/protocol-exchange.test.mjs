import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import * as runtime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { compile, run } from '@mdx-js/mdx';
import { prepareProtocolExchange, parseProtocolExchangeDescriptor, remarkProtocolExchange } from '@vanhiep99w/docs-kit/protocol-exchange';
import { validateProtocolExchangeInput, validatePreparedProtocolExchange, formatProtocolMessage, protocolBodySource } from '@vanhiep99w/docs-kit/protocol-exchange/data';
import { ProtocolExchange } from '@vanhiep99w/docs-kit/components/protocol-exchange';

const input = {
  title: 'Hai tình huống',
  variants: [{
    id: 'ok', title: 'Thành công',
    request: { method: 'POST', url: '/demo?name=x%20y', headers: [{ id: 'type', name: 'Content-Type', value: 'application/json' }],
      body: { kind: 'json', json: ' \r\n{ "id":9007199254740993, "empty": null }\r\n', annotations: [{ id: 'id', pointer: '/id', title: 'ID', description: 'Giữ nguyên.' }] } },
    response: { status: 200, statusText: 'OK', headers: [{ id: 'first', name: 'Set-Cookie', value: 'one=FAKE' }, { id: 'second', name: 'Set-Cookie', value: 'two=FAKE' }],
      body: { kind: 'text', text: 'xin chào 👋\r\nsecond\n' } },
    annotations: [{ id: 'cookie', side: 'response', target: 'header', header: 'second', title: 'Cookie thứ hai', description: 'Không gộp headers.' }],
  }, {
    id: 'empty', title: 'Không có nội dung', request: { method: 'DELETE', url: 'https://api.example.invalid/demo' }, response: { status: 204 },
  }],
};
const clone = () => structuredClone(input);
const fence = (body) => '\x60\x60\x60protocol-exchange\n' + body + '\n\x60\x60\x60';
const descriptor = 'title: Demo\nvariants: [{id: a, title: A, request: {method: GET, url: /}, response: {status: 200}}]';

test('preserves source, headers order, repeated names and empty-versus-absent bodies', () => {
  const original = clone();
  const data = prepareProtocolExchange(input);
  assert.equal(protocolBodySource(data.variants[0].request.body), input.variants[0].request.body.json);
  assert.equal(protocolBodySource(data.variants[0].response.body), input.variants[0].response.body.text);
  assert.equal(protocolBodySource(data.variants[1].response.body), undefined);
  assert.equal(protocolBodySource({ kind: 'text', text: '' }), '');
  assert.equal(formatProtocolMessage(data.variants[0], 'request'), 'POST /demo?name=x%20y\r\nContent-Type: application/json\r\n\r\n' + input.variants[0].request.body.json);
  assert.equal(formatProtocolMessage(data.variants[0], 'response'), '200 OK\r\nSet-Cookie: one=FAKE\r\nSet-Cookie: two=FAKE\r\n\r\n' + input.variants[0].response.body.text);
  assert.equal(formatProtocolMessage(data.variants[1], 'response'), '204');
  const empty = clone(); empty.variants[0].response.body = { kind: 'text', text: '' };
  assert.ok(formatProtocolMessage(prepareProtocolExchange(empty).variants[0], 'response').endsWith('\r\n\r\n'));
  assert.deepEqual(input, original);
});

test('rejects bad methods, unsafe URL forms, control injection, invalid status and unknown fields', () => {
  const requests = [
    { method: 'get' }, { method: '' }, { method: 'GET\r\nInjected' }, { url: 'javascript:alert(1)' },
    { url: '//evil.test/path' }, { url: '/path#fragment' }, { url: 'https://user:pass@example.invalid/' },
    { url: '/has space' }, { url: '/path\\other' }, { url: 'not-a-url' }, { url: 'https://' },
    { headers: [{ id: 'x', name: 'Bad:Name', value: 'x' }] }, { headers: [{ id: 'x', name: ':authority', value: 'x' }] },
    { headers: [{ id: 'x', name: 'X-Demo', value: 'a\r\nInjected: true' }] }, { headers: [{ id: 'x', name: 'X-Demo', value: 'a\x00b' }] },
    { headers: [{ id: 'x', name: 'X-Demo', value: 'a', typo: true }] }, { headers: new Array(1) }, { headers: 'x' },
  ];
  for (const change of requests) {
    const value = clone(); Object.assign(value.variants[0].request, change);
    assert.throws(() => validateProtocolExchangeInput(value), /Protocol Exchange/);
  }
  for (const change of [{ status: 99 }, { status: 600 }, { status: 200.5 }, { status: '200' }, { statusText: 'OK\nInjected' }, { typo: true }]) {
    const value = clone(); Object.assign(value.variants[0].response, change);
    assert.throws(() => validateProtocolExchangeInput(value), /Protocol Exchange/);
  }
  for (const value of [null, { ...input, variants: [] }, { ...input, variants: new Array(1) }, { ...input, variants: Array(13).fill(input.variants[0]) },
    { ...input, variants: [input.variants[0], input.variants[0]] }, { ...input, title: '' }, { ...input, typo: true }]) {
    assert.throws(() => validateProtocolExchangeInput(value), /Protocol Exchange/);
  }
  const repeated = clone(); repeated.variants[0].response.headers[1].id = 'first';
  assert.throws(() => validateProtocolExchangeInput(repeated), /duplicate header/);
  for (const url of ['/relative?x=1', 'https://example.invalid/p?q=%20', 'HTTP://example.invalid:8080/a']) {
    const value = clone(); value.variants[0].request.url = url; validateProtocolExchangeInput(value);
  }
});

test('body and annotation validators enforce side-specific references and HTTP no-content cases', () => {
  for (const code of [100, 101, 199, 204, 205, 304]) {
    const value = clone(); value.variants[0].response.status = code;
    assert.throws(() => validateProtocolExchangeInput(value), /body must be omitted/);
    delete value.variants[0].response.body; validateProtocolExchangeInput(value);
  }
  const head = clone(); head.variants[0].request.method = 'HEAD';
  assert.throws(() => validateProtocolExchangeInput(head), /body must be omitted/);
  const changes = [{ side: 'before' }, { target: 'unknown' }, { header: 'type' }, { target: 'body', header: 'second' },
    { target: 'start', header: 'second' }, { title: '' }, { id: 'bad id' }, { typo: true }];
  for (const change of changes) {
    const value = clone(); Object.assign(value.variants[0].annotations[0], change);
    assert.throws(() => validateProtocolExchangeInput(value), /Protocol Exchange/);
  }
  const absent = clone(); absent.variants[1].annotations = [{ id: 'a', side: 'response', target: 'body', title: 'A', description: 'B' }];
  assert.throws(() => validateProtocolExchangeInput(absent), /body.*exists/);
  const duplicated = clone(); duplicated.variants[0].annotations.push(duplicated.variants[0].annotations[0]);
  assert.throws(() => validateProtocolExchangeInput(duplicated), /duplicate annotation/);
  for (const body of [{ kind: 'binary', text: 'x' }, { kind: 'text', text: null }, { kind: 'text', text: 'a', unknown: true },
    { kind: 'json', json: { id: 1 } }, { kind: 'json', json: '{"a":1,}' }, { kind: 'json', json: '{"a":1,"a":2}' }]) {
    const value = clone(); value.variants[0].request.body = body;
    assert.throws(() => prepareProtocolExchange(value), /Protocol Exchange|Data Inspector/);
  }
  const unresolved = clone(); unresolved.variants[0].request.body.annotations[0].pointer = '/absent';
  assert.throws(() => prepareProtocolExchange(unresolved), /does not exist/);
});

test('resource bounds and prepared artifacts reject excess sources, headers or invalid inspector data', () => {
  const headers = clone(); headers.variants[0].request.headers = Array.from({ length: 65 }, (_, i) => ({ id: 'h' + i, name: 'X-Demo', value: 'x' }));
  assert.throws(() => validateProtocolExchangeInput(headers), /64 headers/);
  const big = clone(); big.variants[0].response.body.text = 'x'.repeat(262145);
  assert.throws(() => validateProtocolExchangeInput(big), /262144/);
  const total = { title: 'Large', variants: Array.from({ length: 5 }, (_, i) => ({ id: 'v' + i, title: 'V', request: { method: 'POST', url: '/', body: { kind: 'text', text: 'x'.repeat(262144) } }, response: { status: 204 } })) };
  assert.throws(() => validateProtocolExchangeInput(total), /1048576/);
  const data = prepareProtocolExchange(input);
  validatePreparedProtocolExchange(data);
  data.variants[0].request.body.data.nodes[0].length = -1;
  assert.throws(() => validatePreparedProtocolExchange(data), /node offsets/);
});

test('SSR exposes both sides and all native variants with unique annotation anchors', () => {
  const data = prepareProtocolExchange(input);
  const html = renderToStaticMarkup(createElement(ProtocolExchange, { data }));
  assert.match(html, /open="" data-variant="ok"/); assert.match(html, /data-variant="empty">/);
  assert.match(html, /9007199254740993/); assert.match(html, /Cookie thứ hai/);
  assert.match(html, /Không có body/); assert.match(html, /Không gửi request/);
  assert.match(html, /hidden=""[^>]*aria-label="Sao chép request/);
  const two = renderToStaticMarkup(createElement('div', null, createElement(ProtocolExchange, { data }), createElement(ProtocolExchange, { data })));
  const ids = [...two.matchAll(/ id="([^"]+)"/g)].map((entry) => entry[1]);
  assert.equal(ids.length, new Set(ids).size);
  const targets = [...two.matchAll(/href="#([^"]+)"/g)].map((entry) => entry[1]);
  assert.ok(targets.every((target) => ids.includes(target)));
});

test('MDX fixtures compile and embed Inspector rather than a separate JSON viewer', async () => {
  for (const name of ['rest-auth', 'graphql', 'oauth-redirect']) {
    const path = new URL(`../examples/protocol-exchange/${name}.mdx`, import.meta.url);
    const result = await compile({ value: await readFile(path, 'utf8'), path: path.pathname }, { remarkPlugins: [remarkProtocolExchange], outputFormat: 'function-body' });
    const { default: Content } = await run(String(result), { ...runtime, baseUrl: import.meta.url });
    const html = renderToStaticMarkup(createElement(Content, { components: { ProtocolExchange } }));
    assert.match(html, /protocol-exchange/); assert.match(html, /Chú thích trao đổi/);
    if (name !== 'oauth-redirect') assert.match(html, /data-inspector/);
  }
});

test('remark errors include file/fence location and ordinary HTTP fences stay untouched', async () => {
  for (const body of ['title: [', descriptor + '\ntitle: Duplicate', descriptor + '\nunknown: true',
    descriptor.replace('status: 200', 'status: 900'), descriptor.replace('method: GET', 'method: get')]) {
    await assert.rejects(() => compile({ value: '\n\n' + fence(body), path: '/docs/bad-exchange.mdx' }, { remarkPlugins: [remarkProtocolExchange] }), (error) => {
      assert.match(error.message, /Protocol Exchange failed/); assert.equal(error.file, '/docs/bad-exchange.mdx'); assert.equal(error.line, 3); return true;
    });
  }
  const ordinary = '\x60\x60\x60http\nGET /demo HTTP/1.1\n\x60\x60\x60';
  assert.equal(String(await compile(ordinary, { remarkPlugins: [remarkProtocolExchange] })), String(await compile(ordinary)));
  assert.equal(parseProtocolExchangeDescriptor(descriptor).variants[0].request.method, 'GET');
});

test('payloads, header values and explanations are escaped and locations never auto-link', async () => {
  const value = clone(); value.title = '<script>title</script>';
  value.variants[0].response.body.text = '<iframe src=x></iframe>';
  value.variants[0].response.headers[1].value = '<img src=x onerror=alert(1)>';
  value.variants[0].annotations[0].description = '<b>not HTML</b>';
  const result = await compile(fence(JSON.stringify(value)), { remarkPlugins: [remarkProtocolExchange], outputFormat: 'function-body' });
  const { default: Content } = await run(String(result), { ...runtime, baseUrl: import.meta.url });
  const html = renderToStaticMarkup(createElement(Content, { components: { ProtocolExchange } }));
  assert.doesNotMatch(html, /<script|<iframe|<img|<b>/);
  assert.match(html, /&lt;b&gt;not HTML&lt;\/b&gt;/);
  assert.doesNotMatch(html, /href="https?:/);
});

test('browser entry includes only the reused Inspector, not parsers, network or execution code', async () => {
  const { build } = await import('esbuild');
  const result = await build({ stdin: { contents: "export { ProtocolExchange } from '@vanhiep99w/docs-kit/components/protocol-exchange';", resolveDir: process.cwd() }, bundle: true, platform: 'browser', format: 'esm', write: false, metafile: true, external: ['react', 'react/jsx-runtime'], minify: true });
  assert.ok(result.outputFiles[0].contents.length < 30_000);
  const files = Object.keys(result.metafile.inputs).join('\n');
  assert.match(files, /components\/data-inspector/);
  assert.doesNotMatch(files, /node_modules\/|jsonc-parser|yaml|shiki|source-explorer|d2\//);
  const component = await readFile(new URL('../dist/components/protocol-exchange.js', import.meta.url), 'utf8');
  assert.match(component, /^['"]use client['"]/);
  assert.doesNotMatch(component, /fetch\(|WebSocket|eval\(|dangerouslySetInnerHTML|XMLHttpRequest/);
  const css = await readFile(new URL('../dist/styles/protocol-exchange.css', import.meta.url), 'utf8');
  assert.match(css, /@import '.\/data-inspector.css'/);
});
