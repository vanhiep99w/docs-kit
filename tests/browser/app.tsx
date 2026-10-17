import { createElement } from 'react';
import { D2InteractiveDiagram } from '../../src/components/d2-interactive.js';
import { SourceExplorerProvider, D2SourceLinks } from '../../src/components/source-explorer/index.js';
import type { D2InteractiveDiagramProps } from '../../src/components/d2-types.js';

export function App({ data }: { data: D2InteractiveDiagramProps }) {
  return <SourceExplorerProvider manifestUrl="/manifest.json">
    <D2SourceLinks><main><h1>Architecture lab</h1><p>Read the flow, then explore the implementation.</p><D2InteractiveDiagram {...data} /></main></D2SourceLinks>
  </SourceExplorerProvider>;
}
