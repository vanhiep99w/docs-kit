import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readSourceURL, writeSourceURL } from '@vanhiep99w/docs-kit/source-explorer';
import { SourceExplorerProvider, SourceRef } from '@vanhiep99w/docs-kit/components/source-explorer';

test('source URLs round-trip without mutating the original or losing unrelated state', () => {
  const original = new URL('https://docs.test/page?keep=yes&source=old&region=stale#heading');
  const request = { project: 'demo', snapshot: 'basic', file: 'src/main.tsx', lines: '1-4' };
  const next = writeSourceURL(original, request);
  assert.deepEqual(readSourceURL(next), { ...request, region: undefined });
  assert.equal(next.searchParams.get('keep'), 'yes');
  assert.equal(next.hash, '#heading');
  assert.equal(original.searchParams.get('source'), 'old');
  assert.equal(writeSourceURL(next, null).href, 'https://docs.test/page?keep=yes#heading');
  assert.equal(readSourceURL(new URL('https://docs.test/?source=')), null);
});

test('provider and references render on a server without Next.js or browser globals', () => {
  const html = renderToStaticMarkup(createElement(SourceExplorerProvider, { manifestUrl: '/custom/manifest.json' },
    createElement(SourceRef, { project: 'demo', file: 'src/main.tsx', region: 'entry', variant: 'button' }, 'Open source')));
  assert.match(html, /source-ref--button/);
  assert.match(html, /href="\?source=demo&amp;file=src%2Fmain.tsx&amp;region=entry"/);
  assert.match(html, /Open source/);
  assert.doesNotMatch(html, /source-drawer|source-launcher/);
});

test('client boundary, lazy drawer and styles survive the package build', async () => {
  for (const file of ['index.js', 'provider.js', 'explorer.js']) {
    const code = await readFile(new URL(`../dist/components/source-explorer/${file}`, import.meta.url), 'utf8');
    assert.match(code, /^['"]use client['"]/);
    assert.doesNotMatch(code, /from ['"]next\//);
    if (file === 'provider.js') assert.match(code, /lazy\(\(\) => import\('\.\/explorer\.js'\)\)/);
  }
  const css = await readFile(new URL('../dist/styles/source-explorer.css', import.meta.url), 'utf8');
  assert.match(css, /\.source-sr-only/);
  assert.doesNotMatch(css, /#nd-docs-layout/);
  const integration = await readFile(new URL('../dist/styles/source-explorer-fumadocs.css', import.meta.url), 'utf8');
  assert.match(integration, /#nd-docs-layout/);
});
