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
    'dist/components/live-demo.js', 'dist/components/live-demo.d.ts', 'dist/styles/live-demo.css', 'docs/live-demo.md',
    'dist/components/d2-interactive.js', 'dist/components/d2-interactive.d.ts', 'dist/components/d2-viewer.js',
    'dist/components/d2-types.d.ts', 'dist/d2/resources.js', 'dist/d2/resources.d.ts',
    'docs/d2.md', 'examples/d2/transaction.d2', 'examples/d2/sequence-groups.d2',
    'dist/components/copy-icon.js', 'dist/components/copy-icon.d.ts', 'docs/compact-ui.md', 'examples/terminal-session/rollback.mdx',
    'docs/code-walkthrough.md', 'examples/code-walkthrough/walkthrough-guard.mdx', 'examples/code-walkthrough/walkthrough-dockerfile.mdx',
    'dist/code-walkthrough/index.js', 'dist/code-walkthrough/index.d.ts',
    'dist/code-walkthrough/data.js', 'dist/code-walkthrough/data.d.ts',
    'dist/components/code-walkthrough.js', 'dist/components/code-walkthrough.d.ts',
    'dist/components/code-walkthrough-source.js', 'dist/components/code-walkthrough-source.d.ts', 'dist/styles/code-walkthrough.css',
    'docs/terminal-session.md', 'examples/terminal-session/kubernetes.mdx',
    'dist/code/annotations.js', 'dist/code/annotations.d.ts', 'dist/mdx/data-element.js',
    'dist/terminal-session/index.js', 'dist/terminal-session/index.d.ts',
    'dist/terminal-session/data.js', 'dist/terminal-session/data.d.ts',
    'dist/components/terminal-session.js', 'dist/components/terminal-session.d.ts',
    'dist/styles/terminal-session.css',
    'dist/code-diff/word-diff.js', 'dist/code-diff/word-diff.d.ts', 'examples/code-diff/split-words.mdx',
    'docs/code-diff.md', 'examples/code-diff/dockerfile.mdx',
    'dist/code-diff/index.js', 'dist/code-diff/index.d.ts', 'dist/code-diff/data.js', 'dist/code-diff/data.d.ts',
    'dist/code-diff/diff.js', 'dist/code/highlight.js', 'dist/code/tokens.js',
    'dist/components/code-diff.js', 'dist/components/code-diff.d.ts',
    'dist/components/code-diff-source.js', 'dist/components/code-diff-source.d.ts', 'dist/styles/code-diff.css',
    'docs/span-waterfall.md', 'examples/span-waterfall/api-cache.mdx', 'examples/span-waterfall/parallel-services.mdx',
    'dist/span-waterfall/index.js', 'dist/span-waterfall/index.d.ts', 'dist/span-waterfall/data.js', 'dist/span-waterfall/data.d.ts',
    'dist/components/span-waterfall.js', 'dist/components/span-waterfall.d.ts', 'dist/styles/span-waterfall.css',
    'docs/protocol-exchange.md', 'examples/protocol-exchange/rest-auth.mdx',
    'dist/protocol-exchange/index.js', 'dist/protocol-exchange/index.d.ts',
    'dist/protocol-exchange/data.js', 'dist/protocol-exchange/data.d.ts',
    'dist/components/protocol-exchange.js', 'dist/components/protocol-exchange.d.ts', 'dist/styles/protocol-exchange.css',
    'dist/components/source-explorer/d2-source-links.js',
    'dist/components/source-explorer/index.js', 'dist/components/source-explorer/index.d.ts',
    'dist/components/source-explorer/provider.js', 'dist/components/source-explorer/explorer.js',
    'dist/source-explorer/index.js', 'dist/source-explorer/index.d.ts',
    'dist/styles/source-explorer.css', 'dist/styles/source-explorer-fumadocs.css']) {
    assert.ok(names.has(required), `Missing packed file: ${required}`);
  }
  for (const file of names) assert.doesNotMatch(file, /annotated-example|data-inspector|marble|state-transition|concurrency-lanes/);
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
import { LiveDemo } from '@vanhiep99w/docs-kit/components/live-demo';
import { SourceExplorerProvider, SourceRef } from '@vanhiep99w/docs-kit/components/source-explorer';
import { readSourceURL, writeSourceURL } from '@vanhiep99w/docs-kit/source-explorer';
import { remarkD2 } from '@vanhiep99w/docs-kit/d2';
import { D2Diagram } from '@vanhiep99w/docs-kit/components/d2';
import { D2InteractiveDiagram } from '@vanhiep99w/docs-kit/components/d2-interactive';
import { prepareCodeWalkthrough, remarkCodeWalkthrough } from '@vanhiep99w/docs-kit/code-walkthrough';
import { validateCodeWalkthrough } from '@vanhiep99w/docs-kit/code-walkthrough/data';
import { CodeWalkthrough } from '@vanhiep99w/docs-kit/components/code-walkthrough';
import { CodeWalkthroughWithSource } from '@vanhiep99w/docs-kit/components/code-walkthrough-source';
import { parseTerminalSession, remarkTerminalSession } from '@vanhiep99w/docs-kit/terminal-session';
import { validateTerminalSession } from '@vanhiep99w/docs-kit/terminal-session/data';
import { TerminalSession } from '@vanhiep99w/docs-kit/components/terminal-session';
import { prepareCodeDiff, remarkCodeDiff } from '@vanhiep99w/docs-kit/code-diff';
import { validatePreparedCodeDiff } from '@vanhiep99w/docs-kit/code-diff/data';
import { CodeDiff } from '@vanhiep99w/docs-kit/components/code-diff';
import { CodeDiffWithSource } from '@vanhiep99w/docs-kit/components/code-diff-source';
import { prepareProtocolExchange, remarkProtocolExchange } from '@vanhiep99w/docs-kit/protocol-exchange';
import { formatProtocolMessage } from '@vanhiep99w/docs-kit/protocol-exchange/data';
import { ProtocolExchange } from '@vanhiep99w/docs-kit/components/protocol-exchange';
import { prepareSpanWaterfall, remarkSpanWaterfall } from '@vanhiep99w/docs-kit/span-waterfall';
import { waterfallRows, validatePreparedSpanWaterfall } from '@vanhiep99w/docs-kit/span-waterfall/data';
import { SpanWaterfall } from '@vanhiep99w/docs-kit/components/span-waterfall';
process.chdir(fileURLToPath(new URL('./workdir', import.meta.url)));
const fence = String.fromCharCode(96).repeat(3);
for (const layout of ['elk', 'dagre', 'tala']) {
  const result = await compile({value: fence + 'd2 title="Packed package"\na -> b\n' + fence, path:'page.mdx'}, {
    remarkPlugins: [[remarkD2, { layout }]],
  });
  assert.match(String(result), /D2InteractiveDiagram/);
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
const sequence = await compile({value: fence + 'd2\nshape: sequence_diagram\na\nb\nfragment: {a -> b: Request}\n' + fence, path:'sequence.mdx'}, {
  remarkPlugins: [remarkD2],
});
assert.match(String(sequence), /data-d2-sequence/);
assert.match(String(sequence), /#64748b/);
assert.match(String(sequence), /#94a3b8/);
const nativeSequence = await compile({value: fence + 'd2 sequenceStyle=native\nshape: sequence_diagram\na\nb\nfragment: {a -> b: Request}\n' + fence, path:'sequence-native.mdx'}, {
  remarkPlugins: [remarkD2],
});
assert.doesNotMatch(String(nativeSequence), /data-d2-sequence/);
const staticDiagram = await compile({value: fence + 'd2 interactive=false\na -> b\n' + fence, path:'static.mdx'}, {
  remarkPlugins: [remarkD2],
});
assert.match(String(staticDiagram), /D2Diagram/);
assert.doesNotMatch(String(staticDiagram), /D2InteractiveDiagram/);
const markup = renderToStaticMarkup(D2Diagram({id:'test',caption:'Packed package',lightSvg:'<svg/>',darkSvg:'<svg/>'}));
assert.match(markup, /test-caption/);
const css = await readFile(new URL(import.meta.resolve('@vanhiep99w/docs-kit/styles/d2.css')), 'utf8');
assert.match(css, /\.d2-diagram/);
const demoMarkup = renderToStaticMarkup(createElement(LiveDemo, {src:'https://demo.test/',title:'Packed demo'}));
assert.match(demoMarkup, /Chạy thử/);
assert.doesNotMatch(demoMarkup, /<iframe/);
assert.match(await readFile(new URL(import.meta.resolve('@vanhiep99w/docs-kit/styles/live-demo.css')), 'utf8'), /\.live-demo/);
const sourceMarkup = renderToStaticMarkup(createElement(SourceExplorerProvider, null,
  createElement(SourceRef, {project:'demo',file:'src/main.tsx'}, 'Open source')));
assert.match(sourceMarkup, /source-ref/);
assert.match(sourceMarkup, /file=src%2Fmain.tsx/);
assert.equal(readSourceURL(writeSourceURL(new URL('https://docs.test/'), {project:'demo'})).project, 'demo');
const sourceCss = await readFile(new URL(import.meta.resolve('@vanhiep99w/docs-kit/styles/source-explorer.css')), 'utf8');
assert.match(sourceCss, /\.source-drawer/);
const layoutCss = await readFile(new URL(import.meta.resolve('@vanhiep99w/docs-kit/styles/source-explorer-fumadocs.css')), 'utf8');
assert.match(layoutCss, /#nd-docs-layout/);
const interactive = await compile({value: fence + 'd2 mode=steps\na: base\nsteps: { next: {a: next} }\n' + fence, path:'steps.mdx'}, {
  remarkPlugins: [remarkD2],
});
assert.match(String(interactive), /D2InteractiveDiagram/);
assert.match(String(interactive), /JSON.parse/);
const interactiveMarkup = renderToStaticMarkup(createElement(D2InteractiveDiagram, {id:'interactive',caption:'Steps',lightSvg:'<svg/>',darkSvg:'<svg/>',source:'a -> b'}));
assert.match(interactiveMarkup, /aria-label="D2 source"/);
assert.doesNotMatch(interactiveMarkup, /Explore diagram/);
const terminalYAML = 'title: Packed terminal\ncontext: {kind: local}\nsteps: [{id: version, command: node --version, outputs: [{stream: stdout, text: example}]}]';
const terminal = parseTerminalSession(terminalYAML);
validateTerminalSession(terminal);
assert.match(renderToStaticMarkup(createElement(TerminalSession, {data: terminal})), /Các bước terminal/);
const terminalMDX = await compile({value: fence + 'terminal-session\n' + terminalYAML + '\n' + fence, path:'terminal.mdx'}, {remarkPlugins:[remarkTerminalSession]});
assert.match(String(terminalMDX), /TerminalSession/);
const terminalCss = await readFile(new URL(import.meta.resolve('@vanhiep99w/docs-kit/styles/terminal-session.css')), 'utf8');
assert.match(terminalCss, /\.terminal-session/);
const diff = await prepareCodeDiff({title:'Packed diff',language:'typescript',before:{code:'const a = 1;'},after:{code:'const a = 2;',source:{project:'demo',snapshot:'v2'}}});
validatePreparedCodeDiff(diff);
assert.match(renderToStaticMarkup(createElement(CodeDiff, {data:diff})), /--code-diff-token-dark/);
assert.match(renderToStaticMarkup(createElement(CodeDiffWithSource, {data:diff})), /source-ref/);
const diffMDX = await compile({value:fence+'code-diff\ntitle: Packed diff\nbefore: {code: before}\nafter: {code: after}\n'+fence,path:'diff.mdx'}, {remarkPlugins:[remarkCodeDiff]});
assert.match(String(diffMDX), /CodeDiff/);
assert.match(await readFile(new URL(import.meta.resolve('@vanhiep99w/docs-kit/styles/code-diff.css')), 'utf8'), /\.code-diff/);
const exchange = prepareProtocolExchange({title:'Packed HTTP',variants:[{id:'ok',title:'OK',request:{method:'GET',url:'/demo'},response:{status:200,body:{kind:'json',json:'{"id":9007199254740993}'}}}]});
assert.match(formatProtocolMessage(exchange.variants[0], 'response'), /9007199254740993/);
assert.match(renderToStaticMarkup(createElement(ProtocolExchange, {data:exchange})), /9007199254740993/);
const exchangeMDX = await compile({value:fence+'protocol-exchange\ntitle: Packed HTTP\nvariants: [{id: a, title: A, request: {method: GET, url: /}, response: {status: 204}}]\n'+fence,path:'exchange.mdx'}, {remarkPlugins:[remarkProtocolExchange]});
assert.match(String(exchangeMDX), /ProtocolExchange/);
const exchangeCssURL = new URL(import.meta.resolve('@vanhiep99w/docs-kit/styles/protocol-exchange.css'));
const trace = prepareSpanWaterfall({title:'Packed trace',unit:'ms',provenance:{kind:'illustrative',description:'Synthetic'},spans:[{id:'r',name:'Root',service:'api',start:0,duration:10,attributes:'{"id":9007199254740993}'}]});
validatePreparedSpanWaterfall(trace);
assert.equal(waterfallRows(trace.spans)[0].depth, 0);
assert.match(renderToStaticMarkup(createElement(SpanWaterfall, {data:trace})), /9007199254740993/);
const traceMDX = await compile({value:fence+'span-waterfall\ntitle: Packed trace\nunit: ms\nprovenance: {kind: illustrative, description: Synthetic}\nspans: [{id: r, name: Root, service: api, start: 0, duration: 10}]\n'+fence,path:'trace.mdx'}, {remarkPlugins:[remarkSpanWaterfall]});
assert.match(String(traceMDX), /SpanWaterfall/);
const traceCssURL = new URL(import.meta.resolve('@vanhiep99w/docs-kit/styles/span-waterfall.css'));
const walkthrough = await prepareCodeWalkthrough({title:'Packed walkthrough',language:'typescript',snapshots:[{id:'a',title:'A',code:'const a = 1;',source:{project:'demo',snapshot:'v0'}}],steps:[{id:'s',snapshot:'a',title:'Step',description:'Text',ranges:[[1,1]]}]});
validateCodeWalkthrough(walkthrough);
assert.match(renderToStaticMarkup(createElement(CodeWalkthrough, {data:walkthrough})), /--walkthrough-token-dark/);
assert.match(renderToStaticMarkup(createElement(CodeWalkthroughWithSource, {data:walkthrough})), /source-ref/);
const walkthroughMDX = await compile({value:fence+'code-walkthrough\ntitle: Packed walkthrough\nsnapshots: [{id: a, title: A, code: hello}]\nsteps: [{id: s, snapshot: a, title: Step, description: Text, ranges: [[1, 1]]}]\n'+fence,path:'walkthrough.mdx'}, {remarkPlugins:[remarkCodeWalkthrough]});
assert.match(String(walkthroughMDX), /CodeWalkthrough/);
const walkthroughCssURL = new URL(import.meta.resolve('@vanhiep99w/docs-kit/styles/code-walkthrough.css'));
const wordDiff = await prepareCodeDiff({title:'Split words',wordDiff:true,view:'split',before:{code:'const retry = 3;'},after:{code:'const retry = 5;'}});
validatePreparedCodeDiff(wordDiff);
assert.ok(wordDiff.rows.some((row) => row.ranges?.length));
const wordMarkup = renderToStaticMarkup(createElement(CodeDiff, {data:wordDiff}));
assert.match(wordMarkup, /data-view="split"/); assert.match(wordMarkup, /data-word-changed="true"/);
console.log('Packed package works from an isolated consumer.');
`);
  const result = await execute(process.execPath, [path.join(consumer, 'check.mjs')], {
    cwd: consumer, timeout: 90_000, maxBuffer: 5 * 1024 * 1024,
  });
  process.stdout.write(result.stdout);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
