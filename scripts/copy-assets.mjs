import { cp, mkdir } from 'node:fs/promises';

for (const file of ['d2/render.mjs', 'd2/pool-server.mjs', 'd2/pool-worker.mjs', 'styles/d2.css', 'styles/source-explorer.css', 'styles/source-explorer-fumadocs.css', 'styles/terminal-session.css', 'styles/code-diff.css', 'styles/protocol-exchange.css', 'styles/span-waterfall.css', 'styles/concurrency-lanes.css', 'styles/code-walkthrough.css']) {
  const target = new URL(`../dist/${file}`, import.meta.url);
  await mkdir(new URL('.', target), { recursive: true });
  await cp(new URL(`../src/${file}`, import.meta.url), target);
}
