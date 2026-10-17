import { createElement, useState } from 'react';
import { D2InteractiveDiagram } from '../../src/components/d2-interactive.js';
import { SourceExplorerProvider, D2SourceLinks } from '../../src/components/source-explorer/index.js';
import type { D2InteractiveDiagramProps } from '../../src/components/d2-types.js';
import { StateTransitionExplorer, type StateTransitionData } from '../../src/components/state-transition.js';
import { CodeWalkthrough, type CodeWalkthroughData } from '../../src/components/code-walkthrough.js';
import { CodeWalkthroughWithSource } from '../../src/components/code-walkthrough-source.js';
import { AnnotatedExample, type AnnotatedExampleData } from '../../src/components/annotated-example.js';
import { AnnotatedExampleWithSource } from '../../src/components/annotated-example-source.js';
import { TerminalSession, type TerminalSessionData } from '../../src/components/terminal-session.js';
import { MarbleZoomDiagram } from '../../src/components/marble-zoom.js';
import { MarbleDiagram, type MarbleDiagramData } from '../../src/components/marble.js';
import { CodeDiff, type PreparedCodeDiff } from '../../src/components/code-diff.js';
import { CodeDiffWithSource } from '../../src/components/code-diff-source.js';
import { DataInspector, type PreparedDataInspector } from '../../src/components/data-inspector.js';
import { ConcurrencyLanes, type ConcurrencyLanesData } from '../../src/components/concurrency-lanes.js';
import { SpanWaterfall, type PreparedSpanWaterfall } from '../../src/components/span-waterfall.js';
import { ProtocolExchange, type PreparedProtocolExchange } from '../../src/components/protocol-exchange.js';

type StateModelCase = { stateModel: StateTransitionData; replacement?: StateTransitionData };
function StateModelDemo({ data }: { data: StateModelCase }) {
  const [replaced, setReplaced] = useState(false);
  return <main><h1>Khám phá chuyển trạng thái</h1>{data.replacement && <button type="button" onClick={() => setReplaced(!replaced)}>Đổi mô hình</button>}
    <StateTransitionExplorer data={replaced && data.replacement ? data.replacement : data.stateModel} /></main>;
}

type WalkthroughCase = { walkthrough: CodeWalkthroughData; replacement?: CodeWalkthroughData; adapter?: boolean; provider?: boolean };
function WalkthroughDemo({ data }: { data: WalkthroughCase }) {
  const [replaced, setReplaced] = useState(false);
  const walkthrough = replaced && data.replacement ? data.replacement : data.walkthrough;
  const content = <main><h1>Đọc code theo bước</h1>{data.replacement && <button type="button" onClick={() => setReplaced(!replaced)}>Đổi dữ liệu ví dụ</button>}
    {data.adapter ? <CodeWalkthroughWithSource data={walkthrough} /> : <CodeWalkthrough data={walkthrough} />}</main>;
  return data.provider ? <SourceExplorerProvider manifestUrl="/manifest.json">{content}</SourceExplorerProvider> : content;
}

type AnnotatedCase = { example: AnnotatedExampleData; adapter?: boolean; provider?: boolean };

export function App({ data }: { data: D2InteractiveDiagramProps | AnnotatedCase | WalkthroughCase | StateModelCase | { terminal: TerminalSessionData } | { marble: MarbleDiagramData; marbleDirect?: boolean } | { diff: PreparedCodeDiff; adapter?: boolean; provider?: boolean } | { inspector: PreparedDataInspector } | { exchange: PreparedProtocolExchange } | { waterfall: PreparedSpanWaterfall } | { concurrency: ConcurrencyLanesData } }) {
  if ('stateModel' in data) return <StateModelDemo data={data} />;
  if ('walkthrough' in data) return <WalkthroughDemo data={data} />;
  if ('concurrency' in data) return <main><h1>Diễn biến đồng thời</h1><p>Lane là actor; quan hệ do tác giả khai báo, không mô phỏng hệ thống.</p><ConcurrencyLanes data={data.concurrency} /></main>;
  if ('waterfall' in data) return <main><h1>Thời gian request</h1><p>Trace tĩnh dùng chung mốc thời gian; không kết nối backend.</p><SpanWaterfall data={data.waterfall} /></main>;
  if ('exchange' in data) return <main><h1>Request và response</h1><p>So sánh các tình huống độc lập, không gọi API thật.</p><ProtocolExchange data={data.exchange} /></main>;
  if ('inspector' in data) return <main><h1>Khám phá payload</h1><p>Dữ liệu tĩnh; copy value giữ nguyên JSON, kể cả số lớn.</p><DataInspector data={data.inspector} /></main>;
  if ('diff' in data) {
    const content = <main><h1>Thay đổi và lý do</h1><p>Đọc các dòng thêm/xóa cùng lời giải thích.</p>{data.adapter ? <CodeDiffWithSource data={data.diff} /> : <CodeDiff data={data.diff} />}</main>;
    return data.provider ? <SourceExplorerProvider manifestUrl="/manifest.json">{content}</SourceExplorerProvider> : content;
  }
  if ('marble' in data) return <main><h1>Marble timeline</h1><p>Đọc theo cột; mỗi lane dùng chung trục thời gian.</p>{data.marble.zoom ? data.marbleDirect ? <MarbleZoomDiagram {...data.marble} /> : <MarbleZoomDiagram data={data.marble} /> : <MarbleDiagram data={data.marble} />}</main>;
  if ('terminal' in data) return <main><h1>Phiên terminal minh họa</h1><p>Lệnh và kết quả được biên soạn; không có shell kết nối.</p><TerminalSession data={data.terminal} /></main>;
  if ('example' in data) {
    const content = <main><h1>Ví dụ có chú thích</h1><p>Đọc code và chọn phần giải thích tương ứng.</p>
      {data.adapter ? <AnnotatedExampleWithSource data={data.example} /> : <AnnotatedExample data={data.example} />}
    </main>;
    return data.provider ? <SourceExplorerProvider manifestUrl="/manifest.json">{content}</SourceExplorerProvider> : content;
  }
  return <SourceExplorerProvider manifestUrl="/manifest.json">
    <D2SourceLinks><main><h1>Architecture lab</h1><p>Read the flow, then explore the implementation.</p><D2InteractiveDiagram {...data} /></main></D2SourceLinks>
  </SourceExplorerProvider>;
}
