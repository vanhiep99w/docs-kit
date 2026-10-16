import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir, cpus } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderWithPool, getPoolStats, shutdownPool } from '../dist/d2/pool-client.js';

const args = process.argv.slice(2);
const option = (name) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const count = Number(option('--count') ?? 12);
if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error('--count must be 1..100.');
const jobs = [];
const docs = option('--docs');
if (docs) {
  for (const file of (await readdir(docs, { recursive: true })).filter((file) => file.endsWith('.mdx')).sort()) {
    const source = await readFile(path.join(docs, file), 'utf8');
    for (const match of source.matchAll(/^```d2[^\n]*\n([\s\S]*?)^```/gm)) {
      jobs.push({ source: match[1].replace(/\n$/, ''), salt: `benchmark-${jobs.length}` });
      if (jobs.length === count) break;
    }
    if (jobs.length === count) break;
  }
} else {
  for (let index = 0; index < count; index++) jobs.push({
    source: `direction: right\na: "Component ${index}"\nb: "Cập nhật state"\nc: "Render template"\na -> b -> c`,
    salt: `benchmark-${index}`,
  });
}
assert.ok(jobs.length, 'No D2 fences found.');
const directory = await mkdtemp(path.join(tmpdir(), 'docs-kit-benchmark-'));
const options = { cacheDir: directory, concurrency: 1 };
const renderer = fileURLToPath(new URL('../dist/d2/render.mjs', import.meta.url));
function oneShot(input) {
  return new Promise((resolve, reject) => {
    const child = execFile(process.execPath, [renderer], { timeout: 60_000, maxBuffer: 32 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) return reject(new Error(stderr || error.message));
        try { resolve(JSON.parse(stdout)); } catch (error) { reject(error); }
      });
    child.stdin.on('error', reject);
    child.stdin.end(JSON.stringify(input));
  });
}
try {
  let start = performance.now();
  const baseline = [];
  for (const job of jobs) baseline.push(await oneShot(job));
  const baselineMs = performance.now() - start;
  start = performance.now();
  for (const [index, job] of jobs.entries()) {
    const result = await renderWithPool(`benchmark-${index}`, job, options);
    assert.equal(result.lightSvg, baseline[index].lightSvg, 'Light SVG changed.');
    assert.equal(result.darkSvg, baseline[index].darkSvg, 'Dark SVG changed.');
  }
  const poolMs = performance.now() - start;
  const stats = await getPoolStats(options);
  console.log(JSON.stringify({
    node: process.version,
    cpu: cpus()[0]?.model,
    diagrams: jobs.length,
    diskCache: false,
    concurrency: 1,
    oneShotSeconds: +(baselineMs / 1000).toFixed(2),
    poolSeconds: +(poolMs / 1000).toFixed(2),
    speedup: +(baselineMs / poolMs).toFixed(2),
    identicalSvg: true,
    stats,
    note: 'Local measurement, not a Cloudflare runtime guarantee. RSS is sampled after jobs, not an exact peak.',
  }, null, 2));
} finally {
  await shutdownPool(options);
  await rm(directory, { recursive: true, force: true });
}
