'use client';

import { useEffect, useId, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { AnnotatedExample } from './annotated-example.js';
import { validateCodeWalkthrough, walkthroughExample, type CodeWalkthroughData, type WalkthroughSnapshot } from '../annotated-example/walkthrough-data.js';

export type { CodeWalkthroughData, WalkthroughSnapshot, WalkthroughStep } from '../annotated-example/walkthrough-data.js';
export type CodeWalkthroughProps = {
  data: CodeWalkthroughData;
  className?: string;
  /** Optional host adapter. Default snapshot links use Annotated Example's URL fallback. */
  renderSourceLink?: (snapshot: WalkthroughSnapshot) => ReactNode;
};

/** Step navigation over Annotated Example, not a second code renderer or a runnable playground. */
export function CodeWalkthrough({ data, className, renderSourceLink }: CodeWalkthroughProps) {
  const examples = useMemo(() => {
    validateCodeWalkthrough(data);
    return data.snapshots.map((snapshot) => walkthroughExample(data, snapshot));
  }, [data]);
  const uid = useId();
  const panels = useRef(new Map<string, HTMLDetailsElement>());
  const [selection, setSelection] = useState<{ data: CodeWalkthroughData; index: number } | null>(null);
  const [ready, setReady] = useState(false);
  const index = selection?.data === data ? selection.index : 0;
  const active = data.steps[index];
  const firstSnapshot = data.steps[0].snapshot;
  const snapshotId = (id: string) => `${uid}-snapshot-${data.snapshots.findIndex((snapshot) => snapshot.id === id)}`;
  useEffect(() => { setReady(true); }, []);
  useEffect(() => {
    for (const [id, panel] of panels.current) panel.open = id === firstSnapshot;
  }, [data, firstSnapshot]);

  function navigate(next: number) {
    if (next < 0 || next >= data.steps.length) return;
    const step = data.steps[next];
    for (const [id, panel] of panels.current) panel.open = id === step.snapshot;
    setSelection({ data, index: next });
  }
  function select(event: MouseEvent<HTMLAnchorElement>, next: number) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(next);
  }

  return <figure className={['code-walkthrough', 'not-prose', className].filter(Boolean).join(' ')} aria-labelledby={`${uid}-title`}>
    <figcaption className="code-walkthrough-sr-only" id={`${uid}-title`}>{data.title}</figcaption>
    <nav className="code-walkthrough-nav" aria-label="Các bước walkthrough">
      <div className="code-walkthrough-controls" hidden={!ready}>
        <button type="button" aria-disabled={index === 0} onClick={() => navigate(index - 1)} aria-label="← Bước trước" title="Bước trước">←</button>
        <p role="status" aria-label="Bước đang chọn" aria-live="polite"><span className="code-walkthrough-sr-only">Bước </span>{index + 1}/{data.steps.length}<span className="code-walkthrough-sr-only"> · {active.title}</span></p>
        <button type="button" aria-disabled={index === data.steps.length - 1} onClick={() => navigate(index + 1)} aria-label="Bước sau →" title="Bước sau">→</button>
      </div>
      <ol>{data.steps.map((step, stepIndex) => <li key={step.id} data-step={step.id} data-selected={index === stepIndex}>
        <a href={`#${snapshotId(step.snapshot)}`} aria-controls={snapshotId(step.snapshot)} aria-current={index === stepIndex ? 'step' : undefined} onClick={(event) => select(event, stepIndex)}>
          <span className="code-walkthrough-step-number" aria-hidden="true">{stepIndex + 1}</span><span>{step.title}<small>{data.snapshots.find((snapshot) => snapshot.id === step.snapshot)!.title} · Dòng {step.ranges.map(([start, end]) => start === end ? start : `${start}–${end}`).join(', ')}</small></span>
        </a>
      </li>)}</ol>
    </nav>
    <div className="code-walkthrough-snapshots">{data.snapshots.map((snapshot, snapshotIndex) => <details key={snapshot.id} id={snapshotId(snapshot.id)} data-snapshot={snapshot.id} open={snapshot.id === firstSnapshot}
      ref={(node) => { if (node) panels.current.set(snapshot.id, node); else panels.current.delete(snapshot.id); }}>
      <summary>{snapshot.title}</summary>
      <AnnotatedExample data={examples[snapshotIndex]} activeAnnotation={active.snapshot === snapshot.id ? active.id : null}
        onAnnotationSelect={(id) => navigate(data.steps.findIndex((step) => step.id === id))} sourceLink={renderSourceLink?.(snapshot)} />
    </details>)}</div>
    <details className="code-walkthrough-info"><summary>Về walkthrough</summary><strong>{data.title}</strong>{data.description && <p>{data.description}</p>}<p className="code-walkthrough-notice">Các bước và snapshot do tác giả biên soạn · Không chạy code hoặc tự suy ra thay đổi. Có thể mở từng snapshot để đọc toàn bộ chú thích.</p></details>
  </figure>;
}
