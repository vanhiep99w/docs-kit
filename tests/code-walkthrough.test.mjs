import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import * as runtime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { compile, run } from '@mdx-js/mdx';
import { prepareCodeWalkthrough, parseCodeWalkthroughDescriptor, remarkCodeWalkthrough } from '@vanhiep99w/docs-kit/code-walkthrough';
import { validateCodeWalkthrough } from '@vanhiep99w/docs-kit/code-walkthrough/data';
import { CodeWalkthrough } from '@vanhiep99w/docs-kit/components/code-walkthrough';
import { CodeWalkthroughWithSource } from '@vanhiep99w/docs-kit/components/code-walkthrough-source';

const input = {
  title: 'Các bước 👋', description: 'Không thực thi code.', language: 'typescript',
  snapshots: [
    { id: 'after', title: 'Sau', code: 'const value = 2;\nif (value) {\n  console.log(value);\n}\n', source: { project: 'demo', snapshot: 'v1', file: 'src/main.ts' } },
    { id: 'before', title: 'Trước', code: 'const value = 1;\r\n\r\nconsole.log(value); // 👋\r\n', source: { project: 'demo', snapshot: 'v0', file: 'src/main.ts' } },
  ],
  steps: [
    { id: 'old', snapshot: 'before', title: 'Giá trị cũ', description: 'Khai báo ban đầu.', ranges: [[1, 1]] },
    { id: 'new', snapshot: 'after', title: 'Thay đổi và guard', description: 'Hai vùng được chọn.', ranges: [[1, 1], [2, 3]] },
    { id: 'log', snapshot: 'after', title: 'Nhánh có giá trị', description: 'Dòng trong guard.', ranges: [[3, 3]] },
    { id: 'revisit', snapshot: 'before', title: 'Quay lại', description: 'Không phải history Git.', ranges: [[3, 3]] },
  ],
};
const codeLines = (code) => code.split(/\r\n|\r|\n/);
const clone = () => structuredClone(input);
const descriptor = 'title: Demo\nlanguage: text\nsnapshots: [{id: a, title: A, code: hello}]\nsteps: [{id: s, snapshot: a, title: Step, description: Text, ranges: [[1, 1]]}]';
const fence = (body, language = 'code-walkthrough') => '\x60\x60\x60' + language + '\n' + body + '\n\x60\x60\x60';

test('prepares each snapshot independently, retaining exact source, tokens and ordered revisits', async () => {
  const original = clone(); const data = await prepareCodeWalkthrough(input);
  assert.deepEqual(input, original);
  assert.deepEqual(data.steps, input.steps);
  for (const [index, snapshot] of data.snapshots.entries()) {
    assert.equal(snapshot.code, input.snapshots[index].code);
    assert.deepEqual(snapshot.source, input.snapshots[index].source);
    assert.deepEqual(snapshot.tokens.map((line) => line.map((token) => token.content).join('')), codeLines(snapshot.code));
    assert.ok(snapshot.tokens.flat().some((token) => token.light !== token.dark));
    assert.equal(snapshot.language, 'typescript');
  }

});

test('validates schema, IDs, source requests, missing/unused snapshots and snapshot-local ranges', () => {
  for (const value of [null, { ...input, title: '' }, { ...input, snapshots: [] }, { ...input, steps: [] },
    { ...input, snapshots: new Array(1) }, { ...input, steps: new Array(1) }, { ...input, typo: true }]) {
    assert.throws(() => validateCodeWalkthrough(value), /Code Walkthrough/);
  }
  for (const [field, change] of [
    ['snapshots', { id: 'bad id' }], ['snapshots', { title: '' }], ['snapshots', { code: null }], ['snapshots', { language: '' }],
    ['snapshots', { source: { project: 'demo', region: 'entry', lines: '1' } }], ['snapshots', { source: { project: 'demo', typo: true } }],
    ['snapshots', { typo: true }], ['steps', { id: 'bad id' }], ['steps', { title: '' }], ['steps', { description: '' }],
    ['steps', { snapshot: 'missing' }], ['steps', { ranges: [] }], ['steps', { ranges: [[0, 1]] }], ['steps', { ranges: [[1, 5]] }],
    ['steps', { ranges: [[3, 2]] }], ['steps', { ranges: [[1.5, 2]] }], ['steps', { typo: true }],
  ]) {
    const value = clone(); Object.assign(value[field][0], change);
    assert.throws(() => validateCodeWalkthrough(value), /Code Walkthrough/);
  }
  for (const field of ['snapshots', 'steps']) {
    const value = clone(); value[field].push(value[field][0]);
    assert.throws(() => validateCodeWalkthrough(value), /duplicate/);
  }
  const unused = clone(); unused.snapshots.push({ id: 'unused', title: 'Unused', code: 'x' });
  assert.throws(() => validateCodeWalkthrough(unused), /not referenced/);
});

test('bounds snapshots, steps, code, lines, total text, ranges and prepared token volume', () => {
  for (const [field, count] of [['snapshots', 13], ['steps', 65]]) {
    assert.throws(() => validateCodeWalkthrough({ ...input, [field]: Array(count).fill(input[field][0]) }), /1–/);
  }
  const code = clone(); code.snapshots[0].code = 'x'.repeat(262145);
  assert.throws(() => validateCodeWalkthrough(code), /262144/);
  const lines = clone(); lines.snapshots[0].code = '\n'.repeat(4096);
  assert.throws(() => validateCodeWalkthrough(lines), /4096/);
  const ranges = clone(); ranges.steps[0].ranges = Array(17).fill([1, 1]);
  assert.throws(() => validateCodeWalkthrough(ranges), /1–16/);
  const total = clone(); total.snapshots = Array.from({ length: 5 }, (_, i) => ({ id: 'v' + i, title: 'V', code: 'x'.repeat(250000) }));
  total.steps = total.snapshots.map((snapshot) => ({ id: 's' + snapshot.id, snapshot: snapshot.id, title: 'S', description: 'S', ranges: [[1, 1]] }));
  assert.throws(() => validateCodeWalkthrough(total), /1048576/);
  const lineTotal = clone(); lineTotal.snapshots = Array.from({ length: 3 }, (_, i) => ({ id: 'v' + i, title: 'V', code: '\n'.repeat(3000) }));
  lineTotal.steps = lineTotal.snapshots.map((snapshot) => ({ id: 's' + snapshot.id, snapshot: snapshot.id, title: 'S', description: 'S', ranges: [[1, 1]] }));
  assert.throws(() => validateCodeWalkthrough(lineTotal), /8192/);
  const tokenTotal = clone(); tokenTotal.snapshots[0].tokens = [Array(131073).fill({ content: '' }), [], [], [], []];
  assert.throws(() => validateCodeWalkthrough(tokenTotal), /131072/);
  assert.throws(() => validateCodeWalkthrough({ ...input, title: 'x'.repeat(16385) }), /16384/);
});

test('empty code, Unicode, CRLF/CR/newlines and snapshot language overrides retain existing semantics', async () => {
  for (const code of ['', '\n', 'xin chào 👋\r\n', 'a\rb\r', '\t\n\n']) {
    const data = await prepareCodeWalkthrough({ title: 'Text', language: 'sql', snapshots: [{ id: 'a', title: 'A', code, language: 'text' }], steps: [{ id: 's', snapshot: 'a', title: 'S', description: 'D', ranges: [[1, 1]] }] });
    assert.equal(data.snapshots[0].code, code); assert.equal(data.snapshots[0].language, 'text');
    assert.deepEqual(data.snapshots[0].tokens.map((line) => line.map((token) => token.content).join('')), codeLines(code));
  }
  await assert.rejects(() => prepareCodeWalkthrough({ ...input, language: 'unsupported-language' }), /unsupported language/);
  await assert.rejects(() => prepareCodeWalkthrough(input, { themes: { dark: 'bad-theme' } }), /unsupported theme/);
  await assert.rejects(() => parseCodeWalkthroughDescriptor('x'.repeat(2097153)), /2097152/);
});

test('prepared tokens must reconstruct every snapshot and cannot inject CSS or HTML', async () => {
  const data = await prepareCodeWalkthrough(input);
  const bad = structuredClone(data); bad.snapshots[0].tokens[0][0].content = 'bad';
  assert.throws(() => validateCodeWalkthrough(bad), /tokens/);
  const css = structuredClone(data); css.snapshots[0].tokens[0][0].light = 'red; background:url(x)';
  assert.throws(() => validateCodeWalkthrough(css), /token/);
  const wrongRows = structuredClone(data); wrongRows.snapshots[0].tokens = [];
  assert.throws(() => validateCodeWalkthrough(wrongRows), /displayed lines/);
});

test('SSR renders each snapshot once, all explanations and no-JS fallback, initially selects the first step snapshot', () => {
  const html = renderToStaticMarkup(createElement(CodeWalkthrough, { data: input }));
  assert.equal([...html.matchAll(/class="code-walkthrough-code"/g)].length, 2);
  assert.match(html, /data-snapshot="before"/); assert.doesNotMatch(html, /data-snapshot="after" open=""/);
  assert.match(html, /Không phải history Git/); assert.match(html, /Hai vùng được chọn/);
  assert.match(html, /aria-label="Chọn bước"/); assert.match(html, /hidden=""/);
  const two = renderToStaticMarkup(createElement('div', null, createElement(CodeWalkthrough, { data: input }), createElement(CodeWalkthrough, { data: input })));
  const ids = [...two.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  assert.ok([...two.matchAll(/href="#([^"]+)"/g)].every((match) => ids.includes(match[1])));
});

test('source adapter preserves per-snapshot references and SSR remains usable without provider', () => {
  const html = renderToStaticMarkup(createElement(CodeWalkthroughWithSource, { data: input }));
  assert.match(html, /source-ref/); assert.match(html, /snapshot=v0/); assert.doesNotMatch(html, /source-drawer/);
  const custom = renderToStaticMarkup(createElement(CodeWalkthroughWithSource, { data: input, renderSourceLink: () => createElement('span', null, 'Custom source') }));
  assert.doesNotMatch(custom, /source-ref/); assert.match(custom, /Custom source/);
});

test('MDX fixtures compile and use the standalone viewer', async () => {
  for (const name of ['walkthrough-guard', 'walkthrough-dockerfile']) {
    const path = new URL(`../examples/code-walkthrough/${name}.mdx`, import.meta.url);
    const result = await compile({ value: await readFile(path, 'utf8'), path: path.pathname }, { remarkPlugins: [remarkCodeWalkthrough], outputFormat: 'function-body' });
    const { default: Content } = await run(String(result), { ...runtime, baseUrl: import.meta.url });
    const html = renderToStaticMarkup(createElement(Content, { components: { CodeWalkthrough } }));
    assert.match(html, /code-walkthrough/); assert.match(html, /code-walkthrough-token/); assert.match(html, /code-walkthrough-note/);
  }
  const ordinary = fence('const a = 1;', 'typescript');
  assert.equal(String(await compile(ordinary, { remarkPlugins: [remarkCodeWalkthrough] })), String(await compile(ordinary)));

});

test('descriptor errors retain file/fence position, reject tokens and select source adapter only when needed', async () => {
  for (const body of ['title: [', descriptor + '\ntitle: duplicate', descriptor + '\nunknown: true',
    descriptor.replace('snapshot: a', 'snapshot: missing'), descriptor.replace('code: hello', 'code: hello, tokens: [[{content: hello}]]')]) {
    await assert.rejects(() => compile({ value: '\n\n' + fence(body), path: '/docs/bad-walkthrough.mdx' }, { remarkPlugins: [remarkCodeWalkthrough] }), (error) => {
      assert.match(error.message, /Code Walkthrough failed/); assert.equal(error.file, '/docs/bad-walkthrough.mdx'); assert.equal(error.line, 3); return true;
    });
  }
  assert.match(String(await compile(fence(JSON.stringify(input)), { remarkPlugins: [remarkCodeWalkthrough] })), /CodeWalkthroughWithSource/);
  assert.equal((await parseCodeWalkthroughDescriptor(descriptor)).snapshots[0].code, 'hello');
});

test('malicious-looking code and descriptions remain escaped; browser bundle is standalone without build tools', async () => {
  const value = clone(); value.title = '<script>bad</script>'; value.steps[0].description = '<b>plain</b>';
  value.snapshots[1].code = '<iframe src=x>\n\nline'; value.snapshots[1].language = 'text';
  const result = await compile(fence(JSON.stringify(value)), { remarkPlugins: [remarkCodeWalkthrough], outputFormat: 'function-body' });
  const { default: Content } = await run(String(result), { ...runtime, baseUrl: import.meta.url });
  const html = renderToStaticMarkup(createElement(Content, { components: { CodeWalkthroughWithSource } }));
  assert.doesNotMatch(html, /<script|<iframe|<b>/); assert.match(html, /&lt;b&gt;plain/);
  const { build } = await import('esbuild');
  const bundle = await build({ stdin: { contents: "export { CodeWalkthrough } from '@vanhiep99w/docs-kit/components/code-walkthrough';", resolveDir: process.cwd() }, bundle: true, platform: 'browser', format: 'esm', write: false, metafile: true, external: ['react', 'react/jsx-runtime'], minify: true });
  const files = Object.keys(bundle.metafile.inputs).join('\n');
  assert.doesNotMatch(files, /annotated-example/); assert.doesNotMatch(files, /shiki|yaml|d2\/|explorer\.tsx|provider\.tsx|node:|code-diff/);
  assert.ok(bundle.outputFiles[0].contents.length < 25000);
  const source = await readFile(new URL('../dist/components/code-walkthrough.js', import.meta.url), 'utf8');
  assert.match(source, /^['"]use client['"]/); assert.doesNotMatch(source, /fetch\(|WebSocket|eval\(|dangerouslySetInnerHTML/);
  assert.doesNotMatch(await readFile(new URL('../dist/styles/code-walkthrough.css', import.meta.url), 'utf8'), /@import/);
  console.log('Code Walkthrough minified standalone, React external:', bundle.outputFiles[0].contents.length, 'bytes');
});
