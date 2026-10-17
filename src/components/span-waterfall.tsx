'use client';

import { useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { DataInspector } from './data-inspector.js';
import { formatSpanTime, validatePreparedSpanWaterfall, waterfallExtent, waterfallRows, type PreparedSpanWaterfall } from '../span-waterfall/data.js';

export type { SpanWaterfallInput, PreparedSpanWaterfall, WaterfallSpan, SpanAnnotation } from '../span-waterfall/data.js';
export type SpanWaterfallProps = { data: PreparedSpanWaterfall; className?: string };
const statusLabels = { ok: 'OK', error: 'Lỗi', unset: 'Chưa xác định' };

/** A static, authored timeline: no tracing backend, clock correction or critical-path inference. */
export function SpanWaterfall({ data, className }: SpanWaterfallProps) {
  const rows = useMemo(() => { validatePreparedSpanWaterfall(data); return waterfallRows(data.spans); }, [data]);
  const uid = useId();
  const detailList = useRef<HTMLDetailsElement>(null);
  const details = useRef(new Map<string, HTMLDetailsElement>());
  const [selection, setSelection] = useState<{ data: PreparedSpanWaterfall; id: string } | null>(null);
  const selected = selection?.data === data ? selection.id : undefined;
  const extent = waterfallExtent(data.spans);
  const end = Math.max(...data.spans.map((span) => span.start + span.duration));
  const services = [...new Set(rows.map(({ span }) => span.service))];
  const detailId = (id: string) => `${uid}-span-${data.spans.findIndex((span) => span.id === id)}`;
  const time = (value: number) => `${formatSpanTime(value)} ${data.unit}`;
  function select(id: string) {
    if (detailList.current) detailList.current.open = true;
    setSelection({ data, id });
    const target = details.current.get(id);
    if (target) target.open = true;
  }

  return <figure className={['span-waterfall', 'not-prose', className].filter(Boolean).join(' ')} aria-labelledby={`${uid}-title`}>
    <figcaption className="span-waterfall-header">
      <span id={`${uid}-title`}>{data.title}</span><small>{data.provenance.kind === 'illustrative' ? 'Trace minh họa' : 'Trace đo thực tế'} · {time(end)}</small>
    </figcaption>
    <div className="span-waterfall-scroll" tabIndex={0} role="region" aria-label="Timeline span, cuộn ngang trên màn hình hẹp">
      <div className="span-waterfall-chart">
        <div className="span-waterfall-axis" aria-hidden="true"><span>Span / service</span><div>{[0, 1, 2, 3, 4].map((tick) => <span key={tick} style={{ left: `${tick * 25}%` }}>{time(extent * tick / 4)}</span>)}</div><span>Thời lượng</span></div>
        <ol className="span-waterfall-rows" aria-label="Các span theo phân cấp">
          {rows.map(({ span, depth }) => {
            const status = span.status ?? 'unset';
            return <li key={span.id} data-span={span.id} data-selected={selected === span.id} data-status={status} style={{ '--span-depth': depth, '--span-service': `var(--waterfall-service-${services.indexOf(span.service) % 6})` } as CSSProperties}>
              <a href={`#${detailId(span.id)}`} className="span-waterfall-label" aria-current={selected === span.id ? 'true' : undefined} onClick={() => select(span.id)}>
                <span>{span.name}</span><small>{span.service} · {statusLabels[status]}</small>
                <span className="span-waterfall-sr-only">Bắt đầu {time(span.start)}, thời lượng {time(span.duration)}, cấp {depth}.</span>
              </a>
              <div className="span-waterfall-track" aria-hidden="true">
                <span className="span-waterfall-bar" data-zero={span.duration === 0} style={{ left: `${span.start / extent * 100}%`, width: `${span.duration / extent * 100}%` }} />
              </div>
              <span className="span-waterfall-duration" aria-hidden="true">{time(span.duration)}</span>
            </li>;
          })}
        </ol>
      </div>
    </div>
    {data.annotations && <ol className="span-waterfall-annotations" aria-label="Chú thích span">{data.annotations.map((annotation) => <li key={annotation.id}>
      <a href={`#${detailId(annotation.span)}`} onClick={() => select(annotation.span)}>{annotation.title}</a><p>{annotation.description}</p>
    </li>)}</ol>}
    <details className="span-waterfall-detail-list" ref={detailList}><summary>Chi tiết span</summary><section className="span-waterfall-details" aria-labelledby={`${uid}-details-title`}>
      <h3 className="span-waterfall-sr-only" id={`${uid}-details-title`}>Chi tiết span</h3>
      {rows.map(({ span }) => <details key={span.id} id={detailId(span.id)} data-detail={span.id} data-selected={selected === span.id}
        ref={(node) => { if (node) details.current.set(span.id, node); else details.current.delete(span.id); }}>
        <summary>{span.name} <small>{span.service} · {statusLabels[span.status ?? 'unset']} · {time(span.duration)}</small></summary>
        <dl><div><dt>ID</dt><dd>{span.id}</dd></div><div><dt>Cha</dt><dd>{span.parent ?? 'Không có (root)'}</dd></div>
          <div><dt>Bắt đầu</dt><dd>{time(span.start)}</dd></div><div><dt>Kết thúc</dt><dd>{time(span.start + span.duration)}</dd></div></dl>
        {span.description && <p>{span.description}</p>}
        {span.attributes ? <DataInspector embedded key={span.id} data={span.attributes} /> : <p className="span-waterfall-empty">Không khai báo attributes.</p>}
      </details>)}
    </section></details>
    <details className="span-waterfall-table-disclosure"><summary>Bảng thời gian đầy đủ</summary>
      <div className="span-waterfall-table-scroll" tabIndex={0} role="region" aria-label="Bảng thời gian span">
        <table><caption>{data.title} · {data.unit} từ mốc 0</caption><thead><tr><th scope="col">Span / ID</th><th scope="col">Cha</th><th scope="col">Service</th><th scope="col">Bắt đầu</th><th scope="col">Thời lượng</th><th scope="col">Kết thúc</th><th scope="col">Trạng thái</th></tr></thead>
          <tbody>{rows.map(({ span }) => <tr key={span.id}><th scope="row">{span.name}<small>{span.id}</small></th><td>{span.parent ?? '—'}</td><td>{span.service}</td><td>{time(span.start)}</td><td>{time(span.duration)}</td><td>{time(span.start + span.duration)}</td><td>{statusLabels[span.status ?? 'unset']}</td></tr>)}</tbody>
        </table>
      </div>
    </details>
    <details className="span-waterfall-info"><summary>Về trace</summary>
      {data.description && <p>{data.description}</p>}<p>{data.provenance.description}</p>
    <p className="span-waterfall-notice">Thời gian tương đối từ mốc 0; không cộng thời lượng các span chồng nhau. Quan hệ cha/con không khẳng định thứ tự nhân quả.{end === 0 && ` Tất cả span ở mốc 0; trục 0–1 ${data.unit} chỉ là scale hiển thị.`}</p>
    <ul className="span-waterfall-legend" aria-label="Services">{services.map((service, index) => <li key={service} style={{ '--span-service': `var(--waterfall-service-${index % 6})` } as CSSProperties}>
      <i aria-hidden="true" />{service}
    </li>)}</ul>
    </details>
  </figure>;
}
