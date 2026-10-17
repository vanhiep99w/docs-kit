import { createServer } from 'node:http';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { D2 } from '@d2lang/d2';
import { renderDiagram } from '../../dist/d2/render.mjs';
import { parseStateTransitionDescriptor } from '../../dist/state-transition/index.js';
import { prepareCodeWalkthrough } from '../../dist/annotated-example/walkthrough.js';
import { prepareAnnotatedExample } from '../../dist/annotated-example/index.js';
import { parseMarbleDescriptor } from '../../dist/marble/index.js';
import { prepareCodeDiff, parseCodeDiffDescriptor } from '../../dist/code-diff/index.js';
import { prepareDataInspector } from '../../dist/data-inspector/index.js';
import { parseConcurrencyLanesDescriptor } from '../../dist/concurrency-lanes/index.js';
import { parseSpanWaterfallDescriptor } from '../../dist/span-waterfall/index.js';
import { prepareProtocolExchange } from '../../dist/protocol-exchange/index.js';

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
const example = await prepareAnnotatedExample({
  title: 'Theo dõi pipeline RxJS', language: 'typescript',
  code: "import { filter, map, of } from 'rxjs';\r\n\r\nconst result$ = of(1, 2, 3).pipe(\r\n  filter((value) => value % 2 === 0),\r\n  map((value) => value * 10),\r\n);\r\n\r\nresult$.subscribe(console.log); // tiếng Việt — " + 'long-output-'.repeat(20) + '\r\n',
  annotations: [
    { id: 'pipeline', title: 'Ghép pipeline', description: 'filter giữ 2; map đổi thành 20.', ranges: [[3, 6]] },
    { id: 'subscribe', title: 'Bắt đầu execution', description: 'Source phát đồng bộ khi subscribe.', ranges: [[3, 3], [8, 8]] },
  ],
});
data.annotated = { example };
data['annotated-source'] = { example: { ...example, source: { project: 'demo', file: 'src/main.ts', lines: '1' } }, adapter: true, provider: true };
data['annotated-no-provider'] = { ...data['annotated-source'], provider: false };
const walkthroughInput = {
  title: 'Đọc thay đổi qua hai snapshot', language: 'typescript', description: 'Ví dụ tĩnh; không chạy code.',
  snapshots: [
    { id: 'before', title: 'Trước', code: 'const value = 1;\r\n\r\nconsole.log(value); // xin chào 👋\r\n' },
    { id: 'after', title: 'Sau', code: ['const value = 2;', ...Array.from({length:70}, (_, i) => '// explanation ' + (i + 1)), 'console.log(value); // ' + 'wide-'.repeat(50)].join('\r\n') + '\r\n' },
  ],
  steps: [
    { id: 'old', snapshot: 'before', title: 'Giá trị cũ', description: 'Khai báo ban đầu.', ranges: [[1,1]] },
    { id: 'new', snapshot: 'after', title: 'Đổi giá trị', description: 'Snapshot mới đã được biên soạn sẵn.', ranges: [[1,1]] },
    { id: 'log', snapshot: 'after', title: 'Đọc dòng cuối', description: 'Hai vùng ở xa nhau vẫn highlight đồng thời.', ranges: [[72,72],[1,1]] },
    { id: 'revisit', snapshot: 'before', title: 'Quay lại trước', description: 'Thứ tự bước không phải lịch sử Git.', ranges: [[3,3]] },
  ],
};
data.walkthrough = { walkthrough: await prepareCodeWalkthrough(walkthroughInput), replacement: await prepareCodeWalkthrough({ ...walkthroughInput, title: 'Dữ liệu thay thế', snapshots: walkthroughInput.snapshots.map((snapshot) => ({ ...snapshot, code: snapshot.code.replace('value = ', 'value = 9') })) }) };
data['walkthrough-source'] = { adapter: true, provider: true, walkthrough: await prepareCodeWalkthrough({ ...walkthroughInput, snapshots: walkthroughInput.snapshots.map((snapshot) => ({ ...snapshot, source: { project: 'demo', snapshot: snapshot.id === 'before' ? 'v0' : 'v1', file: 'src/main.ts' } })) }) };
data['walkthrough-no-provider'] = { ...data['walkthrough-source'], provider: false };
data.terminal = { terminal: {
  title: 'Kiểm chứng một phiên lệnh',
  description: 'Transcript tĩnh: không thực thi bất cứ lệnh nào.',
  context: { kind: 'local', label: 'dev', cwd: '~/work/api' },
  steps: [
    { id: 'print', title: 'In giá trị thử nghiệm',
      command: "printf '%s\\n' \\\r\n  \"xin chào 👋\"\r\n",
      warning: 'Chỉ dùng dữ liệu giả; không dán secrets vào ví dụ.',
      outputs: [
        { stream: 'stdout', text: 'xin chào 👋\n' + 'wide-output-'.repeat(30), annotations: [{ id: 'value', title: 'Giá trị trả về', description: 'Dòng đầu giữ nguyên Unicode.', ranges: [[1, 1]] }] },
        { stream: 'stderr', text: 'diagnostic, not failure' },
      ], expected: 'Nhận đúng giá trị minh họa.', exitCode: 0,
    },
    { id: 'logs', title: 'Đọc log ở remote host', context: { kind: 'remote', label: 'demo.example.invalid', cwd: '/srv/api' },
      command: 'cat /var/log/demo-app.log',
      outputs: [{ stream: 'stderr', text: Array.from({ length: 65 }, (_, i) => 'log line ' + (i + 1)).join('\n'), collapsed: true }],
      exitCode: 1,
    },
    { id: 'redis', title: 'Đọc key trong Redis CLI', context: { kind: 'container', label: 'redis-dev / redis-cli' },
      prompt: '127.0.0.1:6379>', command: 'GET docs-kit:demo', outputs: [{ stream: 'stdout', text: '\"xin chào\"' }],
    },
  ],
} };
for (const [key, name] of [['marble', 'switch-map'], ['marble-group', 'lifecycle']]) {
  const mdx = await readFile(new URL('../../examples/marble/' + name + '.mdx', import.meta.url), 'utf8');
  data[key] = { marble: parseMarbleDescriptor(mdx.split('```marble\n')[1].split('```')[0]) };
}
data['marble-long'] = { marble: { title: 'Cùng frame, nhãn dài',
  rows: [
    { id: 'a', label: 'Nguồn có tên dài cần xuống dòng, không đè lên trục thời gian', marble: '--(ab|)', kind: 'source' },
    { id: 'b', label: 'Kết quả', marble: '--(xy|)', kind: 'output' },
    { label: 'Cửa sổ thời gian', marble: '-'.repeat(60), kind: 'subscription' },
  ], values: { a: 'A', b: 'B', x: 'X', y: 'Y' },
} };
data['marble-zoom'] = { marble: { ...data['marble-long'].marble, zoom: true } };
data['marble-zoom-direct'] = { ...data['marble-zoom'], marbleDirect: true };
const diffHeader = Array.from({ length: 8 }, (_, i) => '// shared header ' + (i + 1) + '\r\n').join('');
const diffTail = Array.from({ length: 8 }, (_, i) => '// shared tail ' + (i + 1) + '\r\n').join('');
data.diff = { diff: await prepareCodeDiff({
  title: 'Giữ đúng số dòng sau khi chèn', language: 'typescript', contextLines: 1,
  before: { label: 'v1.ts', code: diffHeader + 'const value = 1;\r\n' + diffTail + 'console.log(value);' },
  after: { label: 'v2.ts', code: diffHeader + '// tiếng Việt 👋\r\nconst value = 2;\r\n' + diffTail + 'console.log(value, "' + 'wide-'.repeat(40) + '");' },
  annotations: [
    { id: 'old', side: 'before', title: 'Giá trị cũ', description: 'Dòng 9 ở bản trước.', ranges: [[9, 9]] },
    { id: 'new', side: 'after', title: 'Giá trị mới', description: 'Dòng 10 sau khi chèn comment.', ranges: [[10, 10]] },
    { id: 'pinned', side: 'after', title: 'Dòng không đổi cần giải thích', description: 'Dòng này không bị giấu trong phần thu gọn.', ranges: [[3, 3]] },
  ],
}) };
const { rows: _rows, ...splitInput } = data.diff.diff;
data['diff-split'] = { diff: await prepareCodeDiff({ ...splitInput, view: 'split', wordDiff: true }) };
const wordFixture = await readFile(new URL('../../examples/code-diff/split-words.mdx', import.meta.url), 'utf8');
data['diff-words'] = { diff: await parseCodeDiffDescriptor(wordFixture.split('```code-diff\n')[1].split('```')[0]) };
data['diff-source'] = { adapter: true, provider: true, diff: await prepareCodeDiff({ title: 'Hai snapshot', language: 'typescript',
  before: { code: 'export const demo = 0;', source: { project: 'demo', snapshot: 'v0', file: 'src/main.ts' } },
  after: { code: 'export const demo = 1;', source: { project: 'demo', snapshot: 'v1', file: 'src/main.ts' } },
}) };
data['diff-no-provider'] = { ...data['diff-source'], provider: false };
data.inspector = { inspector: prepareDataInspector({
  title: 'Event payload', expandedDepth: 1,
  json: ' \r\n{\n  "sequence": 9007199254740993,\n  "value": {"name":"xin chào 👋", "items":[{"sku":"ABC-001", "quantity":2}], "details":{"a/b":{"~":true}}},\n  "nullable": null, "empty": [], "": "empty key",\n  "unopened": {"child":{"status":"pending"}},\n  "longText": "' + 'long-value-'.repeat(25) + '"\n}\r\n',
  annotations: [
    { id: 'sku', pointer: '/value/items/0/sku', title: 'SKU sản phẩm', description: 'Chỉ là field trong payload minh họa.' },
    { id: 'escape', pointer: '/value/details/a~1b/~0', title: 'Key có slash và tilde', description: 'Copy path dùng RFC 6901.' },
  ],
}) };
data['inspector-scalar'] = { inspector: prepareDataInspector({ title: 'Scalar root', json: '1e309' }) };
data.protocol = { exchange: prepareProtocolExchange({
  title: 'Profile API — các kết quả',
  description: 'Payload và credentials đều là dữ liệu giả lập.',
  variants: [
    { id: 'ok', title: 'Thành công', request: { method: 'POST', url: '/demo?trace=1',
        headers: [{ id: 'auth', name: 'Authorization', value: 'Bearer DEMO_NOT_REAL' }, { id: 'type', name: 'Content-Type', value: 'application/json' }],
        body: { kind: 'json', json: ' \r\n{"userId":"u_demo"}\r\n' },
      }, response: { status: 200, statusText: 'OK',
        headers: [{ id: 'type', name: 'Content-Type', value: 'application/json' }, { id: 'cookie-one', name: 'Set-Cookie', value: 'one=FAKE; Secure' }, { id: 'cookie-two', name: 'Set-Cookie', value: 'two=FAKE; Secure' }],
        body: { kind: 'json', json: '{"id":9007199254740993,"profile":{"name":"Nguyễn An","active":true}}', annotations: [{ id: 'id', pointer: '/id', title: 'ID nguyên lớn', description: 'Không đi qua JavaScript Number.' }] },
      }, annotations: [
        { id: 'auth', side: 'request', target: 'header', header: 'auth', title: 'Credential giả', description: 'Chỉ là ví dụ, không có bước xác thực.' },
        { id: 'cookie', side: 'response', target: 'header', header: 'cookie-two', title: 'Cookie thứ hai', description: 'Header trùng tên giữ nguyên từng dòng.' },
        { id: 'payload', side: 'response', target: 'body', title: 'Đọc JSON response', description: 'Dùng chung Data Inspector.' },
      ],
    },
    { id: 'error', title: 'Không được phép', request: { method: 'GET', url: 'https://api.example.invalid/demo' },
      response: { status: 401, statusText: 'Unauthorized', headers: [{ id: 'challenge', name: 'WWW-Authenticate', value: 'Bearer realm="demo"' }],
        body: { kind: 'text', text: 'unauthorized\r\n' + 'wide-error-'.repeat(45) + '\n' },
      },
    },
    { id: 'head', title: 'Chỉ đọc metadata', request: { method: 'HEAD', url: '/demo' }, response: { status: 200, headers: [{ id: 'length', name: 'Content-Length', value: '120' }] } },
  ],
}) };
for (const [key, name] of [['waterfall', 'api-cache'], ['waterfall-parallel', 'parallel-services']]) {
  const mdx = await readFile(new URL('../../examples/span-waterfall/' + name + '.mdx', import.meta.url), 'utf8');
  data[key] = { waterfall: parseSpanWaterfallDescriptor(mdx.split('```span-waterfall\n')[1].split('```')[0]) };
}
for (const [key, name] of [['concurrency', 'sql-row-lock'], ['concurrency-java', 'java-publication']]) {
  const mdx = await readFile(new URL('../../examples/concurrency-lanes/' + name + '.mdx', import.meta.url), 'utf8');
  data[key] = { concurrency: parseConcurrencyLanesDescriptor(mdx.split('```concurrency-lanes\n')[1].split('```')[0]) };
}
data['concurrency-overlap'] = structuredClone(data.concurrency);
data['concurrency-overlap'].concurrency.events.push({ id: 'same-coordinate', lane: 't1', at: 1, label: 'Cùng mốc với lock 👋' });
data['concurrency-overlap'].concurrency.lanes[0].label = 'Transaction có tên dài cần đọc đầy đủ trong phần giải thích bên dưới, không làm lệch timeline';
data['concurrency-overlap'].concurrency.lanes.push({ id: 'idle', label: 'Actor không có action' });
for (const [key, name] of [['state-model', 'circuit-breaker'], ['state-form', 'form-workflow']]) {
  const mdx = await readFile(new URL('../../examples/state-transition/' + name + '.mdx', import.meta.url), 'utf8');
  data[key] = { stateModel: parseStateTransitionDescriptor(mdx.split('```state-transition\n')[1].split('```')[0]) };
}
data['state-model'].replacement = { ...structuredClone(data['state-model'].stateModel), title: 'Mô hình thay thế', states: data['state-model'].stateModel.states.map((state) => ({ ...state, label: state.label + ' mới' })) };
data['state-unsafe-looking'] = structuredClone(data['state-model']);
data['state-unsafe-looking'].stateModel.transitions.find((transition) => transition.id === 'trip').guard = 'globalThis.__stateGuardRuns = 99';
data['state-unsafe-looking'].stateModel.transitions.find((transition) => transition.id === 'trip').effects = ['fetch("https://example.invalid/effect")', 'alert("effect")'];
data['state-dead-end'] = { stateModel: { title: 'Dead end', assumptions: 'Không suy ra terminal.', initial: 'a', states: [{id:'a',label:'A'}], transitions: [] } };
const stateCss = await readFile(new URL('../../dist/styles/state-transition.css', import.meta.url), 'utf8');
const concurrencyCss = await readFile(new URL('../../dist/styles/concurrency-lanes.css', import.meta.url), 'utf8');
const waterfallCss = await readFile(new URL('../../dist/styles/span-waterfall.css', import.meta.url), 'utf8');
const exchangeCss = await readFile(new URL('../../dist/styles/protocol-exchange.css', import.meta.url), 'utf8');
const inspectorCss = await readFile(new URL('../../dist/styles/data-inspector.css', import.meta.url), 'utf8');
const diffCss = await readFile(new URL('../../dist/styles/code-diff.css', import.meta.url), 'utf8');
const marbleCss = await readFile(new URL('../../dist/styles/marble.css', import.meta.url), 'utf8');
const terminalCss = await readFile(new URL('../../dist/styles/terminal-session.css', import.meta.url), 'utf8');
const walkthroughCss = await readFile(new URL('../../dist/styles/code-walkthrough.css', import.meta.url), 'utf8');
const annotatedCss = await readFile(new URL('../../dist/styles/annotated-example.css', import.meta.url), 'utf8');
const css = await readFile(new URL('../../dist/styles/d2.css', import.meta.url), 'utf8');
const sourceCss = await readFile(new URL('../../dist/styles/source-explorer.css', import.meta.url), 'utf8');
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.endsWith('.js')) {
    try { res.setHeader('content-type', 'text/javascript'); res.end(await readFile(new URL(url.pathname.slice(1), out))); }
    catch { res.writeHead(404); res.end(); }
    return;
  }
  if (url.pathname === '/manifest.json') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify([{ id: 'demo', title: 'Demo project', defaultSnapshot: 'v1', snapshots: [{ id: 'v1', title: 'v1', asset: '/snapshot.json' }, { id: 'v0', title: 'v0', asset: '/snapshot-v0.json' }] }])); return; }
  if (url.pathname === '/snapshot.json' || url.pathname === '/snapshot-v0.json') {
    const old = url.pathname === '/snapshot-v0.json';
    const code = 'export const demo = ' + (old ? 0 : 1) + ';';
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ project: 'demo', snapshot: old ? 'v0' : 'v1', defaultFile: 'src/main.ts', files: [{ path: 'src/main.ts', language: 'ts', code, html: '<pre><code><span class="line" data-line="1">' + code + '</span></code></pre>', regions: {} }] })); return;
  }
  const props = data[url.searchParams.get('case') ?? 'static'] ?? data.static;
  res.setHeader('content-type', 'text/html;charset=utf-8');
  res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Georgia,serif;margin:0;background:#f8fafc;color:#243346}main{max-width:900px;margin:3rem auto;padding:1rem}body.dark{background:#18202b;color:#dce3ed}' + css + sourceCss + annotatedCss + terminalCss + marbleCss + diffCss + inspectorCss + exchangeCss.replace("@import './data-inspector.css';", '') + waterfallCss.replace("@import './data-inspector.css';", '') + concurrencyCss + walkthroughCss.replace("@import './annotated-example.css';", '') + stateCss + '</style></head><body><div id="root">' + renderToString(createElement(App, { data: props })) + '</div><script id="data" type="application/json">' + JSON.stringify(props).replaceAll('<', '\\u003c') + '</script><script type="module" src="/client.js"></script></body></html>');
});
server.listen(4178, '127.0.0.1', () => console.log('Browser fixtures ready'));
