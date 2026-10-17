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
    'dist/components/d2-interactive.js', 'dist/components/d2-interactive.d.ts', 'dist/components/d2-viewer.js',
    'dist/components/d2-types.d.ts', 'dist/d2/resources.js', 'dist/d2/resources.d.ts',
    'docs/d2.md', 'examples/d2/transaction.d2',
    'docs/annotated-example.md', 'examples/annotated-example/kubernetes.mdx',
    'dist/annotated-example/index.js', 'dist/annotated-example/index.d.ts',
    'dist/annotated-example/data.js', 'dist/annotated-example/data.d.ts',
    'dist/components/annotated-example.js', 'dist/components/annotated-example.d.ts',
    'dist/components/annotated-example-source.js', 'dist/components/annotated-example-source.d.ts',
    'dist/styles/annotated-example.css',
    'dist/components/copy-icon.js', 'dist/components/copy-icon.d.ts', 'docs/compact-ui.md', 'examples/terminal-session/rollback.mdx',
    'docs/code-walkthrough.md', 'examples/annotated-example/walkthrough-guard.mdx', 'examples/annotated-example/walkthrough-dockerfile.mdx',
    'dist/annotated-example/walkthrough.js', 'dist/annotated-example/walkthrough.d.ts',
    'dist/annotated-example/walkthrough-data.js', 'dist/annotated-example/walkthrough-data.d.ts',
    'dist/components/code-walkthrough.js', 'dist/components/code-walkthrough.d.ts',
    'dist/components/code-walkthrough-source.js', 'dist/components/code-walkthrough-source.d.ts', 'dist/styles/code-walkthrough.css',
    'docs/terminal-session.md', 'examples/terminal-session/kubernetes.mdx',
    'dist/code/annotations.js', 'dist/code/annotations.d.ts', 'dist/mdx/data-element.js',
    'dist/terminal-session/index.js', 'dist/terminal-session/index.d.ts',
    'dist/terminal-session/data.js', 'dist/terminal-session/data.d.ts',
    'dist/components/terminal-session.js', 'dist/components/terminal-session.d.ts',
    'dist/styles/terminal-session.css',
    'dist/components/marble-zoom.js', 'dist/components/marble-zoom.d.ts', 'examples/marble/zoom.mdx',
    'dist/code-diff/word-diff.js', 'dist/code-diff/word-diff.d.ts', 'examples/code-diff/split-words.mdx',
    'docs/marble.md', 'examples/marble/switch-map.mdx',
    'dist/marble/index.js', 'dist/marble/index.d.ts',
    'dist/marble/data.js', 'dist/marble/data.d.ts',
    'dist/components/marble.js', 'dist/components/marble.d.ts', 'dist/styles/marble.css',
    'docs/code-diff.md', 'examples/code-diff/dockerfile.mdx',
    'dist/code-diff/index.js', 'dist/code-diff/index.d.ts', 'dist/code-diff/data.js', 'dist/code-diff/data.d.ts',
    'dist/code-diff/diff.js', 'dist/code/highlight.js', 'dist/code/tokens.js',
    'dist/components/code-diff.js', 'dist/components/code-diff.d.ts',
    'dist/components/code-diff-source.js', 'dist/components/code-diff-source.d.ts', 'dist/styles/code-diff.css',
    'docs/data-inspector.md', 'examples/data-inspector/kafka-event.mdx',
    'dist/data-inspector/index.js', 'dist/data-inspector/index.d.ts', 'dist/data-inspector/data.js', 'dist/data-inspector/data.d.ts',
    'dist/components/data-inspector.js', 'dist/components/data-inspector.d.ts', 'dist/styles/data-inspector.css',
    'docs/state-transition.md', 'examples/state-transition/circuit-breaker.mdx', 'examples/state-transition/form-workflow.mdx',
    'dist/state-transition/index.js', 'dist/state-transition/index.d.ts', 'dist/state-transition/data.js', 'dist/state-transition/data.d.ts',
    'dist/components/state-transition.js', 'dist/components/state-transition.d.ts', 'dist/styles/state-transition.css',
    'docs/concurrency-lanes.md', 'examples/concurrency-lanes/sql-row-lock.mdx', 'examples/concurrency-lanes/java-publication.mdx',
    'dist/concurrency-lanes/index.js', 'dist/concurrency-lanes/index.d.ts', 'dist/concurrency-lanes/data.js', 'dist/concurrency-lanes/data.d.ts',
    'dist/components/concurrency-lanes.js', 'dist/components/concurrency-lanes.d.ts', 'dist/styles/concurrency-lanes.css',
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
import { D2InteractiveDiagram } from '@vanhiep99w/docs-kit/components/d2-interactive';
import { prepareAnnotatedExample, remarkAnnotatedExample } from '@vanhiep99w/docs-kit/annotated-example';
import { validateAnnotatedExample } from '@vanhiep99w/docs-kit/annotated-example/data';
import { AnnotatedExample } from '@vanhiep99w/docs-kit/components/annotated-example';
import { AnnotatedExampleWithSource } from '@vanhiep99w/docs-kit/components/annotated-example-source';
import { prepareCodeWalkthrough, remarkCodeWalkthrough } from '@vanhiep99w/docs-kit/annotated-example/walkthrough';
import { validateCodeWalkthrough, walkthroughExample } from '@vanhiep99w/docs-kit/annotated-example/walkthrough-data';
import { CodeWalkthrough } from '@vanhiep99w/docs-kit/components/code-walkthrough';
import { CodeWalkthroughWithSource } from '@vanhiep99w/docs-kit/components/code-walkthrough-source';
import { parseTerminalSession, remarkTerminalSession } from '@vanhiep99w/docs-kit/terminal-session';
import { validateTerminalSession } from '@vanhiep99w/docs-kit/terminal-session/data';
import { TerminalSession } from '@vanhiep99w/docs-kit/components/terminal-session';
import { parseMarbleDescriptor, remarkMarble } from '@vanhiep99w/docs-kit/marble';
import { parseMarble } from '@vanhiep99w/docs-kit/marble/data';
import { MarbleDiagram } from '@vanhiep99w/docs-kit/components/marble';
import { MarbleZoomDiagram } from '@vanhiep99w/docs-kit/components/marble-zoom';
import { prepareCodeDiff, remarkCodeDiff } from '@vanhiep99w/docs-kit/code-diff';
import { validatePreparedCodeDiff } from '@vanhiep99w/docs-kit/code-diff/data';
import { CodeDiff } from '@vanhiep99w/docs-kit/components/code-diff';
import { CodeDiffWithSource } from '@vanhiep99w/docs-kit/components/code-diff-source';
import { prepareDataInspector, remarkDataInspector } from '@vanhiep99w/docs-kit/data-inspector';
import { inspectorValue } from '@vanhiep99w/docs-kit/data-inspector/data';
import { DataInspector } from '@vanhiep99w/docs-kit/components/data-inspector';
import { prepareProtocolExchange, remarkProtocolExchange } from '@vanhiep99w/docs-kit/protocol-exchange';
import { formatProtocolMessage } from '@vanhiep99w/docs-kit/protocol-exchange/data';
import { ProtocolExchange } from '@vanhiep99w/docs-kit/components/protocol-exchange';
import { prepareSpanWaterfall, remarkSpanWaterfall } from '@vanhiep99w/docs-kit/span-waterfall';
import { waterfallRows, validatePreparedSpanWaterfall } from '@vanhiep99w/docs-kit/span-waterfall/data';
import { SpanWaterfall } from '@vanhiep99w/docs-kit/components/span-waterfall';
import { parseConcurrencyLanesDescriptor, remarkConcurrencyLanes } from '@vanhiep99w/docs-kit/concurrency-lanes';
import { validateConcurrencyLanes, layoutConcurrencyLanes } from '@vanhiep99w/docs-kit/concurrency-lanes/data';
import { ConcurrencyLanes } from '@vanhiep99w/docs-kit/components/concurrency-lanes';
import { parseStateTransitionDescriptor, remarkStateTransition } from '@vanhiep99w/docs-kit/state-transition';
import { validateStateTransition, traceStateTransitions } from '@vanhiep99w/docs-kit/state-transition/data';
import { StateTransitionExplorer } from '@vanhiep99w/docs-kit/components/state-transition';
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
const interactive = await compile({value: fence + 'd2 mode=steps\na: base\nsteps: { next: {a: next} }\n' + fence, path:'steps.mdx'}, {
  remarkPlugins: [remarkD2],
});
assert.match(String(interactive), /D2InteractiveDiagram/);
assert.match(String(interactive), /JSON.parse/);
assert.match(renderToStaticMarkup(createElement(D2InteractiveDiagram, {id:'interactive',caption:'Steps',lightSvg:'<svg/>',darkSvg:'<svg/>',source:'a -> b'})), /Explore diagram/);
const annotated = await prepareAnnotatedExample({title:'Packed example', language:'sql', code:'SELECT 1;', annotations:[{id:'query',title:'Query',description:'One row',ranges:[[1,1]]}]});
validateAnnotatedExample(annotated);
assert.match(renderToStaticMarkup(createElement(AnnotatedExample, {data: annotated})), /--annotated-token-dark/);
assert.match(renderToStaticMarkup(createElement(AnnotatedExampleWithSource, {data: {...annotated, source:{project:'demo'}}})), /source-ref/);
const annotatedMDX = await compile({value: fence + 'annotated\ntitle: Packed\ncode: SELECT 1;\nlanguage: sql\nannotations: [{id: q, title: Query, description: One row, ranges: [[1, 1]]}]\n' + fence, path:'annotated.mdx'}, {remarkPlugins:[remarkAnnotatedExample]});
assert.match(String(annotatedMDX), /AnnotatedExample/);
const annotatedCss = await readFile(new URL(import.meta.resolve('@vanhiep99w/docs-kit/styles/annotated-example.css')), 'utf8');
assert.match(annotatedCss, /\.annotated-example/);
const terminalYAML = 'title: Packed terminal\ncontext: {kind: local}\nsteps: [{id: version, command: node --version, outputs: [{stream: stdout, text: example}]}]';
const terminal = parseTerminalSession(terminalYAML);
validateTerminalSession(terminal);
assert.match(renderToStaticMarkup(createElement(TerminalSession, {data: terminal})), /Các bước terminal/);
const terminalMDX = await compile({value: fence + 'terminal-session\n' + terminalYAML + '\n' + fence, path:'terminal.mdx'}, {remarkPlugins:[remarkTerminalSession]});
assert.match(String(terminalMDX), /TerminalSession/);
const terminalCss = await readFile(new URL(import.meta.resolve('@vanhiep99w/docs-kit/styles/terminal-session.css')), 'utf8');
assert.match(terminalCss, /\.terminal-session/);
const marbleYAML = 'title: Packed marble\nrows: [{label: source, marble: "--(a|)"}]\nvalues: {a: one}';
const marble = parseMarbleDescriptor(marbleYAML);
assert.deepEqual(parseMarble(marble.rows[0]).tokens.map((token) => token.frame), [2, 2]);
assert.match(renderToStaticMarkup(createElement(MarbleDiagram, {data: marble})), /Frame 2: Complete/);
assert.match(renderToStaticMarkup(createElement(MarbleDiagram, marble)), /marble-diagram/);
const marbleMDX = await compile({value: fence + 'marble\n' + marbleYAML + '\n' + fence, path:'marble.mdx'}, {remarkPlugins:[remarkMarble]});
assert.match(String(marbleMDX), /MarbleDiagram/);
const marbleCss = await readFile(new URL(import.meta.resolve('@vanhiep99w/docs-kit/styles/marble.css')), 'utf8');
assert.match(marbleCss, /\.marble-diagram/);
const diff = await prepareCodeDiff({title:'Packed diff',language:'typescript',before:{code:'const a = 1;'},after:{code:'const a = 2;',source:{project:'demo',snapshot:'v2'}}});
validatePreparedCodeDiff(diff);
assert.match(renderToStaticMarkup(createElement(CodeDiff, {data:diff})), /--code-diff-token-dark/);
assert.match(renderToStaticMarkup(createElement(CodeDiffWithSource, {data:diff})), /source-ref/);
const diffMDX = await compile({value:fence+'code-diff\ntitle: Packed diff\nbefore: {code: before}\nafter: {code: after}\n'+fence,path:'diff.mdx'}, {remarkPlugins:[remarkCodeDiff]});
assert.match(String(diffMDX), /CodeDiff/);
assert.match(await readFile(new URL(import.meta.resolve('@vanhiep99w/docs-kit/styles/code-diff.css')), 'utf8'), /\.code-diff/);
const inspector = prepareDataInspector({title:'Packed data',json:'{"id":9007199254740993}'});
assert.equal(inspectorValue(inspector, '/id'), '9007199254740993');
assert.match(renderToStaticMarkup(createElement(DataInspector, {data:inspector})), /9007199254740993/);
const inspectorMDX = await compile({value:fence+'data-inspector\ntitle: Packed data\njson: \'{"id":9007199254740993}\'\n'+fence,path:'data.mdx'}, {remarkPlugins:[remarkDataInspector]});
assert.match(String(inspectorMDX), /DataInspector/);
assert.match(await readFile(new URL(import.meta.resolve('@vanhiep99w/docs-kit/styles/data-inspector.css')), 'utf8'), /\.data-inspector/);
const exchange = prepareProtocolExchange({title:'Packed HTTP',variants:[{id:'ok',title:'OK',request:{method:'GET',url:'/demo'},response:{status:200,body:{kind:'json',json:'{"id":9007199254740993}'}}}]});
assert.match(formatProtocolMessage(exchange.variants[0], 'response'), /9007199254740993/);
assert.match(renderToStaticMarkup(createElement(ProtocolExchange, {data:exchange})), /data-inspector/);
const exchangeMDX = await compile({value:fence+'protocol-exchange\ntitle: Packed HTTP\nvariants: [{id: a, title: A, request: {method: GET, url: /}, response: {status: 204}}]\n'+fence,path:'exchange.mdx'}, {remarkPlugins:[remarkProtocolExchange]});
assert.match(String(exchangeMDX), /ProtocolExchange/);
const exchangeCssURL = new URL(import.meta.resolve('@vanhiep99w/docs-kit/styles/protocol-exchange.css'));
assert.match(await readFile(exchangeCssURL, 'utf8'), /@import '.\/data-inspector.css'/);
assert.match(await readFile(new URL('./data-inspector.css', exchangeCssURL), 'utf8'), /\.data-inspector/);
const trace = prepareSpanWaterfall({title:'Packed trace',unit:'ms',provenance:{kind:'illustrative',description:'Synthetic'},spans:[{id:'r',name:'Root',service:'api',start:0,duration:10,attributes:'{"id":9007199254740993}'}]});
validatePreparedSpanWaterfall(trace);
assert.equal(waterfallRows(trace.spans)[0].depth, 0);
assert.match(renderToStaticMarkup(createElement(SpanWaterfall, {data:trace})), /9007199254740993/);
const traceMDX = await compile({value:fence+'span-waterfall\ntitle: Packed trace\nunit: ms\nprovenance: {kind: illustrative, description: Synthetic}\nspans: [{id: r, name: Root, service: api, start: 0, duration: 10}]\n'+fence,path:'trace.mdx'}, {remarkPlugins:[remarkSpanWaterfall]});
assert.match(String(traceMDX), /SpanWaterfall/);
const traceCssURL = new URL(import.meta.resolve('@vanhiep99w/docs-kit/styles/span-waterfall.css'));
assert.match(await readFile(traceCssURL, 'utf8'), /@import '.\/data-inspector.css'/);
assert.match(await readFile(new URL('./data-inspector.css', traceCssURL), 'utf8'), /\.data-inspector/);
const lanesYAML = 'title: Packed lanes\nunit: step\nprovenance: {kind: illustrative, description: Synthetic}\nlanes: [{id: a, label: A}]\nevents: [{id: e, lane: a, at: 1, label: Event}]';
const lanes = parseConcurrencyLanesDescriptor(lanesYAML);
validateConcurrencyLanes(lanes);
assert.equal(layoutConcurrencyLanes(lanes).items[0].number, 1);
assert.match(renderToStaticMarkup(createElement(ConcurrencyLanes, {data:lanes})), /Bảng timeline đầy đủ/);
const lanesMDX = await compile({value:fence+'concurrency-lanes\n'+lanesYAML+'\n'+fence,path:'lanes.mdx'}, {remarkPlugins:[remarkConcurrencyLanes]});
assert.match(String(lanesMDX), /ConcurrencyLanes/);
assert.match(await readFile(new URL(import.meta.resolve('@vanhiep99w/docs-kit/styles/concurrency-lanes.css')), 'utf8'), /\.concurrency-lanes/);
const walkthrough = await prepareCodeWalkthrough({title:'Packed walkthrough',language:'typescript',snapshots:[{id:'a',title:'A',code:'const a = 1;',source:{project:'demo',snapshot:'v0'}}],steps:[{id:'s',snapshot:'a',title:'Step',description:'Text',ranges:[[1,1]]}]});
validateCodeWalkthrough(walkthrough);
assert.equal(walkthroughExample(walkthrough, walkthrough.snapshots[0]).annotations[0].id, 's');
assert.match(renderToStaticMarkup(createElement(CodeWalkthrough, {data:walkthrough})), /--annotated-token-dark/);
assert.match(renderToStaticMarkup(createElement(CodeWalkthroughWithSource, {data:walkthrough})), /source-ref/);
const walkthroughMDX = await compile({value:fence+'code-walkthrough\ntitle: Packed walkthrough\nsnapshots: [{id: a, title: A, code: hello}]\nsteps: [{id: s, snapshot: a, title: Step, description: Text, ranges: [[1, 1]]}]\n'+fence,path:'walkthrough.mdx'}, {remarkPlugins:[remarkCodeWalkthrough]});
assert.match(String(walkthroughMDX), /CodeWalkthrough/);
const walkthroughCssURL = new URL(import.meta.resolve('@vanhiep99w/docs-kit/styles/code-walkthrough.css'));
assert.match(await readFile(walkthroughCssURL, 'utf8'), /@import '.\/annotated-example.css'/);
assert.match(await readFile(new URL('./annotated-example.css', walkthroughCssURL), 'utf8'), /\.annotated-example/);
const stateYAML = 'title: Packed model\nassumptions: Synthetic\ninitial: a\nstates: [{id: a, label: A}, {id: b, label: B, terminal: true}]\ntransitions: [{id: go, from: a, to: b, event: GO, guard: Text only, description: Explanation}]';
const stateModel = parseStateTransitionDescriptor(stateYAML);
validateStateTransition(stateModel);
assert.equal(traceStateTransitions(stateModel, ['go']).current, 'b');
assert.match(renderToStaticMarkup(createElement(StateTransitionExplorer, {data:stateModel})), /Hiện tại: A/);
const stateMDX = await compile({value:fence+'state-transition\n'+stateYAML+'\n'+fence,path:'model.mdx'}, {remarkPlugins:[remarkStateTransition]});
assert.match(String(stateMDX), /StateTransitionExplorer/);
assert.match(await readFile(new URL(import.meta.resolve('@vanhiep99w/docs-kit/styles/state-transition.css')), 'utf8'), /\.state-transition/);
const wordDiff = await prepareCodeDiff({title:'Split words',wordDiff:true,view:'split',before:{code:'const retry = 3;'},after:{code:'const retry = 5;'}});
validatePreparedCodeDiff(wordDiff);
assert.ok(wordDiff.rows.some((row) => row.ranges?.length));
const wordMarkup = renderToStaticMarkup(createElement(CodeDiff, {data:wordDiff}));
assert.match(wordMarkup, /data-view="split"/); assert.match(wordMarkup, /data-word-changed="true"/);
const zoomMDX = await compile({value:fence+'marble\ntitle: Zoom\nzoom: true\nrows: [{label: a, marble: "--(a|)"}]\n'+fence,path:'zoom.mdx'}, {remarkPlugins:[remarkMarble]});
assert.match(String(zoomMDX), /MarbleZoomDiagram/);
assert.match(renderToStaticMarkup(createElement(MarbleZoomDiagram, {data:marble})), /marble-zoom-controls/);
console.log('Packed package works from an isolated consumer.');
`);
  const result = await execute(process.execPath, [path.join(consumer, 'check.mjs')], {
    cwd: consumer, timeout: 90_000, maxBuffer: 5 * 1024 * 1024,
  });
  process.stdout.write(result.stdout);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
