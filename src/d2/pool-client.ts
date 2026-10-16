import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import lockfile from 'proper-lockfile';

export interface PoolOptions {
  cacheDir: string;
  concurrency: number;
  idleTimeoutMs?: number;
  jobTimeoutMs?: number;
  /** Internal test hook; not exposed through remarkD2 options. */
  workerFile?: string;
}

export interface PoolStats {
  pid: number;
  concurrency: number;
  active: number;
  queued: number;
  workerPids: number[];
  workersStarted: number;
  completed: number;
  failed: number;
  reusedResults: number;
  retainedResultBytes: number;
  maxObservedWorkerRss: number;
}

const require = createRequire(import.meta.url);
const asset = (name: string) => fileURLToPath(new URL(name, import.meta.url));
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const transportErrors = new Set(['ENOENT', 'ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'D2_POOL_CLOSED']);
const metadata = Promise.all([
  readFile(path.resolve(path.dirname(require.resolve('@d2lang/d2')), '../../package.json'), 'utf8'),
  ...['render.mjs', 'pool-client.js', 'pool-server.mjs', 'pool-worker.mjs'].map((file) => readFile(asset(file), 'utf8')),
]).then(([manifest, renderer, ...pool]) => {
  const sdk = JSON.parse(manifest).version;
  return { engine: hash(JSON.stringify([sdk, renderer])), pool: hash(JSON.stringify([sdk, renderer, ...pool])) };
});

/** Stable across checkout locations; changes when the renderer/SDK changes. */
export async function getEngineFingerprint(): Promise<string> {
  return (await metadata).engine;
}

async function identity(options: PoolOptions) {
  const idleTimeoutMs = options.idleTimeoutMs ?? 30_000;
  const jobTimeoutMs = options.jobTimeoutMs ?? 60_000;
  const key = hash(JSON.stringify([path.resolve(options.cacheDir), options.concurrency,
    idleTimeoutMs, jobTimeoutMs, options.workerFile ?? '', (await metadata).pool])).slice(0, 24);
  // Runtime sockets/leases must not be restored from a CI artifact cache.
  const directory = path.join(os.tmpdir(), `docs-kit-d2-${process.getuid?.() ?? 'user'}`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  return {
    directory,
    endpoint: process.platform === 'win32' ? `\\\\.\\pipe\\docs-kit-d2-${key}` : path.join(directory, `${key}.sock`),
    lock: path.join(directory, `${key}-startup`),
    log: path.join(directory, `${key}.log`),
    concurrency: options.concurrency,
    idleTimeoutMs,
    jobTimeoutMs,
    workerFile: options.workerFile,
  };
}

function request<T>(endpoint: string, payload: object, timeoutMs = 600_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(endpoint);
    socket.setEncoding('utf8');
    let input = '';
    let bytes = 0;
    let settled = false;
    const finish = (error?: Error, value?: T) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(value as T);
    };
    socket.setTimeout(timeoutMs, () => finish(new Error('D2 pool response timed out.')));
    socket.on('connect', () => socket.write(JSON.stringify(payload) + '\n'));
    socket.on('error', (error) => finish(error));
    socket.on('close', () => {
      if (!settled) finish(Object.assign(new Error('D2 pool closed before sending a result.'), { code: 'D2_POOL_CLOSED' }));
    });
    socket.on('data', (chunk: string) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > 32 * 1024 * 1024) { finish(new Error('D2 pool response exceeds 32 MB.')); return; }
      input += chunk;
      const end = input.indexOf('\n');
      if (end === -1) return;
      try {
        const response = JSON.parse(input.slice(0, end));
        if (!response.ok) finish(new Error(response.error || 'D2 pool render failed.'));
        else finish(undefined, response.result);
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });
}

async function ping(endpoint: string): Promise<boolean> {
  try { await request(endpoint, { type: 'ping' }, 5_000); return true; }
  catch (error) {
    if (transportErrors.has((error as NodeJS.ErrnoException).code ?? '')) return false;
    throw error;
  }
}

const starting = new Map<string, Promise<string>>();

async function ensurePool(options: PoolOptions): Promise<string> {
  const config = await identity(options);
  const existing = starting.get(config.endpoint);
  if (existing) return existing;
  const task = startPool(config);
  starting.set(config.endpoint, task);
  try { return await task; }
  finally { starting.delete(config.endpoint); }
}

async function startPool(config: Awaited<ReturnType<typeof identity>>): Promise<string> {
  if (await ping(config.endpoint)) return config.endpoint;
  const release = await lockfile.lock(config.lock, {
    realpath: false, stale: 30_000, update: 5_000,
    retries: { retries: 150, minTimeout: 50, maxTimeout: 100, factor: 1 },
  });
  try {
    if (await ping(config.endpoint)) return config.endpoint;
    if (process.platform !== 'win32') await unlink(config.endpoint).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
    const log = await open(config.log, 'a', 0o600);
    let spawnError: Error | undefined;
    let exitCode: number | null | undefined;
    try {
      const child = spawn(process.execPath, [asset('pool-server.mjs'), JSON.stringify(config)], {
        detached: true, stdio: ['ignore', log.fd, log.fd],
      });
      child.once('error', (error) => { spawnError = error; });
      child.once('exit', (code) => { exitCode = code; });
      child.unref();
    } finally {
      await log.close();
    }
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (exitCode !== undefined) throw new Error(`D2 pool failed to start (${exitCode}); see ${config.log}`);
      if (await ping(config.endpoint)) return config.endpoint;
      await delay(50);
    }
    throw new Error(`D2 pool startup timed out; see ${config.log}`);
  } finally {
    await release();
  }
}

export async function renderWithPool<T>(key: string, payload: object, options: PoolOptions): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const endpoint = await ensurePool(options);
    try { return await request<T>(endpoint, { type: 'render', key, payload }); }
    catch (error) {
      if (attempt || !transportErrors.has((error as NodeJS.ErrnoException).code ?? '')) throw error;
      // An idle broker can close between ping and render. SVG generation is
      // side-effect-free, so retry this transport race once, never syntax errors.
    }
  }
}

/** Observe a running pool without starting or warming one. */
export async function peekPoolStats(options: PoolOptions): Promise<PoolStats | undefined> {
  const config = await identity(options);
  try { return await request(config.endpoint, { type: 'ping' }, 5_000); }
  catch (error) {
    if (!transportErrors.has((error as NodeJS.ErrnoException).code ?? '')) throw error;
  }
}

/** Internal diagnostics/lifecycle helpers used by tests and benchmarks. */
export async function getPoolStats(options: PoolOptions): Promise<PoolStats> {
  return request(await ensurePool(options), { type: 'ping' });
}

export async function shutdownPool(options: PoolOptions): Promise<void> {
  const config = await identity(options);
  try { await request(config.endpoint, { type: 'shutdown' }, 5_000); }
  catch (error) {
    if (!transportErrors.has((error as NodeJS.ErrnoException).code ?? '')) throw error;
  }
}
