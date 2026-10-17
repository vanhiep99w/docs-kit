import { createServer } from 'node:http';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { D2 } from '@d2lang/d2';
import { renderDiagram } from '../../dist/d2/render.mjs';

const out = new URL('../../.cache/browser/', import.meta.url);
await rm(out, { recursive: true, force: true }); await mkdir(out, { recursive: true });
await build({ entryPoints: ['tests/browser/app.tsx'], outfile: new URL('app-server.mjs', out).pathname, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic' });
await build({ entryPoints: ['tests/browser/client.tsx'], outdir: out.pathname, bundle: true, splitting: true, platform: 'browser', format: 'esm', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' } });
const { App } = await import(new URL('app-server.mjs', out).href);
const d2 = new D2();
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="250" viewBox="0 0 1200 250"><a href="?source=demo&amp;file=src/main.ts"><rect x="20" y="20" width="300" height="100" fill="#c4dbec"/><text x="40" y="65">Open implementation</text></a><rect x="600" y="20" width="300" height="100" fill="#d5e4cf"/><text x="620" y="65">Database</text></svg>';
const source = `api: "API" {link: "layers.detail"}
api -> db: Read {style.animated: true}
steps: { update: {db: "Uncommitted 0"}; rollback: {db: "Restored 10M"} }
scenarios: { committed: {db: "Read committed"} }
layers: {detail: {handler: Handler; handler -> storage; handler.link: _}}`;
const data = {};
for (const mode of ['steps', 'tabs', 'explorer', 'animation']) {
  const rendered = await renderDiagram(d2, { source, salt: 'browser-' + mode, options: { mode, interval: 300 } });
  data[mode] = { ...rendered, id: 'demo', caption: 'Transaction walkthrough', source, mode, interval: 300 };
}
await d2.dispose();
data.static = { id: 'demo', caption: 'Architecture overview', lightSvg: svg, darkSvg: svg.replace('#c4dbec', '#7195b1'), source: 'api -> db' };
const css = await readFile(new URL('../../dist/styles/d2.css', import.meta.url), 'utf8');
const sourceCss = await readFile(new URL('../../dist/styles/source-explorer.css', import.meta.url), 'utf8');
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.endsWith('.js')) {
    try { res.setHeader('content-type', 'text/javascript'); res.end(await readFile(new URL(url.pathname.slice(1), out))); }
    catch { res.writeHead(404); res.end(); }
    return;
  }
  if (url.pathname === '/manifest.json') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify([{ id: 'demo', title: 'Demo project', defaultSnapshot: 'v1', snapshots: [{ id: 'v1', title: 'v1', asset: '/snapshot.json' }] }])); return; }
  if (url.pathname === '/snapshot.json') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ project: 'demo', snapshot: 'v1', defaultFile: 'src/main.ts', files: [{ path: 'src/main.ts', language: 'ts', code: 'export const demo = 1;', html: '<pre><code><span class="line">export const demo = 1;</span></code></pre>', regions: {} }] })); return; }
  const props = data[url.searchParams.get('case') ?? 'static'] ?? data.static;
  res.setHeader('content-type', 'text/html;charset=utf-8');
  res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Georgia,serif;margin:0;background:#f8fafc;color:#243346}main{max-width:900px;margin:3rem auto;padding:1rem}body.dark{background:#18202b;color:#dce3ed}' + css + sourceCss + '</style></head><body><div id="root">' + renderToString(createElement(App, { data: props })) + '</div><script id="data" type="application/json">' + JSON.stringify(props).replaceAll('<', '\\u003c') + '</script><script type="module" src="/client.js"></script></body></html>');
});
server.listen(4178, '127.0.0.1', () => console.log('Browser fixtures ready'));
