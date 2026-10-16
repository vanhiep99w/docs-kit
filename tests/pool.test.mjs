import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { after, test } from 'node:test';
import { getPoolStats, renderWithPool, shutdownPool } from '../dist/d2/pool-client.js';

const execute = promisify(execFile);
const directory = await mkdtemp(path.join(os.tmpdir(), 'docs-kit-pools-'));
const fixture = fileURLToPath(new URL('./fixtures/pool-worker.mjs', import.meta.url));
const pools = [];
function pool(name, extra = {}) {
  const options = { cacheDir: path.join(directory, name), concurrency: 1, workerFile: fixture, ...extra };
  pools.push(options);
  return options;
}
const render = (key, source, options) => renderWithPool(key, { source, salt: key }, options);
after(async () => {
  await Promise.all(pools.map((options) => shutdownPool(options)));
  await rm(directory, { recursive: true, force: true });
});

test('reuses one worker and deduplicates concurrent identical jobs', async () => {
  const options = pool('reuse');
  const values = await Promise.all(Array.from({ length: 10 }, () => render('same', 'slow-same', options)));
  assert.ok(values.every((value) => value.pid === values[0].pid));
  let stats = await getPoolStats(options);
  assert.equal(stats.workersStarted, 1);
  assert.equal(stats.completed, 1);
  const next = await render('next', 'next', options);
  assert.equal(next.pid, values[0].pid);
  stats = await getPoolStats(options);
  assert.equal(stats.completed, 2);
  assert.equal(stats.active, 0);
});

test('preserves UTF-8 text across chunked socket messages', async () => {
  const options = pool('unicode');
  const source = 'Tiếng Việt: dữ liệu · 中文 · 🔁\n'.repeat(8192);
  assert.equal((await render('unicode', source, options)).source, source);
});

test('bounds the short-lived completed-result cache', async () => {
  const options = pool('bounded-cache');
  for (let index = 0; index < 10; index++) {
    const value = await render(`large-${index}`, `large-${index}`, options);
    assert.equal(value.data.length, 1024 * 1024);
  }
  assert.ok((await getPoolStats(options)).retainedResultBytes <= 8 * 1024 * 1024);
});

test('shares the same bounded pool between independent Node/MDX processes', async () => {
  const options = pool('processes', { concurrency: 2 });
  const client = fileURLToPath(new URL('./fixtures/pool-client.mjs', import.meta.url));
  const results = await Promise.all(['one', 'two', 'three'].map((prefix) =>
    execute(process.execPath, [client, JSON.stringify(options), prefix], { timeout: 30_000 })));
  const pids = new Set(results.flatMap(({ stdout }) => JSON.parse(stdout)).map((value) => value.pid));
  assert.equal(pids.size, 2);
  const stats = await getPoolStats(options);
  assert.equal(stats.workersStarted, 2);
  assert.equal(stats.completed, 12);
  assert.equal(stats.active, 0);
  assert.equal(stats.queued, 0);
});

test('rejects a crashed job and recovers for queued and later jobs', async () => {
  const options = pool('crash');
  await getPoolStats(options);
  const results = await Promise.allSettled([
    render('crashed', 'crash', options), render('queued', 'queued', options),
  ]);
  assert.equal(results[0].status, 'rejected');
  assert.match(results[0].reason.message, /worker exited/);
  assert.equal(results[1].status, 'fulfilled');
  assert.equal((await render('later', 'later', options)).source, 'later');
  const stats = await getPoolStats(options);
  assert.equal(stats.failed, 1);
  assert.equal(stats.completed, 2);
  assert.equal(stats.workersStarted, 2);
});

test('times out a stuck job without dropping the next queued job', async () => {
  const options = pool('timeout', { jobTimeoutMs: 500 });
  const results = await Promise.allSettled([
    render('hung', 'hang', options), render('next', 'next', options),
  ]);
  assert.equal(results[0].status, 'rejected');
  assert.match(results[0].reason.message, /timed out/);
  assert.equal(results[1].status, 'fulfilled');
  const stats = await getPoolStats(options);
  assert.equal(stats.failed, 1);
  assert.equal(stats.completed, 1);
});

test('fails queued jobs cleanly when a worker cannot initialize', async () => {
  const options = pool('bad-worker', { workerFile: path.join(directory, 'missing-worker.mjs') });
  const results = await Promise.allSettled([
    render('first', 'first', options), render('second', 'second', options),
  ]);
  assert.ok(results.every((result) => result.status === 'rejected'));
  const stats = await getPoolStats(options);
  assert.equal(stats.failed, 2);
  assert.equal(stats.active, 0);
  assert.equal(stats.queued, 0);
});

test('restarts after an idle shutdown', async () => {
  const options = pool('idle', { idleTimeoutMs: 1000 });
  await render('first', 'first', options);
  const first = await getPoolStats(options);
  await delay(1800);
  const second = await getPoolStats(options);
  assert.notEqual(second.pid, first.pid);
  assert.equal(second.workersStarted, 0);
});

test('recovers a stale socket after the broker is killed', async () => {
  const options = pool('broker-crash');
  await render('before', 'before', options);
  const first = await getPoolStats(options);
  process.kill(first.pid, 'SIGKILL');
  await delay(100);
  assert.equal((await render('after', 'after', options)).source, 'after');
  const second = await getPoolStats(options);
  assert.notEqual(second.pid, first.pid);
  assert.equal(second.workersStarted, 1);
});
