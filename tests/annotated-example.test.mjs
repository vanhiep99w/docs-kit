import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import * as runtime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { compile, run } from '@mdx-js/mdx';
import { prepareAnnotatedExample, remarkAnnotatedExample } from '@vanhiep99w/docs-kit/annotated-example';
import { codeLines, validateAnnotatedExample } from '@vanhiep99w/docs-kit/annotated-example/data';
import { AnnotatedExample } from '@vanhiep99w/docs-kit/components/annotated-example';
import { AnnotatedExampleWithSource } from '@vanhiep99w/docs-kit/components/annotated-example-source';

const example = {
  title: 'Một ví dụ',
  language: 'typescript',
  code: 'const value = "<script>alert(1)</script>";\r\n\r\nconsole.log(value);\r\n',
  annotations: [
    { id: 'value', title: 'Khai báo', description: 'Giữ nguyên Unicode: tiếng Việt.', ranges: [[1, 1], [3, 3]] },
    { id: 'overlap', title: 'Vùng chồng', description: 'Các vùng có thể chồng nhau.', ranges: [[1, 3]] },
  ],
};

test('validates ranges, duplicate IDs, source refs and tokens for direct usage', () => {
  validateAnnotatedExample(example);
  assert.deepEqual(codeLines('a\r\nb\rc\n'), ['a', 'b', 'c', '']);
  for (const ranges of [[], [[0, 1]], [[2, 1]], [[1, 5]], [[1.5, 2]], [[1]], [[1, 2, 3]]]) {
    assert.throws(() => validateAnnotatedExample({ ...example, annotations: [{ ...example.annotations[0], ranges }] }), /range/i);
  }
  assert.throws(() => validateAnnotatedExample({ ...example, annotations: [example.annotations[0], example.annotations[0]] }), /duplicate/);
  assert.throws(() => validateAnnotatedExample({ ...example, annotations: [] }), /non-empty array/);
  assert.throws(() => validateAnnotatedExample({ ...example, annotations: [{ ...example.annotations[0], id: 'bad id' }] }), /annotation id/);
  for (const source of [{ project: '' }, { project: 'a', region: 'x', lines: '1-2' }, { project: 'a', lines: '3-1' }, { project: 'a', lines: '1;alert(1)' }]) {
    assert.throws(() => validateAnnotatedExample({ ...example, source }), /source/);
  }
  assert.throws(() => validateAnnotatedExample({ ...example, tokens: [] }), /line count/);
  const plain = { title: 'Text', code: 'safe', annotations: [{ ...example.annotations[0], ranges: [[1, 1]] }] };
  for (const token of [{ content: 'different' }, { content: 'safe', light: 'red;background:url(x)' }, { content: 'safe', dark: '#12345' }, { content: 'safe', fontStyle: 8 }]) {
    assert.throws(() => validateAnnotatedExample({ ...plain, tokens: [[token]] }), /token/);
  }
});

test('build-time highlighting retains exact code and aligned lines for both themes', async () => {
  const data = await prepareAnnotatedExample(example);
  assert.equal(data.code, example.code);
  assert.equal(data.tokens.length, 4);
  assert.deepEqual(data.tokens.map((line) => line.map((token) => token.content).join('')), codeLines(example.code));
  assert.ok(data.tokens.flat().some((token) => token.light !== token.dark));
  assert.ok(data.tokens.flat().every((token) => token.light && token.dark));
  for (const code of ['', '\n', '\t', 'a\n\n', 'xin chào 👋\r\n']) {
    const data = await prepareAnnotatedExample({ ...example, code, language: 'text', annotations: [{ ...example.annotations[0], ranges: [[1, 1]] }] });
    assert.deepEqual(data.tokens.map((line) => line.map((token) => token.content).join('')), codeLines(code));
  }
  await assert.rejects(() => prepareAnnotatedExample({ ...example, language: 'not-a-language' }), /unsupported language/);
  await assert.rejects(() => prepareAnnotatedExample(example, { themes: { dark: 'not-a-theme' } }), /unsupported theme/);
});

test('SSR escapes code/prose, includes every annotation and supports missing providers', async () => {
  const data = await prepareAnnotatedExample({ ...example, source: { project: 'demo', file: 'src/main.ts' } });
  const html = renderToStaticMarkup(createElement(AnnotatedExample, { data }));
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>|<button[^>]*>(?!Sao chép)/);
  assert.match(html, /data-line="4"/);
  assert.match(html, /Vùng chồng/);
  assert.match(html, /tiếng Việt/);
  assert.match(html, /Dòng 1, 3/);
  assert.match(html, /hidden=""[^>]*>Sao chép code/);
  assert.match(html, /--annotated-token-light/);
  assert.match(html, /href="\?source=demo&amp;file=src%2Fmain.ts"/);
  const adapter = renderToStaticMarkup(createElement(AnnotatedExampleWithSource, { data }));
  assert.match(adapter, /source-ref/);
  assert.doesNotMatch(adapter, /source-drawer/);
  const two = renderToStaticMarkup(createElement('div', null, createElement(AnnotatedExample, { data }), createElement(AnnotatedExample, { data })));
  const ids = [...two.matchAll(/ id="([^"]+)"/g)].map((entry) => entry[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test('remark compiles and renders all real MDX fixtures with safe serialized tokens', async () => {
  for (const name of ['kubernetes', 'sql', 'rxjs']) {
    const path = new URL(`../examples/annotated-example/${name}.mdx`, import.meta.url);
    const result = await compile({ value: await readFile(path, 'utf8'), path: path.pathname }, { remarkPlugins: [remarkAnnotatedExample], outputFormat: 'function-body' });
    const { default: Content } = await run(String(result), { ...runtime, baseUrl: import.meta.url });
    const html = renderToStaticMarkup(createElement(Content, { components: { AnnotatedExample } }));
    assert.match(html, /annotated-example/);
    assert.match(html, /Chú thích code/);
    assert.match(html, /--annotated-token-dark/);
  }
});

const fence = (body) => '\x60\x60\x60annotated\n' + body + '\n\x60\x60\x60';
test('remark reports file and fence position for malformed descriptors', async () => {
  for (const body of [
    'title: x\ncode: x\nannotations: []',
    'title: [',
    'title: x\ntitle: y',
    'title: x\ncode: x\nannotations: [{id: a, title: A, description: B, ranges: [[1, 2]]}]',
    'title: x\ncode: x\nlanguage: invalid-language\nannotations: [{id: a, title: A, description: B, ranges: [[1, 1]]}]',
    'title: x\ncode: x\nextra: nope\nannotations: [{id: a, title: A, description: B, ranges: [[1, 1]]}]',
  ]) {
    await assert.rejects(() => compile({ value: '\n\n' + fence(body), path: '/docs/broken.mdx' }, { remarkPlugins: [remarkAnnotatedExample] }), (error) => {
      assert.match(error.message, /Annotated Example failed/);
      assert.equal(error.file, '/docs/broken.mdx');
      assert.equal(error.line, 3);
      return true;
    });
  }
});

test('source descriptors select the optional adapter and ordinary fences are untouched', async () => {
  const descriptor = 'title: x\ncode: x\nsource: {project: demo, file: src/main.ts}\nannotations: [{id: a, title: A, description: B, ranges: [[1, 1]]}]';
  const output = await compile(fence(descriptor), { remarkPlugins: [remarkAnnotatedExample] });
  assert.match(String(output), /AnnotatedExampleWithSource/);
  const ordinary = '\x60\x60\x60typescript\nconst a = 1;\n\x60\x60\x60';
  assert.equal(String(await compile(ordinary, { remarkPlugins: [remarkAnnotatedExample] })), String(await compile(ordinary)));
  const malicious = fence('title: "<img src=x onerror=alert(1)>"\ncode: "</script><script>alert(1)</script>"\nannotations: [{id: a, title: A, description: "<b>not HTML</b>", ranges: [[1, 1]]}]');
  const result = await compile(malicious, { remarkPlugins: [remarkAnnotatedExample], outputFormat: 'function-body' });
  const { default: Content } = await run(String(result), { ...runtime, baseUrl: import.meta.url });
  const html = renderToStaticMarkup(createElement(Content, { components: { AnnotatedExample } }));
  assert.doesNotMatch(html, /<script|<img|<b>/);
  assert.match(html, /&lt;b&gt;not HTML&lt;\/b&gt;/);
});

test('component bundle excludes renderers, highlighters and source drawer', async () => {
  const { build } = await import('esbuild');
  const result = await build({ stdin: { contents: "export { AnnotatedExample } from '@vanhiep99w/docs-kit/components/annotated-example';", resolveDir: process.cwd() }, bundle: true, platform: 'browser', format: 'esm', write: false, metafile: true, external: ['react', 'react/jsx-runtime'], minify: true });
  assert.ok(result.outputFiles[0].contents.length < 20_000);
  assert.doesNotMatch(Object.keys(result.metafile.inputs).join('\n'), /shiki|yaml|d2\/|explorer\.tsx|provider\.tsx|node:/);
  for (const name of ['annotated-example', 'annotated-example-source']) {
    assert.match(await readFile(new URL(`../dist/components/${name}.js`, import.meta.url), 'utf8'), /^['"]use client['"]/);
  }
  assert.match(await readFile(new URL('../dist/styles/annotated-example.css', import.meta.url), 'utf8'), /@container/);
});
