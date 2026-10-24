'use client';

import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { D2Diagram } from './d2.js';
import { D2SourceMenu } from './d2-controls.js';
import type { D2InteractiveDiagramProps } from './d2-types.js';

export type { D2InteractiveDiagramProps, D2Board, D2Mode, D2Flow, D2FlowStep } from './d2-types.js';
const Viewer = lazy(() => import('./d2-viewer.js'));

class ViewerBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** Auto-load controls after hydration; the compiler/WASM stays build-time only. */
export function D2InteractiveDiagram(props: D2InteractiveDiagramProps) {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  const initial = props.boards?.[0];
  const fallback = <>
    {props.source !== undefined && <div className="d2-fallback-tools"><D2SourceMenu source={props.source} /></div>}
    <D2Diagram {...props} lightSvg={initial?.lightSvg ?? props.lightSvg} darkSvg={initial?.darkSvg ?? props.darkSvg} />
    {props.flow && <details className="d2-flow-fallback" open>
      <summary>Request flow scenarios (illustrative)</summary>
      {props.flow.scenarios.map((scenario) => <section key={scenario.id}><h3>{scenario.label}</h3>
        <ol>{scenario.steps.map((step, index) => <li key={index}><strong>{step.from} → {step.to}</strong>: {step.description}</li>)}</ol>
      </section>)}
    </details>}
    {props.boards && props.boards.length > 1 && <details className="d2-board-fallback">
      <summary>All views ({props.boards.length})</summary>
      {props.boards.slice(1).map((board, index) => <D2Diagram key={board.id} id={`${props.id}-fallback-${index}`}
        caption={board.label} lightSvg={board.lightSvg} darkSvg={board.darkSvg} />)}
    </details>}
  </>;
  return <div className="d2-interactive not-prose">
    {ready ? <ViewerBoundary fallback={<><p role="alert">Could not load diagram controls. The static views are still available.</p>{fallback}</>}>
      <Suspense fallback={fallback}><Viewer {...props} /></Suspense>
    </ViewerBoundary> : fallback}
  </div>;
}
