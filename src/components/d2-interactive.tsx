'use client';

import { Component, lazy, Suspense, useState, type ReactNode } from 'react';
import { D2Diagram } from './d2.js';
import type { D2InteractiveDiagramProps } from './d2-types.js';

export type { D2InteractiveDiagramProps, D2Board, D2Mode } from './d2-types.js';
const Viewer = lazy(() => import('./d2-viewer.js'));

class ViewerBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** Optional client boundary. The compiler/WASM is never imported here. */
export function D2InteractiveDiagram(props: D2InteractiveDiagramProps) {
  const [active, setActive] = useState(false);
  const initial = props.boards?.[0];
  const fallback = <>
    <D2Diagram {...props} lightSvg={initial?.lightSvg ?? props.lightSvg} darkSvg={initial?.darkSvg ?? props.darkSvg} />
    {props.boards && props.boards.length > 1 && <details className="d2-board-fallback">
      <summary>All views ({props.boards.length})</summary>
      {props.boards.slice(1).map((board, index) => <D2Diagram key={board.id} id={`${props.id}-fallback-${index}`}
        caption={board.label} lightSvg={board.lightSvg} darkSvg={board.darkSvg} />)}
    </details>}
    {props.source !== undefined && <details className="d2-source-fallback">
      <summary>D2 source</summary><pre><code>{props.source}</code></pre>
    </details>}
  </>;
  return <div className="d2-interactive not-prose">
    {active ? <ViewerBoundary fallback={<><p role="alert">Could not load diagram controls. The static views are still available.</p>{fallback}</>}>
      <Suspense fallback={<><p role="status">Loading diagram controls…</p>{fallback}</>}>
        <Viewer {...props} />
      </Suspense>
    </ViewerBoundary> : <>
      <div className="d2-launch"><button type="button" onClick={() => setActive(true)} aria-label={`Explore diagram: ${props.caption}`}>
        {props.boards && props.boards.length > 1 ? `Explore ${props.boards.length} views` : 'Explore diagram'} <span aria-hidden="true">↗</span>
      </button></div>
      {fallback}
    </>}
  </div>;
}
