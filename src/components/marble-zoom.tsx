'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MarbleDiagram } from './marble.js';
import type { MarbleDiagramData } from '../marble/data.js';

export type MarbleZoomDiagramProps = (MarbleDiagramData | { data: MarbleDiagramData }) & { className?: string };
export type { MarbleDiagramData, MarbleRow, MarbleAnnotation } from '../marble/data.js';
const SPACING = [36, 48, 60, 72, 96] as const;

/** Opt-in shared-axis spacing controls. Static MarbleDiagram stays server-first. */
export function MarbleZoomDiagram(props: MarbleZoomDiagramProps) {
  const identity = 'data' in props ? props.data : props;
  const data = useMemo(() => {
    if ('data' in props) return props.data;
    const { className: _className, ...direct } = props;
    return direct;
  }, [identity]);
  const root = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ identity: object; frame: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [selection, setSelection] = useState<{ identity: object; index: number } | null>(null);
  const index = selection?.identity === identity ? selection.index : 1;
  const frameWidth = SPACING[index];
  useEffect(() => { setReady(true); }, []);
  useEffect(() => {
    const pending = anchor.current;
    if (!pending) return;
    anchor.current = null;
    if (pending.identity !== identity) return;
    const scroller = root.current?.querySelector<HTMLElement>('.marble-scroller');
    const label = root.current?.querySelector<HTMLElement>('.marble-row-label');
    if (scroller && label) {
      const area = Math.max(0, scroller.clientWidth - label.offsetWidth);
      scroller.scrollLeft = Math.max(0, pending.frame * frameWidth + 24 - area / 2);
    }
  }, [frameWidth, identity]);

  function change(next: number) {
    if (next < 0 || next >= SPACING.length || next === index) return;
    const scroller = root.current?.querySelector<HTMLElement>('.marble-scroller');
    const label = root.current?.querySelector<HTMLElement>('.marble-row-label');
    if (scroller && label) {
      const area = Math.max(0, scroller.clientWidth - label.offsetWidth);
      anchor.current = { identity, frame: (scroller.scrollLeft + area / 2 - 24) / frameWidth };
    }
    setSelection({ identity, index: next });
  }

  return <div className="marble-zoom" ref={root}>
    <div className="marble-zoom-controls" role="group" aria-label={`Thu phóng: ${data.title}`} hidden={!ready}>
      <button type="button" aria-disabled={index === 0} onClick={() => change(index - 1)}>Thu nhỏ</button>
      <span role="status" aria-label="Khoảng cách frame">{frameWidth / 48 * 100}% · {frameWidth}px/frame</span>
      <button type="button" aria-disabled={index === SPACING.length - 1} onClick={() => change(index + 1)}>Phóng to</button>
      <button type="button" aria-disabled={index === 1} onClick={() => change(1)}>Đặt lại</button>
      <small>Chỉ đổi khoảng cách frame, không đổi thời điểm hoặc kích thước marker.</small>
    </div>
    <MarbleDiagram data={data} className={props.className} frameWidth={frameWidth} />
  </div>;
}
