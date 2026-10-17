import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TerminalSession } from '@vanhiep99w/docs-kit/components/terminal-session';
import { parseTerminalSession } from '@vanhiep99w/docs-kit/terminal-session';
import { CodeDiff } from '@vanhiep99w/docs-kit/components/code-diff';
import { prepareCodeDiff } from '@vanhiep99w/docs-kit/code-diff';
import { DataInspector } from '@vanhiep99w/docs-kit/components/data-inspector';
import { prepareDataInspector } from '@vanhiep99w/docs-kit/data-inspector';

const render = (Component, data, props) => renderToStaticMarkup(createElement(Component, { data, ...props }));

test('compact terminal preserves warnings, note text and command source without inventing visible step headings', async () => {
  const mdx = await readFile(new URL('../examples/terminal-session/rollback.mdx', import.meta.url), 'utf8');
  const data = parseTerminalSession(mdx.split('```terminal-session\n')[1].split('```')[0]);
  const html = render(TerminalSession, data);
  assert.doesNotMatch(html, /class="terminal-session-step-header"|class="terminal-session-step-title"/);
  assert.equal([...html.matchAll(/class="terminal-session-notes"/g)].length, 4);
  assert.match(html, /<aside[^>]*role="note"/);
  assert.match(html, /Undo Pod template không rollback database/);
  assert.match(html, /<details class="terminal-session-info"><summary>Về phiên lệnh<\/summary><p>Phiên lệnh biên soạn/);
  for (const step of data.steps) assert.ok(html.includes(step.command));
});

test('short plain output does not need a disclosure row; explicit collapse and annotated output remain native details', () => {
  const html = render(TerminalSession, { title: 'Plain', context: { kind: 'local' }, steps: [{ id: 'a', command: 'demo', outputs: [
    { stream: 'stdout', text: 'one' }, { stream: 'stderr', text: 'diagnostic' }, { stream: 'stdout', text: 'collapsed', collapsed: true },
    { stream: 'stdout', text: 'annotated', annotations: [{ id: 'note', title: 'Note', description: 'Read this', ranges: [[1, 1]] }] },
  ] }] });
  assert.equal([...html.matchAll(/class="terminal-session-output terminal-session-output-plain"/g)].length, 2);
  assert.match(html, /<details class="terminal-session-output" data-stream="stdout"><summary>/);
  assert.match(html, /<details class="terminal-session-output" data-stream="stdout" open="">/);
  assert.match(html, /aria-label="stderr: Bước 1"/);
});

test('diff retains authored metadata in the details footer while only significant missing-newline differences get an inline symbol', async () => {
  const data = await prepareCodeDiff({ title: 'Authored title', caption: 'Assumptions must remain readable.', before: { label: 'v1', code: 'old' }, after: { label: 'v2', code: 'new' } }, { highlight: false });
  const html = render(CodeDiff, data);
  assert.match(html, /<figcaption[^>]*class="code-diff-sr-only">Authored title/);
  assert.match(html, /<details class="code-diff-info"><summary>Chi tiết<\/summary><strong>Authored title/);
  assert.match(html, /Assumptions must remain readable/); assert.match(html, /Trước · v1/); assert.match(html, /Không có newline cuối/);
  assert.doesNotMatch(html, /class="code-diff-header"|class="code-diff-files"|class="code-diff-no-newline"/);
  const newline = await prepareCodeDiff({ title: 'Newline', before: { code: 'same' }, after: { code: 'same\n' } }, { highlight: false });
  const newlineHTML = render(CodeDiff, newline);
  assert.equal([...newlineHTML.matchAll(/class="code-diff-no-newline"/g)].length, 1);
  assert.match(newlineHTML, /∅↵/);
});

test('nested inspector quiet chrome leaves JSON, raw source, annotations and unique IDs in SSR', () => {
  const data = prepareDataInspector({ title: 'Embedded attributes', json: '{"id":9007199254740993}', annotations: [{ id: 'id', pointer: '/id', title: 'Exact ID', description: 'No rounding' }] });
  const html = render(DataInspector, data, { embedded: true });
  assert.match(html, /data-embedded="true"/); assert.match(html, /9007199254740993/);
  assert.match(html, /<details class="data-inspector-tools" hidden="">/);
  assert.match(html, /JSON gốc đầy đủ/); assert.match(html, /Exact ID/);
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  assert.ok([...html.matchAll(/href="#([^"]+)"/g)].every((match) => ids.includes(match[1])));
});
