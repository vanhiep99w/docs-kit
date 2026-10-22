import { createElement, useState } from 'react';
import { ExampleExplorerProvider, ExampleRef } from '../../src/components/example-explorer/index.js';
import { LiveDemo } from '../../src/components/live-demo.js';
import { D2InteractiveDiagram } from '../../src/components/d2-interactive.js';
import { D2Diagram } from '../../src/components/d2.js';
import { SourceExplorerProvider, D2SourceLinks, SourceRef } from '../../src/components/source-explorer/index.js';
import type { D2InteractiveDiagramProps } from '../../src/components/d2-types.js';
import { CodeWalkthrough, type CodeWalkthroughData } from '../../src/components/code-walkthrough.js';
import { CodeWalkthroughWithSource } from '../../src/components/code-walkthrough-source.js';
import { TerminalSession, type TerminalSessionData } from '../../src/components/terminal-session.js';
import { CodeDiff, type PreparedCodeDiff } from '../../src/components/code-diff.js';
import { CodeDiffWithSource } from '../../src/components/code-diff-source.js';
import { SpanWaterfall, type PreparedSpanWaterfall } from '../../src/components/span-waterfall.js';
import { ProtocolExchange, type PreparedProtocolExchange } from '../../src/components/protocol-exchange.js';

type WalkthroughCase = { walkthrough: CodeWalkthroughData; replacement?: CodeWalkthroughData; adapter?: boolean; provider?: boolean };
function WalkthroughDemo({ data }: { data: WalkthroughCase }) {
  const [replaced, setReplaced] = useState(false);
  const walkthrough = replaced && data.replacement ? data.replacement : data.walkthrough;
  const content = <main><h1>Đọc code theo bước</h1>{data.replacement && <button type="button" onClick={() => setReplaced(!replaced)}>Đổi dữ liệu ví dụ</button>}
    {data.adapter ? <CodeWalkthroughWithSource data={walkthrough} /> : <CodeWalkthrough data={walkthrough} />}</main>;
  return data.provider ? <SourceExplorerProvider manifestUrl="/manifest.json">{content}</SourceExplorerProvider> : content;
}

function LiveDemoFixture() {
  const [src, setSrc] = useState('/live-demo-document');
  return <main><h1>Live demo fixture</h1><button onClick={() => setSrc('/live-demo-document?other=1')}>Đổi demo</button>
    <LiveDemo src={src} title="Demo tương tác" sourceUrl="https://github.com/example/demo" height={440} /></main>;
}

const exampleDefinitions = [
  {id:'shop',title:'Shop React + Vue',defaultVersion:'snapshot',versions:[
    {id:'snapshot',title:'Snapshot + subscription',src:'/example-demo?version=snapshot',sourceUrl:'https://github.com/example/shop'},
    {id:'events',title:'Event-only (bản lỗi)',src:'http://localhost:4178/example-demo?version=events'},
  ]},
  {id:'bus',title:'EventTarget',defaultVersion:'v1',versions:[{id:'v1',title:'v1',src:'/example-demo?version=bus'}]},
];
function ExampleFixture() {
  const [page, setPage] = useState('one');
  return <SourceExplorerProvider manifestUrl="/manifest.json"><ExampleExplorerProvider examples={exampleDefinitions} navigationKey={page}>
    <main><h1>Example dialog fixture</h1><button onClick={() => {
      window.history.pushState(window.history.state, '', '?case=example-explorer&route=other');
      setPage('other');
    }}>Trang khác</button>
    {page === 'one' ? <><p>Nội dung bài đọc không bị thu hẹp.</p>
      <p><ExampleRef example="shop">Example shop</ExampleRef></p>
      <p><ExampleRef example="shop" version="events" variant="inline">Example event-only</ExampleRef></p>
      <p><ExampleRef example="bus">Example EventTarget</ExampleRef></p>
      <SourceRef project="demo" file="src/main.ts">Source fixture</SourceRef>
    </> : <p>Trang không có example.</p>}</main>
  </ExampleExplorerProvider></SourceExplorerProvider>;
}

export function App({ data }: { data: (D2InteractiveDiagramProps & { serverOnly?: boolean; emittedComponent?: string }) | WalkthroughCase | { terminal: TerminalSessionData } | { diff: PreparedCodeDiff; adapter?: boolean; provider?: boolean } | { exchange: PreparedProtocolExchange } | { waterfall: PreparedSpanWaterfall } | { liveDemo: true } | { exampleExplorer: true } }) {
  if ('exampleExplorer' in data) return <ExampleFixture />;
  if ('liveDemo' in data) return <LiveDemoFixture />;
  if ('walkthrough' in data) return <WalkthroughDemo data={data} />;
  if ('waterfall' in data) return <main><h1>Thời gian request</h1><p>Trace tĩnh dùng chung mốc thời gian; không kết nối backend.</p><SpanWaterfall data={data.waterfall} /></main>;
  if ('exchange' in data) return <main><h1>Request và response</h1><p>So sánh các tình huống độc lập, không gọi API thật.</p><ProtocolExchange data={data.exchange} /></main>;
  if ('diff' in data) {
    const content = <main><h1>So sánh thay đổi</h1><p>Đọc các dòng thêm/xóa của hai phiên bản.</p>{data.adapter ? <CodeDiffWithSource data={data.diff} /> : <CodeDiff data={data.diff} />}</main>;
    return data.provider ? <SourceExplorerProvider manifestUrl="/manifest.json">{content}</SourceExplorerProvider> : content;
  }
  if ('terminal' in data) return <main><h1>Phiên terminal minh họa</h1><p>Lệnh và kết quả được biên soạn; không có shell kết nối.</p><TerminalSession data={data.terminal} /></main>;
  if (data.serverOnly || data.emittedComponent === 'D2Diagram') return <main><h1>Server-only diagram</h1><D2Diagram {...data} /></main>;
  return <SourceExplorerProvider manifestUrl="/manifest.json">
    <D2SourceLinks><main><h1>Architecture lab</h1><p>Read the flow, then explore the implementation.</p><D2InteractiveDiagram {...data} /></main></D2SourceLinks>
  </SourceExplorerProvider>;
}
