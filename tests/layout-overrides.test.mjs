import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { compile, createProcessor } from '@mdx-js/mdx';
import remarkFrontmatter from 'remark-frontmatter';
import { remarkD2 } from '@vanhiep99w/docs-kit/d2';
import { peekPoolStats, shutdownPool } from '../dist/d2/pool-client.js';

const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'docs-kit-layouts-'));
const pool = { cacheDir, concurrency: 1 };
after(async () => {
  await shutdownPool(pool);
  await rm(cacheDir, { recursive: true, force: true });
});

const source = 'a: API\nb: Database\na -> b';
const fence = (meta = '', value = source) => `\`\`\`d2 ${meta}\n${value}\n\`\`\``;
const page = (layout, body) => `---\ntitle: Architecture\nd2Layout: ${layout}\n---\n\n${body}`;
const props = (node) => Object.fromEntries(node.attributes.map(({ name, value }) => [
  name, value.data.estree.body[0].expression.value,
]));

async function transform(value, options = {}, data = {}, before = []) {
  let tree;
  const capture = () => (result) => { tree = result; };
  const compiled = await compile({ value, path: 'architecture.mdx', data }, {
    remarkPlugins: [...before, [remarkD2, { cacheDir, ...options }], capture],
  });
  return {
    tree,
    compiled: String(compiled),
    diagrams: tree.children.filter((node) => ['D2Diagram', 'D2InteractiveDiagram'].includes(node.name)).map(props),
  };
}

// Check validation before any test warms the pool.
test('invalid overrides fail with filename and position before starting WASM', async () => {
  for (const value of ['unknown', 'null', '42', 'true', '[tala]', '{engine: tala}', '""']) {
    await assert.rejects(transform(page(value, fence())), (error) => {
      assert.match(error.message, /frontmatter d2Layout must be elk, dagre or tala/);
      assert.match(error.file, /architecture\.mdx$/);
      assert.equal(error.line, 1);
      return true;
    });
  }
  for (const meta of ['layout=unknown', 'layout=""', 'layout', 'layout=', 'layout="tala',
    'layout="tala"junk', 'layout=tala layout=elk']) {
    await assert.rejects(transform(`# Architecture\n\n${fence(meta)}`), (error) => {
      assert.match(error.message, /fence layout|duplicate fence layout/);
      assert.match(error.file, /architecture\.mdx$/);
      assert.equal(error.line, 3);
      return true;
    });
  }
  await assert.rejects(transform(page('tala', fence('layout=unknown'))), /fence layout/);
  await assert.rejects(transform(page('unknown', fence('layout=tala'))), /frontmatter d2Layout/);
  await assert.rejects(transform(fence(), {}, { frontmatter: { d2Layout: false } }), /frontmatter d2Layout/);
  await assert.rejects(transform('---\nd2Layout: [\n---\n\n' + fence()), /D2 page layout failed/);
  assert.equal(await peekPoolStats(pool), undefined);
  assert.deepEqual(await readdir(cacheDir), []);
});

test('uses block > page > global > ELK and caches by the effective layout', async () => {
  const body = `${fence()}\n\n${fence()}`;
  const defaults = await transform(body);
  const elk = await transform(body, { layout: 'elk' });
  const dagre = await transform(body, { layout: 'dagre' });
  const tala = await transform(body, { layout: 'tala' });
  assert.equal(defaults.diagrams.length, 2);
  assert.deepEqual(defaults.diagrams, elk.diagrams);
  assert.notEqual(elk.diagrams[0].lightSvg, dagre.diagrams[0].lightSvg);
  assert.notEqual(tala.diagrams[0].lightSvg, dagre.diagrams[0].lightSvg);
  const count = (await readdir(cacheDir)).filter((name) => name.endsWith('.json')).length;
  assert.equal(count, 6);
  const completed = (await peekPoolStats(pool)).completed;

  const pageOnly = await transform(page('tala', body), { layout: 'dagre' });
  assert.deepEqual(pageOnly.diagrams, tala.diagrams);
  const mixed = await transform(page('tala', `${fence()}\n\n${fence('layout="dagre"')}`), { layout: 'elk' });
  assert.deepEqual(mixed.diagrams, [tala.diagrams[0], dagre.diagrams[1]]);
  const blockOnly = await transform(fence('layout=tala'), { layout: 'dagre' });
  assert.deepEqual(blockOnly.diagrams, [tala.diagrams[0]]);
  assert.equal((await readdir(cacheDir)).filter((name) => name.endsWith('.json')).length, count);
  assert.equal((await peekPoolStats(pool)).completed, completed);
});

test('parses quoted/bare fence layouts without reading layout text inside titles or other keys', async () => {
  const baseline = await transform(fence(), { layout: 'tala' });
  for (const meta of ['layout=tala', 'layout="tala"', "layout='tala'", 'layout = "tala"']) {
    assert.deepEqual((await transform(fence(meta))).diagrams, baseline.diagrams);
  }
  const { diagrams } = await transform(fence('title="Use layout=unknown here" data-layout=tala'), { layout: 'elk' });
  assert.equal(diagrams[0].caption, 'Use layout=unknown here');
  const elk = await transform(fence('title="Use layout=unknown here"'), { layout: 'elk' });
  assert.deepEqual(diagrams, elk.diagrams);
  const titled = await transform(fence("layout='tala' title='Kiến trúc hệ thống'"));
  assert.equal(titled.diagrams[0].caption, 'Kiến trúc hệ thống');
  assert.equal(titled.diagrams[0].lightSvg, baseline.diagrams[0].lightSvg);
});

test('supports YAML syntax, existing frontmatter plugins and stripped host frontmatter', async () => {
  const tala = (await transform(fence(), { layout: 'tala' })).diagrams;
  const raw = '\uFEFF---\r\ntitle: "Architecture: API"\r\n"d2Layout": \'tala\' # page engine\r\n---\r\n\r\n' + fence();
  assert.deepEqual((await transform(raw)).diagrams, tala);
  assert.deepEqual((await transform(page('tala', fence()), {}, {}, [remarkFrontmatter])).diagrams, tala);
  assert.deepEqual((await transform(fence(), { layout: 'dagre' }, { frontmatter: { d2Layout: 'tala' } })).diagrams, tala);
  const hostOverridesRaw = await transform(page('dagre', fence()), {}, { frontmatter: { d2Layout: 'tala' } });
  assert.deepEqual(hostOverridesRaw.diagrams, tala);
  const noOverride = await transform('---\ntitle: Architecture\n---\n\n' + fence());
  assert.deepEqual(noOverride.diagrams, (await transform(fence())).diagrams);
  const noDiagrams = await transform(page('unknown', '# Ordinary page'));
  assert.equal(noDiagrams.diagrams.length, 0);
  assert.doesNotMatch(noDiagrams.compiled, /d2Layout/);
});

test('does not leak page or fence overrides when reusing a processor for different pages', async () => {
  const processor = createProcessor({ remarkPlugins: [[remarkD2, { cacheDir }]] });
  const value = fence();
  const expected = String(await processor.process({ value, path: 'architecture.mdx' }));
  await processor.process({ value: page('tala', fence('layout=dagre')), path: 'architecture.mdx' });
  await processor.process({ value: page('tala', value), path: 'architecture.mdx' });
  const actual = String(await processor.process({ value, path: 'architecture.mdx' }));
  assert.equal(actual, expected);
});
