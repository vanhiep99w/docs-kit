import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile, mkdtemp, rm, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { D2 } from '@d2lang/d2';
import { compile } from '@mdx-js/mdx';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { remarkD2 } from '../dist/d2/index.js';
import { renderDiagram } from '../dist/d2/render.mjs';
import { parseD2Flow, isD2Flow } from '../dist/d2/flow.js';
import { D2InteractiveDiagram } from '../dist/components/d2-interactive.js';
import { shutdownPool } from '../dist/d2/pool-client.js';

const d2 = new D2();
const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'docs-kit-flow-'));
after(async () => { await d2.dispose(); await shutdownPool({ cacheDir, concurrency: 1 }); await rm(cacheDir, { recursive: true, force: true }); });
const source = await readFile(new URL('../examples/d2/request-flow.d2', import.meta.url), 'utf8');
const descriptor = (steps, diagram = 'a -> b\na -> b: Retry\nb -> a: Response') => `# @flow
# scenarios:
#   - id: demo
#     label: Demo
#     steps:
${steps.map((step) => `#       - edge: '${step.edge}'\n#         description: '${step.description ?? 'Read this step'}'${step.duration === undefined ? '' : '\n#         duration: ' + step.duration}`).join('\n')}
# @endflow
${diagram}`;
const render = (body, options = {}) => renderDiagram(d2, { source: body, salt: 'flow-test', options: { mode: 'flow', ...options } });

test('parses bounded comment metadata without interpreting ordinary D2', () => {
  const result = parseD2Flow(source);
  assert.equal(result.scenarios.length, 2);
  assert.equal(result.scenarios[1].steps.length, 9);
  assert.deepEqual(parseD2Flow(source.replaceAll('\n', '\r\n')), result);
  for (const [value, pattern] of [
    ['a -> b', /leading/],
    [source.replace('# @endflow', ''), /endflow/],
    [source.replace('#     label: Cache hit', '#     label: Cache hit\n#     label: Duplicate'), /unique|Map keys/],
    [source.replace('#     label: Cache hit', '#     unexpected: true'), /unknown/],
    [source.replace('id: miss', 'id: hit'), /duplicate/],
    [source.replace('id: hit', 'id: 123'), /text/],
    [source.replace('# scenarios:', '# scenarios: []\n# unused:'), /unknown/],
    [descriptor([{ edge: '(a -> b)[0]', duration: 0 }]), /duration/],
    [descriptor([{ edge: '(a -> b)[0]', duration: '.inf' }]), /duration/],
    [descriptor(Array.from({ length: 129 }, () => ({ edge: '(a -> b)[0]' }))), /1–128/],
  ]) assert.throws(() => parseD2Flow(value), pattern);
});

test('maps parallel, response, repeated retry and nested edges by exact D2 IDs in both themes', async () => {
  for (const sketch of [true, false]) {
    const result = await render(descriptor([
      { edge: '(a -> b)[0]' }, { edge: '(a -> b)[1]', duration: 500 },
      { edge: '(a -> b)[1]' }, { edge: '(b -> a)[0]' },
    ]), { sketch });
    assert.ok(isD2Flow(result.flow));
    const steps = result.flow.scenarios[0].steps;
    assert.deepEqual(steps.map((step) => step.edgeToken), ['e0', 'e1', 'e1', 'e2']);
    assert.equal(steps[3].fromToken, steps[0].toToken);
    for (const svg of [result.lightSvg, result.darkSvg]) {
      assert.match(svg, /data-d2-flow-edge="e1"/);
      assert.equal(svg.match(/data-d2-flow-edge=/g).length, 3);
      assert.equal(svg.match(/data-d2-flow-node=/g).length, 2);
    }
    assert.equal(result.boards, undefined);
    assert.equal(result.animation, undefined);
  }
  const nested = await render(descriptor([{ edge: 'service.(a -> b)[0]' }], 'service: { a -> b }'));
  assert.equal(nested.flow.scenarios[0].steps[0].from, 'service.a');
  const quoted = await render(descriptor([{ edge: '("a.b" -> x y)[0]' }], '"a.b" -> "x y"'));
  assert.ok(quoted.flow);
});

test('validates references within the selected board; no topology-based execution inference', async () => {
  await assert.rejects(render(descriptor([{ edge: '(a -> b)[2]' }])), /unknown or invisible edge/);
  await assert.rejects(render(descriptor([{ edge: 'a -> b' }])), /exact compiled D2 edge ID/);
  const selected = await render(descriptor([{ edge: '(a -> b)[0]' }], 'layers: { detail: { a -> b } }'), { target: 'layers.detail' });
  assert.ok(selected.flow);
  await assert.rejects(render(descriptor([{ edge: '(a -> b)[0]' }], 'layers: { detail: { a -> b } }')), /renderable board/);
  await assert.rejects(render(descriptor([{ edge: '(a -> b)[0]' }], 'a -> b: {style.opacity: 0}')), /invisible edge/);
  // Normal diagrams keep metadata as comments; mode=flow is an explicit opt-in.
  const normal = await renderDiagram(d2, { source, salt: 'normal' });
  assert.equal(normal.flow, undefined);
  assert.doesNotMatch(normal.lightSvg, /data-d2-flow-/);
});

test('remark emits portable playback props, rebuilds a corrupt flow cache and reports source locations', async () => {
  async function transform(body) {
    let tree;
    await compile({ value: '```d2 mode=flow interval=750\n' + body + '\n```', path: 'flow.mdx' }, {
      remarkPlugins: [[remarkD2, { cacheDir }], () => (result) => { tree = result; }],
    });
    const node = tree.children[0];
    assert.equal(node.name, 'D2InteractiveDiagram');
    return Object.fromEntries(node.attributes.map(({ name, value }) => {
      const expression = value.data.estree.body[0].expression;
      return [name, expression.type === 'Literal' ? expression.value : JSON.parse(expression.arguments[0].value)];
    }));
  }
  const first = await transform(source);
  assert.equal(first.mode, 'flow'); assert.equal(first.interval, 750);
  assert.ok(isD2Flow(first.flow));
  const files = await readdir(cacheDir);
  const file = path.join(cacheDir, files.find((name) => name.endsWith('.json')));
  const cached = JSON.parse(await readFile(file, 'utf8'));
  cached.flow.scenarios[0].steps[0].edgeToken = 'unsafe-selector';
  await writeFile(file, JSON.stringify(cached));
  assert.deepEqual(await transform(source), first);
  await assert.rejects(transform(source.replace('(api -> cache)[1]', '(api -> cache)[99]')), (error) => {
    assert.match(error.message, /unknown or invisible edge/);
    assert.match(error.file, /flow.mdx$/); assert.equal(error.line, 1); return true;
  });
});

test('SSR includes all scenario explanations and escaped prose without requiring the viewer', async () => {
  const rendered = await render(source);
  rendered.flow.scenarios[0].steps[0].description = '<script>not executed</script>';
  const html = renderToStaticMarkup(createElement(D2InteractiveDiagram, { id: 'ssr-flow', caption: 'Example', source, mode: 'flow', ...rendered }));
  assert.match(html, /Request flow scenarios \(illustrative\)/);
  assert.match(html, /Cache hit/); assert.match(html, /Cache miss/);
  assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>/);
  assert.match(html, /database → api/);
});

test('sketch flow exports the complete continuous route, including every bend', async () => {
  for (const layout of ['elk', 'dagre', 'tala']) {
    const result = await render(source, { layout });
    for (const svg of [result.lightSvg, result.darkSvg]) {
      const paths = [...svg.matchAll(/data-d2-flow-path="([^"]+)"/g)].map((match) => match[1]);
      assert.equal(paths.length, 9);
      assert.ok(paths.every((d) => (d.match(/[Mm]/g) ?? []).length === 1));
      assert.ok(paths.every((d) => /[LCS]/.test(d)));
    }
    assert.deepEqual([...result.lightSvg.matchAll(/data-d2-flow-path="([^"]+)"/g)].map((match) => match[1]),
      [...result.darkSvg.matchAll(/data-d2-flow-path="([^"]+)"/g)].map((match) => match[1]));
    for (const scenario of result.flow.scenarios) for (let i = 1; i < scenario.steps.length; i++) {
      assert.equal(scenario.steps[i - 1].toToken, scenario.steps[i].fromToken, 'demo must not teleport across disconnected nodes');
    }
  }
});

test('autoplay is an opt-in UI flag, accepts fence overrides, validates booleans and reuses render cache', async () => {
  async function props(meta = '', options = {}) {
    let tree;
    await compile({ value: '```d2 mode=flow ' + meta + '\n' + source + '\n```', path: 'flow-autoplay.mdx' }, {
      remarkPlugins: [[remarkD2, { cacheDir, ...options }], () => (result) => { tree = result; }],
    });
    const attribute = tree.children[0].attributes.find((attribute) => attribute.name === 'autoplay');
    return JSON.parse(attribute.value.data.estree.body[0].expression.arguments[0].value);
  }
  assert.equal(await props(), false);
  const before = (await readdir(cacheDir)).length;
  assert.equal(await props('autoplay'), true);
  assert.equal(await props('autoplay=true'), true);
  assert.equal(await props('', { autoplay: true }), true);
  assert.equal(await props('autoplay=false', { autoplay: true }), false);
  assert.equal((await readdir(cacheDir)).length, before);
  await assert.rejects(props('autoplay=maybe'), /must be true or false/);
  await assert.rejects(props('autoplay autoplay=false'), /duplicate fence autoplay/);
  await assert.rejects(props('', { autoplay: 'true' }), /autoplay must be boolean/);
});

test('loop and bounded loopDelay are UI-only options with fence precedence and shared render cache', async () => {
  async function props(meta = '', options = {}) {
    let tree;
    await compile({ value: '```d2 mode=flow ' + meta + '\n' + source + '\n```', path: 'flow-loop.mdx' }, {
      remarkPlugins: [[remarkD2, { cacheDir, ...options }], () => (result) => { tree = result; }],
    });
    return Object.fromEntries(tree.children[0].attributes.filter(({ name }) => ['loop', 'loopDelay'].includes(name)).map(({ name, value }) =>
      [name, JSON.parse(value.data.estree.body[0].expression.arguments[0].value)]));
  }
  assert.deepEqual(await props(), { loop: false, loopDelay: 2000 });
  const before = (await readdir(cacheDir)).length;
  assert.deepEqual(await props('loop loopDelay=500'), { loop: true, loopDelay: 500 });
  assert.deepEqual(await props('', { loop: true, loopDelay: 3000 }), { loop: true, loopDelay: 3000 });
  assert.deepEqual(await props('loop=false loopDelay=750', { loop: true, loopDelay: 3000 }), { loop: false, loopDelay: 750 });
  assert.equal((await readdir(cacheDir)).length, before);
  for (const meta of ['loopDelay=0', 'loopDelay=60001', 'loopDelay=NaN', 'loopDelay=2000.5']) await assert.rejects(props(meta), /loopDelay/);
  await assert.rejects(props('loop=yes'), /must be true or false/);
  await assert.rejects(props('loop loop=false'), /duplicate fence loop/);
  await assert.rejects(props('', { loop: 'true' }), /loop must be boolean/);
});

test('annotates components absent from every scenario and preserves compiled container ancestry', async () => {
  const result = await render(descriptor([{ edge: '(a -> b)[0]' }], 'a -> b\nunused: Metrics\nc -> d\nhidden: Ghost {style.opacity: 0}\na -> hidden: {style.opacity: 0}'));
  for (const svg of [result.lightSvg, result.darkSvg]) {
    assert.match(svg, new RegExp(`<g class="${Buffer.from('unused').toString('base64')}" data-d2-flow-node="n\\d+"`));
    assert.match(svg, new RegExp(`<g class="${Buffer.from('(c -&gt; d)[0]').toString('base64')}" data-d2-flow-edge="e\\d+"`));
    assert.equal((svg.match(/data-d2-flow-path=/g) ?? []).length, 1, 'unused edges need identity, not playback geometry');
  }
  const nested = await render(descriptor([{ edge: '"service.v1".(a -> b)[0]' }], '"service.v1": { a -> b }\nunused: Metrics'));
  for (const svg of [nested.lightSvg, nested.darkSvg]) {
    assert.equal((svg.match(/data-d2-flow-parent="n0"/g) ?? []).length, 2);
  }
});
