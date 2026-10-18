import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { D2 } from '@d2lang/d2';
import { compile } from '@mdx-js/mdx';
import { remarkD2 } from '@vanhiep99w/docs-kit/d2';
import { renderDiagram } from '../dist/d2/render.mjs';
import { shutdownPool } from '../dist/d2/pool-client.js';

const d2 = new D2();
const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'docs-kit-sequence-'));
after(async () => {
  await d2.dispose();
  await shutdownPool({ cacheDir, concurrency: 1 });
  await rm(cacheDir, { recursive: true, force: true });
});
const source = `shape: sequence_diagram
a: Client
b: Service
outer: "Choose a branch" {
  inner: "Cache hit" {a -> b: Request}
  b."A note"
}
b -> a.span: Response`;
const decode = node => Object.fromEntries(node.attributes.map(({ name, value }) => {
  const expression = value.data.estree.body[0].expression;
  return [name, expression.type === 'Literal' ? expression.value : JSON.parse(expression.arguments[0].value)];
}));

for (const layout of ['elk', 'dagre', 'tala']) {
  test(`readable nested frames are embedded in both SVGs with ${layout}, without author styling`, async () => {
    const result = await renderDiagram(d2, { source, salt: `sequence-${layout}`, options: { layout, sketch: false } });
    for (const [theme, color] of [['lightSvg', '#64748b'], ['darkSvg', '#94a3b8']]) {
      const svg = result[theme];
      assert.match(svg, /^<svg data-d2-sequence="true"/);
      assert.equal(svg.split(`stroke="${color}" fill="transparent"`).length - 1, 2);
      assert.equal((svg.match(/class="shape blend"/g) ?? []).length, 2);
      assert.match(svg, /\.shape\.blend\{mix-blend-mode:normal;opacity:1\}/);
      assert.match(svg, /vector-effect:non-scaling-stroke/);
      assert.match(svg, /A note/);
      assert.match(svg, /Client/);
    }
  });
}

test('explicit frame styles, including classes and zero-width borders, take precedence', async () => {
  const custom = `classes: {
  custom: {style: {fill: "#ecfccb"; stroke: "#166534"; stroke-width: 4; stroke-dash: 3; opacity: 0.8}}
}
shape: sequence_diagram
a
b
styled: {class: custom; a -> b: Custom}
hidden: {style.stroke-width: 0; b -> a: Hidden}`;
  const result = await renderDiagram(d2, { source: custom, salt: 'sequence-styled', options: { sketch: false } });
  for (const svg of [result.lightSvg, result.darkSvg]) {
    assert.match(svg, /stroke="#166534" fill="#ecfccb" style="[^"]*stroke-width:4;[^"]*stroke-dasharray:/);
    assert.match(svg, /opacity:0\.8/);
    const hidden = svg.slice(svg.indexOf(`class="${Buffer.from('hidden').toString('base64')}"`));
    assert.match(hidden, /stroke-width:0;/);
  }
});

test('native opt-out retains D2 fragments, and non-sequence containers are unchanged', async () => {
  const native = await renderDiagram(d2, { source, salt: 'sequence-native', options: { sequenceStyle: 'native', sketch: false } });
  for (const svg of [native.lightSvg, native.darkSvg]) {
    assert.doesNotMatch(svg, /data-d2-sequence|vector-effect:non-scaling-stroke/);
    assert.match(svg, /class="shape blend"/);
  }
  const ordinary = { source: 'outer: {a -> b: Request}', salt: 'ordinary', options: { sketch: false } };
  const readable = await renderDiagram(d2, ordinary);
  const untouched = await renderDiagram(d2, { ...ordinary, options: { ...ordinary.options, sequenceStyle: 'native' } });
  assert.deepEqual(readable, untouched);
});

test('markers follow the selected board and nested sequences, including animations', async () => {
  const layered = `a -> b
layers: {
 sequence: {${source}}
 ordinary: {c -> d}
}`;
  const result = await renderDiagram(d2, { source: layered, salt: 'sequence-boards', options: { mode: 'explorer', sketch: false } });
  assert.doesNotMatch(result.lightSvg, /data-d2-sequence/);
  for (const board of result.boards) {
    for (const svg of [board.lightSvg, board.darkSvg]) {
      assert.equal(svg.includes('data-d2-sequence'), board.id === 'layers.sequence');
    }
  }
  const nested = await renderDiagram(d2, { source: `flow: {${source}}\nflow -> end`, salt: 'nested-sequence', options: { sketch: false } });
  assert.match(nested.lightSvg, /data-d2-sequence/);
  const animation = await renderDiagram(d2, { source: `${source}\nsteps: {next: {a -> b: Next}}`, salt: 'sequence-animation', options: { mode: 'animation', sketch: false } });
  for (const svg of [animation.animation.lightSvg, animation.animation.darkSvg]) {
    assert.match(svg, /^<svg data-d2-sequence="true"/);
    assert.match(svg, /mix-blend-mode:normal;opacity:1/);
  }
});

test('remark validates the option, allows fence overrides and separates native/readable caches', async () => {
  const transform = async (meta = '', options = {}) => {
    let tree;
    await compile({ value: `\`\`\`d2 interactive ${meta}\n${source}\n\`\`\``, path: 'sequence.mdx' }, {
      remarkPlugins: [[remarkD2, { cacheDir, sketch: false, ...options }], () => result => { tree = result; }],
    });
    return decode(tree.children[0]);
  };
  const readable = await transform();
  assert.match(readable.lightSvg, /data-d2-sequence/);
  const native = await transform('sequenceStyle=native');
  assert.doesNotMatch(native.lightSvg, /data-d2-sequence/);
  assert.deepEqual(await transform('sequenceStyle=readable', { sequenceStyle: 'native' }), readable);
  assert.equal((await readdir(cacheDir)).filter(name => name.endsWith('.json')).length, 2);
  await assert.rejects(transform('sequenceStyle=bad'), /sequenceStyle/);
  await assert.rejects(transform('sequenceStyle=readable sequenceStyle=native'), /duplicate fence/);
  await assert.rejects(transform('', { sequenceStyle: 'bad' }), /sequenceStyle/);
});
