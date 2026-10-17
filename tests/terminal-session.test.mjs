import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import * as runtime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { compile, run } from '@mdx-js/mdx';
import { parseTerminalSession, remarkTerminalSession } from '@vanhiep99w/docs-kit/terminal-session';
import { terminalContextLabel, validateTerminalSession } from '@vanhiep99w/docs-kit/terminal-session/data';
import { TerminalSession } from '@vanhiep99w/docs-kit/components/terminal-session';

const session = {
  title: 'Phiên minh họa',
  context: { kind: 'local', label: 'dev', cwd: '~/work' },
  steps: [{
    id: 'inspect',
    command: 'printf \'%s\\n\' \\\r\n  "xin chào 👋"\r\n',
    warning: 'Chỉ thao tác trên môi trường thử nghiệm.',
    expected: 'Giá trị ví dụ.',
    exitCode: 0,
    outputs: [
      { stream: 'stdout', text: 'xin chào 👋\r\n\r\n', annotations: [{ id: 'value', title: 'Giá trị', description: 'Dòng đầu.', ranges: [[1, 1], [2, 2]] }] },
      { stream: 'stderr', text: 'progress, not failure', collapsed: true },
    ],
  }],
};
const clone = () => structuredClone(session);
const fence = (body) => '\x60\x60\x60terminal-session\n' + body + '\n\x60\x60\x60';
const descriptor = 'title: Demo\ncontext: {kind: local}\nsteps: [{id: a, command: echo ok}]';

test('validates contexts, IDs, command text, ordered streams and optional fields', () => {
  validateTerminalSession(session);
  for (const kind of ['local', 'container', 'pod', 'remote']) {
    const data = clone(); data.context.kind = kind; validateTerminalSession(data);
    assert.ok(terminalContextLabel(data.context).includes('dev · ~/work'));
  }
  const inputs = [
    { ...session, title: '' }, { ...session, context: null }, { ...session, context: { kind: 'unknown' } },
    { ...session, context: { kind: 'local', cwd: '' } }, { ...session, context: { kind: 'pod', typo: true } },
    { ...session, steps: [] }, { ...session, steps: 'bad' }, { ...session, typo: true },
  ];
  for (const value of inputs) assert.throws(() => validateTerminalSession(value), /Terminal Session/);
  const changes = [
    { id: 'bad id' }, { command: '' }, { command: ' \n ' }, { prompt: '$\n>' },
    { warning: '' }, { context: { cwd: '/app' } }, { exitCode: -1 }, { exitCode: 1.5 },
    { exitCode: Number.MAX_SAFE_INTEGER + 1 }, { outputs: 'bad' }, { typo: true },
    { outputs: [{ stream: 'console', text: 'x' }] }, { outputs: [{ stream: 'stdout', text: 1 }] },
    { outputs: [{ stream: 'stderr', text: '', collapsed: 'yes' }] },
    { outputs: [{ stream: 'stdout', text: 'x', typo: true }] },
  ];
  for (const change of changes) {
    const data = clone(); Object.assign(data.steps[0], change);
    assert.throws(() => validateTerminalSession(data), /Terminal Session/);
  }
  const duplicate = clone(); duplicate.steps.push(duplicate.steps[0]);
  assert.throws(() => validateTerminalSession(duplicate), /duplicate step/);
  const plain = clone(); plain.steps = [{ id: 'empty-output', command: 'true', prompt: '', outputs: [{ stream: 'stdout', text: '' }] }];
  validateTerminalSession(plain);
});

test('output annotations reuse inclusive ranges and validate each output independently', () => {
  for (const ranges of [[], [[0, 1]], [[2, 1]], [[1, 4]], [[1.5, 2]], [[1, 2, 3]]]) {
    const data = clone(); data.steps[0].outputs[0].annotations[0].ranges = ranges;
    assert.throws(() => validateTerminalSession(data), /outputs\[0\].*range/i);
  }
  const duplicate = clone();
  duplicate.steps[0].outputs[0].annotations.push(duplicate.steps[0].outputs[0].annotations[0]);
  assert.throws(() => validateTerminalSession(duplicate), /duplicate annotation/);
  const another = clone();
  another.steps[0].outputs[1].annotations = [{ id: 'value', title: 'Same ID, other output', description: 'Allowed.', ranges: [[1, 1]] }];
  validateTerminalSession(another);
});

test('rejects ANSI and invisible terminal controls without rewriting copyable commands', () => {
  for (const control of ['\x1b[31m', '\x00', '\x08', '\x7f', '\x9b']) {
    const command = clone(); command.steps[0].command += control;
    assert.throws(() => validateTerminalSession(command), /control characters\/ANSI/);
    const output = clone(); output.steps[0].outputs[0].text += control;
    assert.throws(() => validateTerminalSession(output), /control characters\/ANSI/);
  }
  const before = structuredClone(session);
  validateTerminalSession(session);
  assert.deepEqual(session, before);
  const parsed = parseTerminalSession(descriptor);
  assert.equal(parsed.steps[0].command, 'echo ok');
});

test('SSR escapes all content, scopes IDs and leaves native disclosure usable without JS', () => {
  const data = clone();
  data.title = '<script>title</script>';
  data.steps[0].command = 'echo "<img src=x onerror=alert(1)>"';
  data.steps[0].outputs[0].text = '<script>alert(1)</script>\nmore';
  data.steps[0].context = { kind: 'pod', label: 'api-123', cwd: '/app' };
  const html = renderToStaticMarkup(createElement(TerminalSession, { data }));
  assert.doesNotMatch(html, /<script|<img/);
  assert.match(html, /&lt;img/);
  assert.match(html, /Local · dev · ~\/work/);
  assert.match(html, /Pod · api-123 · \/app/);
  assert.match(html, /stdout/); assert.match(html, /stderr/);
  assert.match(html, /Cảnh báo/); assert.match(html, /Kết quả kỳ vọng/);
  assert.match(html, /Exit code: 0/);
  assert.match(html, /button[^>]*hidden=""/);
  assert.match(html, /details[^>]*data-stream="stdout" open=""/);
  assert.match(html, /details[^>]*data-stream="stderr">/);
  assert.match(html, /data-highlighted="true"/);
  const markup = renderToStaticMarkup(createElement('div', null, createElement(TerminalSession, { data }), createElement(TerminalSession, { data })));
  const ids = [...markup.matchAll(/ id="([^"]+)"/g)].map((entry) => entry[1]);
  assert.equal(ids.length, new Set(ids).size);
});

test('compiles and executes MDX fixtures as UI only, with no shell execution', async () => {
  for (const name of ['kubernetes', 'docker', 'redis']) {
    const path = new URL(`../examples/terminal-session/${name}.mdx`, import.meta.url);
    const result = await compile({ value: await readFile(path, 'utf8'), path: path.pathname }, { remarkPlugins: [remarkTerminalSession], outputFormat: 'function-body' });
    const { default: Content } = await run(String(result), { ...runtime, baseUrl: import.meta.url });
    const html = renderToStaticMarkup(createElement(Content, { components: { TerminalSession } }));
    assert.match(html, /terminal-session/);
    assert.match(html, /Các bước terminal/);
    assert.match(html, /stdout|stderr/);
  }
});

test('reports descriptor errors with source file and fence location', async () => {
  for (const body of ['title: [', descriptor + '\ntitle: Duplicate', descriptor + '\nunknown: true',
    descriptor.replace('echo ok', '""'), descriptor.replace('kind: local', 'kind: production')]) {
    await assert.rejects(() => compile({ value: '\n\n' + fence(body), path: '/docs/bad-terminal.mdx' }, { remarkPlugins: [remarkTerminalSession] }), (error) => {
      assert.match(error.message, /Terminal Session failed/);
      assert.equal(error.file, '/docs/bad-terminal.mdx'); assert.equal(error.line, 3);
      return true;
    });
  }
});

test('terminal browser entry has no shell, network runtime, parser, highlighter or source drawer', async () => {
  const { build } = await import('esbuild');
  const result = await build({ stdin: { contents: "export { TerminalSession } from '@vanhiep99w/docs-kit/components/terminal-session';", resolveDir: process.cwd() }, bundle: true, platform: 'browser', format: 'esm', write: false, metafile: true, external: ['react', 'react/jsx-runtime'], minify: true });
  assert.ok(result.outputFiles[0].contents.length < 20_000);
  assert.doesNotMatch(Object.keys(result.metafile.inputs).join('\n'), /shiki|yaml|d2\/|explorer|provider|node:|annotated-example/);
  const built = await readFile(new URL('../dist/components/terminal-session.js', import.meta.url), 'utf8');
  assert.match(built, /^['"]use client['"]/);
  assert.doesNotMatch(built, /fetch\(|WebSocket|eval\(|exec\(|dangerouslySetInnerHTML/);
  const css = await readFile(new URL('../dist/styles/terminal-session.css', import.meta.url), 'utf8');
  assert.match(css, /\.terminal-session/); assert.match(css, /@container/);
});
