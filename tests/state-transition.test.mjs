import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import * as runtime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { compile, run } from '@mdx-js/mdx';
import { parseStateTransitionDescriptor, remarkStateTransition } from '@vanhiep99w/docs-kit/state-transition';
import { validateStateTransition, traceStateTransitions, STATE_TRANSITION_HISTORY_LIMIT } from '@vanhiep99w/docs-kit/state-transition/data';
import { StateTransitionExplorer } from '@vanhiep99w/docs-kit/components/state-transition';

const input = {
  title: 'Mô hình 👋', assumptions: 'Các guard chỉ là text; không được đánh giá.', initial: 'idle',
  states: [{ id: 'idle', label: 'Idle', description: 'Bắt đầu.' }, { id: 'waiting', label: 'Waiting' }, { id: 'done', label: 'Done', terminal: true }, { id: 'unreachable', label: 'Không tới được' }],
  transitions: [
    { id: 'stay', from: 'idle', to: 'idle', event: 'SUBMIT', label: 'Giả định chưa sẵn sàng', guard: 'false', description: 'Không evaluate false.' },
    { id: 'submit', from: 'idle', to: 'waiting', event: 'SUBMIT', label: 'Nhánh được chọn', guard: 'inputValid()', description: 'Giả định input hợp lệ.', effects: ['fetch(payload) — chỉ là mô tả'] },
    { id: 'resolve', from: 'waiting', to: 'done', event: 'RESOLVE', description: 'Kết thúc.' },
    { id: 'retry', from: 'waiting', to: 'idle', event: 'RETRY', description: 'Quay lại.' },
  ],
};
const clone = () => structuredClone(input);
const descriptor = 'title: Demo\nassumptions: Synthetic\ninitial: a\nstates: [{id: a, label: A}]\ntransitions: [{id: stay, from: a, to: a, event: AGAIN, description: Text}]';
const fence = (body, language = 'state-transition') => '\x60\x60\x60' + language + '\n' + body + '\n\x60\x60\x60';

test('accepts explicit same-event branches, self-loops, cycles, namespace reuse and unreachable states without mutation', () => {
  const original = clone(); validateStateTransition(input);
  const trace = traceStateTransitions(input, ['stay', 'submit', 'retry', 'submit', 'resolve']);
  assert.equal(trace.current, 'done');
  assert.deepEqual(trace.entries.map((entry) => entry.transition.id), ['stay', 'submit', 'retry', 'submit', 'resolve']);
  assert.deepEqual(trace.entries.map((entry) => entry.step), [1, 2, 3, 4, 5]);
  assert.deepEqual(input, original);
  const namespace = clone(); namespace.transitions[0].id = 'idle'; validateStateTransition(namespace);
});

test('strict schema rejects malformed objects, duplicate IDs, sparse arrays, unknown props and bad references', () => {
  for (const value of [null, { ...input, title: '' }, { ...input, assumptions: '' }, { ...input, initial: 'missing' },
    { ...input, states: [] }, { ...input, states: new Array(1) }, { ...input, transitions: new Array(1) },
    { ...input, transitions: undefined }, { ...input, typo: true }]) {
    assert.throws(() => validateStateTransition(value), /State Transition/);
  }
  for (const [key, change] of [
    ['states', { id: 'bad id' }], ['states', { label: '' }], ['states', { description: '' }], ['states', { terminal: 'true' }],
    ['states', { typo: true }], ['transitions', { id: 'bad id' }], ['transitions', { from: 'missing' }], ['transitions', { to: 'missing' }],
    ['transitions', { event: '' }], ['transitions', { description: '' }], ['transitions', { guard: true }], ['transitions', { guard: () => true }],
    ['transitions', { label: '' }], ['transitions', { effects: [] }], ['transitions', { effects: [null] }], ['transitions', { effects: new Array(1) }],
    ['transitions', { action: 'fetch()' }],
  ]) {
    const value = clone(); Object.assign(value[key][0], change);
    assert.throws(() => validateStateTransition(value), /State Transition/);
  }
  for (const key of ['states', 'transitions']) {
    const value = clone(); value[key].push(value[key][0]);
    assert.throws(() => validateStateTransition(value), /duplicate/);
  }
});

test('terminal states cannot have outgoing edges, dead ends are not inferred terminal, zero-transition models are valid', () => {
  const bad = clone(); bad.states[0].terminal = true;
  assert.throws(() => validateStateTransition(bad), /terminal state.*outgoing/);
  for (const terminal of [true, false, undefined]) {
    const data = { title: 'Single', assumptions: 'No edges.', initial: 'one', states: [{ id: 'one', label: 'One', ...(terminal === undefined ? {} : { terminal }) }], transitions: [] };
    validateStateTransition(data);
    assert.equal(traceStateTransitions(data, []).current, 'one');
    const html = renderToStaticMarkup(createElement(StateTransitionExplorer, { data }));
    assert.match(html, terminal ? /trạng thái kết thúc do tác giả khai báo/ : /không tự suy ra đây là trạng thái kết thúc/);
    assert.match(html, /không khai báo chuyển trạng thái nào/);
  }
});

test('bounds states, transitions, text, IDs and effects before publishing descriptor content', () => {
  for (const [key, length] of [['states', 33], ['transitions', 129]]) {
    assert.throws(() => validateStateTransition({ ...input, [key]: Array(length).fill(input[key][0]) }), /entries/);
  }
  const effects = clone(); effects.transitions[0].effects = Array(17).fill('text');
  assert.throws(() => validateStateTransition(effects), /1–16/);
  const long = clone(); long.title = 'x'.repeat(16385);
  assert.throws(() => validateStateTransition(long), /16384/);
  const id = clone(); id.transitions[0].id = 'a'.repeat(129);
  assert.throws(() => validateStateTransition(id), /128/);
  const total = clone(); total.transitions = Array.from({ length: 65 }, (_, i) => ({ id: 't' + i, from: 'idle', to: 'idle', event: 'E', description: 'x'.repeat(16384) }));
  assert.throws(() => validateStateTransition(total), /1048576/);
  assert.throws(() => parseStateTransitionDescriptor('x'.repeat(2097153)), /2097152/);
});

test('trace follows chosen transition IDs only, ignores guard expressions and returns a replayable prefix for back/reset', () => {
  assert.equal(traceStateTransitions(input, ['stay']).current, 'idle'); // guard text is literally false
  assert.equal(traceStateTransitions(input, ['submit']).current, 'waiting'); // never calls inputValid()
  const path = ['submit', 'retry', 'submit'];
  assert.equal(traceStateTransitions(input, path.slice(0, -1)).current, 'idle');
  assert.equal(traceStateTransitions(input, []).current, input.initial);
  assert.equal(traceStateTransitions(input, ['submit', 'resolve']).entries.at(-1).transition.to, 'done');
  assert.deepEqual(path, ['submit', 'retry', 'submit']);
});

test('trace rejects unknown IDs, events used as IDs, wrong-origin paths, terminal exits and oversized histories', () => {
  for (const path of [null, 'submit', new Array(1), [1], ['missing'], ['SUBMIT'], ['resolve'], ['submit', 'submit'], ['submit', 'resolve', 'retry']]) {
    assert.throws(() => traceStateTransitions(input, path), /State Transition/);
  }
  assert.equal(STATE_TRANSITION_HISTORY_LIMIT, 128);
  assert.equal(traceStateTransitions(input, Array(128).fill('stay')).entries.length, 128);
  assert.throws(() => traceStateTransitions(input, Array(129).fill('stay')), /at most 128/);
});

test('SSR preserves complete model references, guard explanations, native fallback and scoped IDs across instances', () => {
  const html = renderToStaticMarkup(createElement('div', null, createElement(StateTransitionExplorer, { data: input }), createElement(StateTransitionExplorer, { data: input })));
  assert.match(html, /Hiện tại: Idle/); assert.match(html, /Tra cứu toàn bộ/); assert.match(html, /Không tới được/);
  assert.match(html, /Không đánh giá guard/); assert.match(html, /inputValid\(\)/); assert.match(html, /fetch\(payload\)/);
  assert.match(html, /hidden=""[^>]*aria-disabled/);
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  assert.ok([...html.matchAll(/href="#([^"]+)"/g)].every((match) => ids.includes(match[1])));
  assert.ok([...html.matchAll(/aria-describedby="([^"]+)"/g)].every((match) => ids.includes(match[1])));
});

test('circuit breaker and form workflow fixtures compile and SSR as authored models', async () => {
  for (const name of ['circuit-breaker', 'form-workflow']) {
    const path = new URL(`../examples/state-transition/${name}.mdx`, import.meta.url);
    const result = await compile({ value: await readFile(path, 'utf8'), path: path.pathname }, { remarkPlugins: [remarkStateTransition], outputFormat: 'function-body' });
    const { default: Content } = await run(String(result), { ...runtime, baseUrl: import.meta.url });
    const html = renderToStaticMarkup(createElement(Content, { components: { StateTransitionExplorer } }));
    assert.match(html, /state-transition/); assert.match(html, /Giả định mô hình/); assert.match(html, /Bảng chuyển trạng thái đầy đủ/);
  }
});

test('remark errors include file/fence position, reject duplicate YAML keys and leave ordinary fences alone', async () => {
  for (const body of ['title: [', descriptor + '\ntitle: duplicate', descriptor + '\nunknown: true', descriptor.replace('to: a', 'to: missing')]) {
    await assert.rejects(() => compile({ value: '\n\n' + fence(body), path: '/docs/bad-state.mdx' }, { remarkPlugins: [remarkStateTransition] }), (error) => {
      assert.match(error.message, /State Transition failed/); assert.equal(error.file, '/docs/bad-state.mdx'); assert.equal(error.line, 3); return true;
    });
  }
  assert.equal(parseStateTransitionDescriptor(descriptor).initial, 'a');
  assert.equal(String(await compile(fence('plain', 'state'), { remarkPlugins: [remarkStateTransition] })), String(await compile(fence('plain', 'state'))));
});

test('guard, effect and event strings remain escaped text, never expressions, HTML or automatic hyperlinks', async () => {
  const value = clone(); value.title = '<script>title</script>'; value.transitions[0].event = '<img src=x onerror=alert(1)>';
  value.transitions[0].guard = '<b>false</b>'; value.transitions[1].effects = ['<iframe src=x></iframe>', 'https://example.invalid/no-request'];
  const result = await compile(fence(JSON.stringify(value)), { remarkPlugins: [remarkStateTransition], outputFormat: 'function-body' });
  const { default: Content } = await run(String(result), { ...runtime, baseUrl: import.meta.url });
  const html = renderToStaticMarkup(createElement(Content, { components: { StateTransitionExplorer } }));
  assert.doesNotMatch(html, /<script|<img|<b>|<iframe/); assert.match(html, /&lt;b&gt;false/); assert.match(html, /&lt;iframe/);
  assert.doesNotMatch(html, /href="https?:/);
});

test('browser bundle contains only the model traversal UI/data, without parsers, statechart runtimes or execution', async () => {
  const { build } = await import('esbuild');
  const bundle = await build({ stdin: { contents: "export { StateTransitionExplorer } from '@vanhiep99w/docs-kit/components/state-transition';", resolveDir: process.cwd() }, bundle: true, platform: 'browser', format: 'esm', write: false, metafile: true, external: ['react', 'react/jsx-runtime'], minify: true });
  assert.ok(bundle.outputFiles[0].contents.length < 20000);
  assert.doesNotMatch(Object.keys(bundle.metafile.inputs).join('\n'), /node_modules\/|yaml|shiki|d2\/|xstate|source-explorer|data-inspector|span-waterfall/);
  const source = await readFile(new URL('../dist/components/state-transition.js', import.meta.url), 'utf8');
  assert.match(source, /^['"]use client['"]/); assert.doesNotMatch(source, /fetch\(|WebSocket|eval\(|new Function|setTimeout\(|setInterval\(|dangerouslySetInnerHTML/);
  const css = await readFile(new URL('../dist/styles/state-transition.css', import.meta.url), 'utf8');
  assert.match(css, /@container/); assert.doesNotMatch(css, /@import|animation:|transition:/);
  console.log('State Transition minified, React external:', bundle.outputFiles[0].contents.length, 'bytes');
});
