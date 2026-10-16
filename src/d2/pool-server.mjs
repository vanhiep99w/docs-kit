import net from 'node:net';
import { fork } from 'node:child_process';
import { chmod, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const config = JSON.parse(process.argv[2]);
const maxMessageBytes = 32 * 1024 * 1024;
const workerFile = config.workerFile ?? fileURLToPath(new URL('./pool-worker.mjs', import.meta.url));
const workers = Array.from({ length: config.concurrency }, () => ({ child: null, ready: false, job: null, rss: 0 }));
const queue = [];
const jobs = new Map();
const sockets = new Set();
// Cover the brief gap between a completed render and clients committing their
// disk caches. Bound this burst cache so large SVGs cannot retain unbounded RAM.
const recent = new Map();
let retainedBytes = 0;
const counters = { workersStarted: 0, completed: 0, failed: 0, reusedResults: 0, maxObservedWorkerRss: 0 };
let sequence = 0;
let stopping = false;
let idleTimer;

function send(socket, message) {
  if (!socket.destroyed) socket.end(JSON.stringify(message) + '\n');
}

function trimRecent() {
  for (const [key, entry] of recent) {
    if (entry.expires <= Date.now()) { recent.delete(key); retainedBytes -= entry.bytes; }
  }
  while (recent.size > 32 || retainedBytes > 8 * 1024 * 1024) {
    const [key, entry] = recent.entries().next().value;
    recent.delete(key);
    retainedBytes -= entry.bytes;
  }
}

function scheduleIdleShutdown() {
  clearTimeout(idleTimer);
  if (!jobs.size && !stopping) idleTimer = setTimeout(() => shutdown(), config.idleTimeoutMs);
}

function finish(slot, ok, value) {
  const job = slot.job;
  if (!job) return;
  clearTimeout(job.timer);
  slot.job = null;
  jobs.delete(job.key);
  counters[ok ? 'completed' : 'failed']++;
  const frame = JSON.stringify(ok ? { ok: true, result: value } : { ok: false, error: value }) + '\n';
  if (ok) {
    const bytes = Buffer.byteLength(frame);
    if (bytes <= 8 * 1024 * 1024) {
      recent.set(job.key, { frame, bytes, expires: Date.now() + 5_000 });
      retainedBytes += bytes;
      trimRecent();
    }
  }
  for (const socket of job.clients) {
    if (!socket.destroyed) socket.end(frame);
  }
  scheduleIdleShutdown();
}

function startWorker(slot) {
  const child = fork(workerFile, [], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], execArgv: [] });
  slot.child = child;
  slot.ready = false;
  counters.workersStarted++;
  let stderr = '';
  let timeoutError;
  let initialized = false;
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4096); });
  const bootTimer = setTimeout(() => {
    timeoutError = 'D2 worker initialization timed out.';
    child.kill('SIGKILL');
  }, Math.max(config.jobTimeoutMs, 10_000));
  child.on('message', (message) => {
    if (slot.child !== child) return;
    if (message?.type === 'ready') {
      clearTimeout(bootTimer);
      slot.ready = true;
      initialized = true;
      dispatch();
    } else if (message?.type === 'startup-error') {
      timeoutError = message.error;
    } else if (message?.type === 'result' && slot.job?.id === message.id) {
      slot.rss = message.rss ?? slot.rss;
      counters.maxObservedWorkerRss = Math.max(counters.maxObservedWorkerRss,
        workers.reduce((sum, worker) => sum + worker.rss, 0));
      finish(slot, message.ok, message.ok ? message.result : message.error);
      dispatch();
    }
  });
  function exited(code, signal) {
    clearTimeout(bootTimer);
    if (slot.child !== child) return;
    slot.child = null;
    slot.ready = false;
    slot.rss = 0;
    if (slot.job) finish(slot, false, timeoutError || stderr || `D2 worker exited (${signal ?? code}).`);
    // A boot failure has no assigned job. Reject one queued job instead of
    // endlessly respawning a broken SDK while every client waits forever.
    else if (!initialized && !stopping && queue.length) {
      slot.job = queue.shift();
      finish(slot, false, timeoutError || stderr || `D2 worker failed to initialize (${signal ?? code}).`);
    }
    if (!stopping) dispatch();
  }
  child.on('error', (error) => { timeoutError = error.message; exited(null, 'spawn error'); });
  child.on('exit', exited);
}

function dispatch() {
  if (stopping) return;
  for (const slot of workers) {
    while (queue.length && !queue[0].clients.size) {
      jobs.delete(queue.shift().key);
    }
    if (!queue.length) break;
    if (!slot.child) { startWorker(slot); continue; }
    if (!slot.ready || slot.job) continue;
    const job = queue.shift();
    slot.job = job;
    job.id = ++sequence;
    job.timer = setTimeout(() => {
      finish(slot, false, 'D2 render timed out. The worker will restart for the next diagram.');
      slot.ready = false;
      slot.child?.kill('SIGKILL');
    }, config.jobTimeoutMs);
    slot.child.send({ type: 'render', id: job.id, payload: job.payload }, (error) => {
      if (error && slot.job === job) slot.child?.kill('SIGKILL');
    });
  }
  scheduleIdleShutdown();
}

function stats() {
  return {
    pid: process.pid,
    concurrency: config.concurrency,
    active: workers.filter((worker) => worker.job).length,
    queued: queue.length,
    workerPids: workers.map((worker) => worker.child?.pid).filter(Boolean),
    retainedResultBytes: retainedBytes,
    ...counters,
  };
}

async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearTimeout(idleTimer);
  for (const socket of sockets) socket.destroy();
  for (const slot of workers) slot.child?.kill('SIGTERM');
  server.close();
  if (process.platform !== 'win32') await unlink(config.endpoint).catch(() => {});
  process.exit(0); // Also closes IPC children; workers exit on disconnect.
}

const server = net.createServer((socket) => {
  sockets.add(socket);
  socket.setEncoding('utf8');
  socket.on('error', () => {});
  let input = '';
  let size = 0;
  let received = false;
  let job;
  socket.setTimeout(10_000, () => { if (!received) socket.destroy(); });
  socket.on('data', (chunk) => {
    if (received) return;
    size += Buffer.byteLength(chunk);
    if (size > maxMessageBytes) { socket.destroy(); return; }
    input += chunk;
    const end = input.indexOf('\n');
    if (end === -1) return;
    received = true;
    socket.setTimeout(0);
    let request;
    try { request = JSON.parse(input.slice(0, end)); }
    catch { send(socket, { ok: false, error: 'Invalid D2 pool request.' }); return; }
    if (!request || typeof request !== 'object') {
      send(socket, { ok: false, error: 'Invalid D2 pool request.' }); return;
    }
    if (request.type === 'ping') { send(socket, { ok: true, result: stats() }); return; }
    if (request.type === 'shutdown') {
      if (jobs.size) { send(socket, { ok: false, error: 'Cannot stop a busy D2 pool.' }); return; }
      socket.end(JSON.stringify({ ok: true, result: true }) + '\n', () => shutdown());
      return;
    }
    if (request.type !== 'render' || typeof request.key !== 'string' ||
        typeof request.payload?.source !== 'string' || typeof request.payload?.salt !== 'string') {
      send(socket, { ok: false, error: 'Invalid D2 pool job.' }); return;
    }
    trimRecent();
    const cached = recent.get(request.key);
    if (cached) {
      counters.reusedResults++;
      socket.end(cached.frame);
      return;
    }
    clearTimeout(idleTimer);
    job = jobs.get(request.key);
    if (job) { job.clients.add(socket); return; }
    if (jobs.size >= 2048) { send(socket, { ok: false, error: 'D2 pool queue is full.' }); return; }
    job = { key: request.key, payload: request.payload, clients: new Set([socket]) };
    jobs.set(job.key, job);
    queue.push(job);
    dispatch();
  });
  socket.on('close', () => {
    sockets.delete(socket);
    if (job) job.clients.delete(socket);
  });
});
server.on('error', (error) => { console.error(error); process.exit(1); });
server.listen(config.endpoint, async () => {
  if (process.platform !== 'win32') await chmod(config.endpoint, 0o600);
  scheduleIdleShutdown();
});
process.on('SIGTERM', () => shutdown());
process.on('SIGINT', () => shutdown());
