import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TerminalSession } from '@vanhiep99w/docs-kit/components/terminal-session';
import { parseTerminalSession } from '@vanhiep99w/docs-kit/terminal-session';
import { CodeDiff } from '@vanhiep99w/docs-kit/components/code-diff';
import { prepareCodeDiff } from '@vanhiep99w/docs-kit/code-diff';

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
