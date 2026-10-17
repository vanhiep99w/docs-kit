'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { validateCodeWalkthrough, type CodeWalkthroughData, type WalkthroughSnapshot } from '../code-walkthrough/data.js';
import { codeLines } from '../code/annotations.js';
import { writeSourceURL } from '../source-explorer/index.js';
import { codeTokenStyle } from './code-token-style.js';
import { CopyIcon } from './copy-icon.js';

export type { CodeWalkthroughData, WalkthroughSnapshot, WalkthroughStep } from '../code-walkthrough/data.js';
export type CodeWalkthroughProps = {
  data: CodeWalkthroughData;
  className?: string;
  renderSourceLink?: (snapshot: WalkthroughSnapshot) => ReactNode;
};

/** Authored snapshots in a quiet terminal-style code window; never executes code. */
export function CodeWalkthrough({ data, className, renderSourceLink }: CodeWalkthroughProps) {
  const snapshots = useMemo(() => {
    validateCodeWalkthrough(data);
    return data.snapshots.map((snapshot) => ({ ...snapshot, lines: codeLines(snapshot.code) }));
  }, [data]);
  const uid = useId();
  const viewports = useRef(new Map<string, HTMLPreElement>());
  const [selection, setSelection] = useState<{ data: CodeWalkthroughData; index: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('');
  const index = selection?.data === data ? selection.index : 0;
  const active = data.steps[index];
  const snapshot = snapshots.find((entry) => entry.id === active.snapshot)!;
  useEffect(() => { setReady(true); }, []);
  useEffect(() => { setStatus(''); }, [data, index]);
  useEffect(() => {
    const viewport = viewports.current.get(active.snapshot);
    const line = viewport?.querySelector<HTMLElement>(`[data-line="${active.ranges[0][0]}"]`);
    if (!viewport || !line) return;
    const top = line.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop;
    if (top < viewport.scrollTop || top + line.clientHeight > viewport.scrollTop + viewport.clientHeight) {
      viewport.scrollTop = Math.max(0, top - viewport.clientHeight / 3);
    }
  }, [active, data, ready]);
  function navigate(next: number) {
    if (next >= 0 && next < data.steps.length) setSelection({ data, index: next });
  }
  async function copy() {
    try { await navigator.clipboard.writeText(snapshot.code); setStatus('Đã sao chép code.'); }
    catch { setStatus('Không thể sao chép. Hãy chọn và sao chép code thủ công.'); }
  }
  const source = renderSourceLink ? renderSourceLink(snapshot) : snapshot.source
    ? <a href={writeSourceURL(new URL('https://source.invalid/'), snapshot.source).search}>Source ↗</a> : null;

  return <figure className={['code-walkthrough', 'not-prose', className].filter(Boolean).join(' ')} aria-labelledby={`${uid}-title`}>
    <figcaption className="code-walkthrough-header">
      <span className="code-walkthrough-window" aria-hidden="true"><i /><i /><i /></span>
      <span id={`${uid}-title`}>{snapshot.source?.file ?? snapshot.title}<span className="code-walkthrough-sr-only"> · {data.title}</span></span>
      <span className="code-walkthrough-actions">{source}<button type="button" hidden={!ready} aria-label="Sao chép code" title="Sao chép code" onClick={copy}><CopyIcon /></button></span>
    </figcaption>
    {snapshots.map((entry) => <pre key={entry.id} hidden={entry.id !== active.snapshot} data-snapshot={entry.id}
      className="code-walkthrough-code" tabIndex={0} role="region" aria-label={`Code: ${entry.title}`}
      ref={(node) => { if (node) viewports.current.set(entry.id, node); else viewports.current.delete(entry.id); }}>
      <code>{entry.lines.map((line, lineIndex) => <span key={lineIndex} className="code-walkthrough-line" data-line={lineIndex + 1}
        data-highlighted={entry.id === active.snapshot && active.ranges.some(([start, end]) => lineIndex + 1 >= start && lineIndex + 1 <= end) || undefined}>
        <span className="code-walkthrough-number" aria-hidden="true">{lineIndex + 1}</span><span>{entry.tokens
          ? entry.tokens[lineIndex].map((token, tokenIndex) => <span key={tokenIndex} className="code-walkthrough-token" style={codeTokenStyle(token, 'walkthrough')}>{token.content}</span>) : line}</span>
      </span>)}</code>
    </pre>)}
    <nav className="code-walkthrough-nav" aria-label="Các bước walkthrough" hidden={!ready}>
      <button type="button" disabled={index === 0} onClick={() => navigate(index - 1)} aria-label="Bước trước" title="Bước trước">←</button>
      <label className="code-walkthrough-picker"><span>{index + 1}/{data.steps.length}</span><select aria-label="Chọn bước" value={index} onChange={(event) => navigate(Number(event.target.value))}>
        {data.steps.map((step, stepIndex) => <option value={stepIndex} key={step.id}>{step.title}</option>)}
      </select></label>
      <button type="button" disabled={index === data.steps.length - 1} onClick={() => navigate(index + 1)} aria-label="Bước sau" title="Bước sau">→</button>
    </nav>
    <p className="code-walkthrough-note" role="status" aria-live="polite">{active.description}</p>
    <noscript><style>{`.code-walkthrough pre[hidden]{display:block}`}</style><ol>{data.steps.map((step) => <li key={step.id}>{step.title} · {data.snapshots.find((entry) => entry.id === step.snapshot)!.title} · {step.ranges.map(([start, end]) => `${start}–${end}`).join(', ')}<p>{step.description}</p></li>)}</ol></noscript>
    <span className="code-walkthrough-sr-only" role="status" aria-live="polite">{status}</span>
  </figure>;
}
