import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(), 'docs-kit-pack-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
try {
  const { stdout } = await execute(npm, ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], {
    cwd: root, maxBuffer: 5 * 1024 * 1024,
  });
  const [packed] = JSON.parse(stdout);
  const names = new Set(packed.files.map((file) => file.path));
  for (const required of ['LICENSE', 'dist/d2/index.js', 'dist/d2/index.d.ts', 'dist/d2/render.mjs',
    'dist/d2/pool-client.js', 'dist/d2/pool-server.mjs', 'dist/d2/pool-worker.mjs',
    'dist/components/d2.js', 'dist/components/d2.d.ts', 'dist/styles/d2.css',
    'dist/components/source-explorer/index.js', 'dist/components/source-explorer/index.d.ts',
    'dist/components/source-explorer/provider.js', 'dist/components/source-explorer/explorer.js',
    'dist/source-explorer/index.js', 'dist/source-explorer/index.d.ts',
    'dist/styles/source-explorer.css', 'dist/styles/source-explorer-fumadocs.css']) {
    assert.ok(names.has(required), `Missing packed file: ${required}`);
  }
  const consumer = path.join(temporary, 'consumer');
  await mkdir(path.join(consumer, 'workdir'), { recursive: true });
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  await writeFile(path.join(consumer, 'package.json'), JSON.stringify({
    private: true,
    type: 'module',
    dependencies: {
      '@vanhiep99w/docs-kit': `file:${path.join(temporary, packed.filename)}`,
      '@mdx-js/mdx': manifest.devDependencies['@mdx-js/mdx'],
      react: manifest.devDependencies.react,
      'react-dom': manifest.devDependencies['react-dom'],
    },
  }));
  // A real installation outside this repository catches unpublished assets,
  // undeclared dependencies, symlink-only successes and host-relative paths.
  await execute(npm, ['install', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: consumer, timeout: 180_000, maxBuffer: 5 * 1024 * 1024,
  });
  await writeFile(path.join(consumer, 'check.mjs'), String.raw`
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { compile } from '@mdx-js/mdx';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { SourceExplorerProvider, SourceRef } from '@vanhiep99w/docs-kit/components/source-explorer';
import { readSourceURL, writeSourceURL } from '@vanhiep99w/docs-kit/source-explorer';
import { remarkD2 } from '@vanhiep99w/docs-kit/d2';
import { D2Diagram } from '@vanhiep99w/docs-kit/components/d2';
process.chdir(fileURLToPath(new URL('./workdir', import.meta.url)));
const fence = String.fromCharCode(96).repeat(3);
for (const layout of ['elk', 'dagre', 'tala']) {
  const result = await compile({value: fence + 'd2 title="Packed package"\na -> b\n' + fence, path:'page.mdx'}, {
    remarkPlugins: [[remarkD2, { layout }]],
  });
  assert.match(String(result), /D2Diagram/);
  assert.match(String(result), /<svg/);
  const body = fence + 'd2 title="Packed package"\na -> b\n' + fence;
  const perPage = await compile({value: '---\nd2Layout: ' + layout + '\n---\n\n' + body, path:'page.mdx'}, {
    remarkPlugins: [[remarkD2, { layout: 'elk' }]],
  });
  assert.equal(String(perPage), String(result));
  const perBlock = await compile({value: '---\nd2Layout: elk\n---\n\n' +
    fence + 'd2 layout="' + layout + '" title="Packed package"\na -> b\n' + fence, path:'page.mdx'}, {
    remarkPlugins: [remarkD2],
  });
  assert.equal(String(perBlock), String(result));
}
const markup = renderToStaticMarkup(D2Diagram({id:'test',caption:'Packed package',lightSvg:'<svg/>',darkSvg:'<svg/>'}));
assert.match(markup, /test-caption/);
const css = await readFile(new URL(import.meta.resolve('@vanhiep99w/docs-kit/styles/d2.css')), 'utf8');
assert.match(css, /\.d2-diagram/);
const sourceMarkup = renderToStaticMarkup(createElement(SourceExplorerProvider, null,
  createElement(SourceRef, {project:'demo',file:'src/main.tsx'}, 'Open source')));
assert.match(sourceMarkup, /source-ref/);
assert.match(sourceMarkup, /file=src%2Fmain.tsx/);
assert.equal(readSourceURL(writeSourceURL(new URL('https://docs.test/'), {project:'demo'})).project, 'demo');
const sourceCss = await readFile(new URL(import.meta.resolve('@vanhiep99w/docs-kit/styles/source-explorer.css')), 'utf8');
assert.match(sourceCss, /\.source-drawer/);
const layoutCss = await readFile(new URL(import.meta.resolve('@vanhiep99w/docs-kit/styles/source-explorer-fumadocs.css')), 'utf8');
assert.match(layoutCss, /#nd-docs-layout/);
console.log('Packed package works from an isolated consumer.');
`);
  const result = await execute(process.execPath, [path.join(consumer, 'check.mjs')], {
    cwd: consumer, timeout: 90_000, maxBuffer: 5 * 1024 * 1024,
  });
  process.stdout.write(result.stdout);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
