import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import * as runtime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { compile, run } from '@mdx-js/mdx';
import { prepareCodeDiff, remarkCodeDiff } from '@vanhiep99w/docs-kit/code-diff';
import { diffCodeLines, diffBlocks, diffLineEndings, validateCodeDiffInput, validatePreparedCodeDiff } from '@vanhiep99w/docs-kit/code-diff/data';
import { CodeDiff } from '@vanhiep99w/docs-kit/components/code-diff';
import { CodeDiffWithSource } from '@vanhiep99w/docs-kit/components/code-diff-source';

const input = {
  title: 'Chèn một dòng', language: 'typescript', contextLines: 0,
  before: { code: 'const a = 1;\r\nconst b = 2;\r\nconsole.log(a, b);' },
  after: { code: 'const a = 1;\r\n// tiếng Việt 👋\r\nconst b = 2;\r\nconsole.log(a, b);' },
  annotations: [{ id: 'value', side: 'after', title: 'Dòng được giữ', description: 'Sau chèn, dòng 2 cũ thành dòng 3 mới.', ranges: [[3, 3]] }],
};
const plain = { highlight: false };
const fence = (body) => '```code-diff\n' + body + '\n```';
const descriptor = 'title: Demo\nbefore: {code: a}\nafter: {code: b}';

function reconstruct(data, side) {
  const lines = diffCodeLines(data[side].code);
  return data.rows.filter((row) => side === 'before' ? row.type !== 'add' : row.type !== 'remove').map((row) => lines[(side === 'before' ? row.beforeLine : row.afterLine) - 1].raw).join('');
}

test('physical file lines distinguish empty input, final newlines and CRLF/CR/LF', () => {
  assert.deepEqual(diffCodeLines(''), []);
  assert.deepEqual(diffCodeLines('\n'), [{ text: '', ending: '\n', raw: '\n' }]);
  assert.deepEqual(diffCodeLines('a\r\nb\rc\nlast').map((line) => [line.text, line.ending]), [['a', '\r\n'], ['b', '\r'], ['c', '\n'], ['last', '']]);
  assert.equal(diffLineEndings(''), 'File rỗng'); assert.equal(diffLineEndings('a'), 'Không có EOL');
  assert.equal(diffLineEndings('a\r\n'), 'CRLF'); assert.equal(diffLineEndings('a\rb\n'), 'EOL hỗn hợp');
});

test('prepared edits reconstruct both originals including Unicode and missing final newline', async () => {
  for (const [before, after] of [['', ''], ['', '\n'], ['\n', ''], ['a', 'a\n'], ['a\r\n', 'a\n'], ['a\rb', 'a\rc'],
    ['same\nsame\n', 'same\nchanged\nsame\n'], ['👋\n<script>\nlast', '👋\n安全\nlast']]) {
    const data = await prepareCodeDiff({ title: 'Case', before: { code: before }, after: { code: after } }, plain);
    validatePreparedCodeDiff(data);
    assert.equal(reconstruct(data, 'before'), before); assert.equal(reconstruct(data, 'after'), after);
  }
  const newline = await prepareCodeDiff({ title: 'Newline', before: { code: 'a' }, after: { code: 'a\n' } }, plain);
  assert.deepEqual(newline.rows.map((row) => row.type), ['remove', 'add']);
  const html = renderToStaticMarkup(createElement(CodeDiff, { data: newline }));
  assert.match(html, /Không có newline cuối/);
  const empty = await prepareCodeDiff({ title: 'Empty', before: { code: '' }, after: { code: '' } }, plain);
  assert.match(renderToStaticMarkup(createElement(CodeDiff, { data: empty })), /Cả hai file rỗng/);
});

test('bounded LCS is deterministic and minimal on generated small inputs', async () => {
  let seed = 42;
  const random = (max) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
  function generate() {
    const rows = Array.from({ length: random(8) }, () => ['a', 'b', 'c', '👋'][random(4)]);
    return rows.join(random(2) ? '\n' : '\r\n') + (random(2) && rows.length ? '\n' : '');
  }
  function lcs(a, b) {
    const rows = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) rows[i][j] = a[i - 1].raw === b[j - 1].raw ? rows[i - 1][j - 1] + 1 : Math.max(rows[i - 1][j], rows[i][j - 1]);
    return rows[a.length][b.length];
  }
  for (let index = 0; index < 250; index++) {
    const before = generate(); const after = generate();
    const value = { title: 'Generated', before: { code: before }, after: { code: after } };
    const data = await prepareCodeDiff(value, plain);
    const a = diffCodeLines(before); const b = diffCodeLines(after);
    assert.equal(data.rows.filter((row) => row.type !== 'equal').length, a.length + b.length - 2 * lcs(a, b));
    assert.equal(reconstruct(data, 'before'), before); assert.equal(reconstruct(data, 'after'), after);
    assert.deepEqual(data.rows, (await prepareCodeDiff(value, plain)).rows);
  }
});

test('validates author data, prepared rows, source refs, token integrity and resource bounds', async () => {
  for (const value of [null, { ...input, title: '' }, { ...input, before: { code: 1 } }, { ...input, typo: true },
    { ...input, contextLines: -1 }, { ...input, contextLines: 21 }, { ...input, contextLines: 1.5 },
    { ...input, before: { code: 'a', source: { project: 'x', region: 'a', lines: '1' } } },
    { ...input, before: { code: 'a', tokens: [[{ content: 'different' }]] } },
    { ...input, before: { code: 'a', tokens: new Array(1) } },
    { ...input, before: { code: 'a', tokens: [[{ content: 'a', light: 'red;display:none' }]] } },
    { ...input, before: { code: 'x'.repeat(262145) } }, { ...input, before: { code: '\n'.repeat(2001) } }]) {
    assert.throws(() => validateCodeDiffInput(value), /Code Diff/);
  }
  for (const change of [{ side: 'other' }, { ranges: [[0, 1]] }, { ranges: [[1, 5]] }, { ranges: [new Array(2)] }, { typo: true }]) {
    const value = structuredClone(input); Object.assign(value.annotations[0], change);
    assert.throws(() => validateCodeDiffInput(value), /Code Diff/);
  }
  const data = await prepareCodeDiff(input, plain);
  const bad = [[], [...data.rows, data.rows[0]], [{ type: 'equal', beforeLine: 1, afterLine: 2 }],
    [{ type: 'remove', beforeLine: 1, afterLine: 1 }], [{ type: 'bogus', afterLine: 1 }]];
  for (const rows of bad) assert.throws(() => validatePreparedCodeDiff({ ...data, rows }), /Code Diff/);
  await assert.rejects(() => prepareCodeDiff(input, { highlight: 'yes' }), /highlight must be boolean/);
});

test('large bounded files work without bringing the diff matrix into client data', async () => {
  const before = Array.from({ length: 2000 }, (_, i) => `before-${i}\n`).join('');
  const after = Array.from({ length: 2000 }, (_, i) => `after-${i}\n`).join('');
  const data = await prepareCodeDiff({ title: 'Bound', before: { code: before }, after: { code: after } }, plain);
  assert.equal(data.rows.length, 4000);
  assert.equal(reconstruct(data, 'before'), before); assert.equal(reconstruct(data, 'after'), after);
  assert.deepEqual(Object.keys(data).sort(), ['title', 'language', 'before', 'after', 'contextLines', 'rows'].sort());
});

test('annotation ranges stay on their original side and pinned unchanged lines never fold', async () => {
  const data = await prepareCodeDiff(input, plain);
  const targetIndex = data.rows.findIndex((row) => row.type === 'equal' && row.beforeLine === 2 && row.afterLine === 3);
  assert.ok(targetIndex >= 0);
  assert.ok(diffBlocks(data).find((block) => block.indices.includes(targetIndex) && !block.folded));
  assert.ok(diffBlocks(data).some((block) => block.folded));
  const html = renderToStaticMarkup(createElement(CodeDiff, { data }));
  assert.match(html, /data-before-line="2"/); assert.match(html, /data-after-line="3"/);
  assert.match(html, /Bản sau · Dòng 3/);
  assert.match(html, /hidden=""[^>]*>Sao chép bản trước/);
});

test('highlighting runs on whole files, SSR escapes all prose and source adapter is optional', async () => {
  const value = structuredClone(input);
  value.title = '<script>title</script>';
  value.after.source = { project: 'demo', file: 'src/main.ts', snapshot: 'v1' };
  value.annotations[0].description = '<img src=x onerror=alert(1)>';
  const data = await prepareCodeDiff(value);
  assert.ok(data.after.tokens.flat().some((token) => token.light !== token.dark));
  const html = renderToStaticMarkup(createElement(CodeDiff, { data }));
  assert.match(html, /--code-diff-token-dark/); assert.doesNotMatch(html, /<script|<img/);
  assert.match(html, /source=demo/);
  assert.match(renderToStaticMarkup(createElement(CodeDiffWithSource, { data })), /source-ref/);
  const markup = renderToStaticMarkup(createElement('div', null, createElement(CodeDiff, { data }), createElement(CodeDiff, { data })));
  const ids = [...markup.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size);
});

test('authored MDX fixtures compile, execute and render without interpreting their code', async () => {
  for (const name of ['dockerfile', 'iam-policy', 'sql-query']) {
    const path = new URL(`../examples/code-diff/${name}.mdx`, import.meta.url);
    const result = await compile({ value: await readFile(path, 'utf8'), path: path.pathname }, { remarkPlugins: [remarkCodeDiff], outputFormat: 'function-body' });
    const { default: Content } = await run(String(result), { ...runtime, baseUrl: import.meta.url });
    const html = renderToStaticMarkup(createElement(Content, { components: { CodeDiff } }));
    assert.match(html, /code-diff/); assert.match(html, /Giải thích thay đổi/); assert.match(html, /--code-diff-token-light/);
  }
});

test('remark reports file and fence position for descriptor/highlight failures and chooses adapter', async () => {
  for (const value of ['title: [', descriptor + '\ntitle: Duplicate', descriptor + '\nextra: no', descriptor + '\nlanguage: invalid-language',
    descriptor + '\nannotations: [{id: a, side: after, title: A, description: B, ranges: [[1, 2]]}]']) {
    await assert.rejects(() => compile({ value: '\n\n' + fence(value), path: '/docs/bad-diff.mdx' }, { remarkPlugins: [remarkCodeDiff] }), (error) => {
      assert.match(error.message, /Code Diff failed/); assert.equal(error.file, '/docs/bad-diff.mdx'); assert.equal(error.line, 3); return true;
    });
  }
  const sourced = descriptor.replace('after: {code: b}', 'after: {code: b, source: {project: demo}}');
  assert.match(String(await compile(fence(sourced), { remarkPlugins: [remarkCodeDiff] })), /CodeDiffWithSource/);
  const ordinary = '```diff\n-a\n+b\n```';
  assert.equal(String(await compile(ordinary, { remarkPlugins: [remarkCodeDiff] })), String(await compile(ordinary)));
});

test('base browser entry excludes diff engine, Shiki, YAML and source drawer', async () => {
  const { build } = await import('esbuild');
  const result = await build({ stdin: { contents: "export { CodeDiff } from '@vanhiep99w/docs-kit/components/code-diff';", resolveDir: process.cwd() }, bundle: true, platform: 'browser', format: 'esm', write: false, metafile: true, external: ['react', 'react/jsx-runtime'], minify: true });
  assert.ok(result.outputFiles[0].contents.length < 22_000);
  assert.doesNotMatch(Object.keys(result.metafile.inputs).join('\n'), /node_modules\/|shiki|yaml|code-diff\/diff\.|provider|explorer\.tsx|code\/highlight/);
  for (const name of ['code-diff', 'code-diff-source']) assert.match(await readFile(new URL(`../dist/components/${name}.js`, import.meta.url), 'utf8'), /^['"]use client['"]/);
});
