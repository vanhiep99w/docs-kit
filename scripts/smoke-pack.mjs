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
    'dist/components/d2.js', 'dist/components/d2.d.ts', 'dist/styles/d2.css']) {
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
import { remarkD2 } from '@vanhiep99w/docs-kit/d2';
import { D2Diagram } from '@vanhiep99w/docs-kit/components/d2';
process.chdir(fileURLToPath(new URL('./workdir', import.meta.url)));
const fence = String.fromCharCode(96).repeat(3);
const result = await compile({value: fence + 'd2 title="Packed package"\na -> b\n' + fence, path:'page.mdx'}, {
  remarkPlugins: [remarkD2],
});
assert.match(String(result), /D2Diagram/);
assert.match(String(result), /<svg/);
const markup = renderToStaticMarkup(D2Diagram({id:'test',caption:'Packed package',lightSvg:'<svg/>',darkSvg:'<svg/>'}));
assert.match(markup, /test-caption/);
const css = await readFile(new URL(import.meta.resolve('@vanhiep99w/docs-kit/styles/d2.css')), 'utf8');
assert.match(css, /\.d2-diagram/);
console.log('Packed package works from an isolated consumer.');
`);
  const result = await execute(process.execPath, [path.join(consumer, 'check.mjs')], {
    cwd: consumer, timeout: 90_000, maxBuffer: 5 * 1024 * 1024,
  });
  process.stdout.write(result.stdout);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
