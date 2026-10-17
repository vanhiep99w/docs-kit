'use client';

import { useId, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { formatConcurrencyTime, layoutConcurrencyLanes, type ConcurrencyLanesData, type ConcurrencyPosition } from '../concurrency-lanes/data.js';

export type { ConcurrencyLanesData, ConcurrencyLane, ConcurrencyEvent, ConcurrencyInterval, ConcurrencyRelation } from '../concurrency-lanes/data.js';
export type ConcurrencyLanesProps = { data: ConcurrencyLanesData; className?: string };
const kindLabels = { work: 'Thực thi', wait: 'Chờ', hold: 'Giữ tài nguyên' };

function relationPath(from: ConcurrencyPosition, to: ConcurrencyPosition): string {
  if (from.y === to.y) {
    const direction = to.x >= from.x ? 1 : -1;
    return `M${from.x + direction * 14} ${from.y} C${from.x + direction * 24} ${from.y - 25} ${to.x - direction * 24} ${to.y - 25} ${to.x - direction * 16} ${to.y}`;
  }
  const direction = to.y > from.y ? 1 : -1;
  const middle = (from.y + to.y) / 2;
  return `M${from.x} ${from.y + direction * 14} C${from.x} ${middle} ${to.x} ${middle} ${to.x} ${to.y - direction * 16}`;
}

/** Authored event/interval lanes, not a scheduler or a formal happens-before verifier. */
export function ConcurrencyLanes({ data, className }: ConcurrencyLanesProps) {
  const layout = useMemo(() => layoutConcurrencyLanes(data), [data]);
  const uid = useId();
  const reference = useRef<HTMLDetailsElement>(null);
  const details = useRef(new Map<string, HTMLDetailsElement>());
  const [selection, setSelection] = useState<{ data: ConcurrencyLanesData; id: string } | null>(null);
  const selected = selection?.data === data ? selection.id : undefined;
  const all = [...data.events, ...(data.intervals ?? [])];
  const positions = new Map(layout.items.map((item) => [item.id, item]));
  const byId = new Map(all.map((item) => [item.id, item]));
  const number = (id: string) => positions.get(id)!.number;
  const targetId = (id: string) => `${uid}-item-${all.findIndex((item) => item.id === id)}`;
  const relationId = (id: string) => `${uid}-relation-${data.relations!.findIndex((relation) => relation.id === id)}`;
  const time = (at: number) => `${formatConcurrencyTime(at)} ${data.unit === 'step' ? 'bước' : data.unit}`;
  const ticks = [...new Set([0, 1, 2, 3, 4].map((tick) => data.unit === 'step' ? Math.round(layout.extent * tick / 4) : layout.extent * tick / 4))];
  function reveal(event: MouseEvent, id: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (reference.current) reference.current.open = true;
    setSelection({ data, id });
    const target = details.current.get(id);
    if (target) target.open = true;
  }
  function related(id: string) {
    return selected === id || !!data.relations?.some((relation) => relation.id === selected && (relation.from === id || relation.to === id));
  }

  return <figure className={['concurrency-lanes', 'not-prose', className].filter(Boolean).join(' ')} aria-labelledby={`${uid}-title`}>
    <figcaption className="concurrency-lanes-header"><span id={`${uid}-title`}>{data.title}</span><small>{data.provenance.kind === 'illustrative' ? 'Dữ liệu minh họa' : 'Dữ liệu đo thực tế'} · {data.unit === 'step' ? 'bước logic' : data.unit}</small></figcaption>
    <div className="concurrency-lanes-legend" aria-label="Ký hiệu timeline"><span>○ Sự kiện</span><span>━ Thực thi</span><span>┄ Chờ</span><span>═ Giữ tài nguyên</span><span>→ Quan hệ khai báo</span></div>
    <div className="concurrency-lanes-scroll" tabIndex={0} role="region" aria-label={`Timeline: ${data.title}`}>
      <div className="concurrency-lanes-chart">
        <div className="concurrency-lanes-ruler"><span>{data.unit === 'step' ? 'Bước logic →' : `${data.unit} →`}</span><svg width={layout.width} height={36} aria-hidden="true">
          {ticks.map((tick) => <g key={tick} transform={`translate(${24 + tick / layout.extent * (layout.width - 48)} 0)`}><text y={15} textAnchor={tick === 0 ? 'start' : tick === layout.extent ? 'end' : 'middle'}>{formatConcurrencyTime(tick)}</text><line y1={22} y2={30} /></g>)}
        </svg></div>
        <div className="concurrency-lanes-body"><div className="concurrency-lanes-labels">{layout.lanes.map((lane, index) => <div key={lane.id} style={{ height: lane.height, '--lane-color': `var(--concurrency-color-${index % 4})` } as CSSProperties} data-lane={lane.id}>
          <span title={data.lanes[index].label}>{data.lanes[index].label}</span><small>{lane.id}</small>
        </div>)}</div>
          <svg className="concurrency-lanes-svg" width={layout.width} height={layout.height} aria-label="Sự kiện, khoảng và liên kết" role="group">
            <defs><marker id={`${uid}-arrow`} viewBox="0 0 8 8" refX={7} refY={4} markerWidth={7} markerHeight={7} orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 8 4 0 8Z" /></marker></defs>
            {ticks.map((tick) => <line className="concurrency-lanes-gridline" key={tick} x1={24 + tick / layout.extent * (layout.width - 48)} x2={24 + tick / layout.extent * (layout.width - 48)} y1={0} y2={layout.height} />)}
            {layout.lanes.map((lane) => <line className="concurrency-lanes-divider" key={lane.id} x1={0} x2={layout.width} y1={lane.top + lane.height} y2={lane.top + lane.height} />)}
            {data.relations?.map((relation, index) => <a key={relation.id} href={`#${relationId(relation.id)}`} aria-label={`Quan hệ R${index + 1}: ${relation.label}`} onClick={(event) => reveal(event, relation.id)}>
              <path className="concurrency-lanes-relation-hit" d={relationPath(positions.get(relation.from)!, positions.get(relation.to)!)} />
              <path className="concurrency-lanes-relation" data-relation={relation.id} data-selected={selected === relation.id || selected === relation.from || selected === relation.to}
                d={relationPath(positions.get(relation.from)!, positions.get(relation.to)!)} markerEnd={`url(#${uid}-arrow)`}><title>{`R${index + 1}: ${relation.label} · #${number(relation.from)} → #${number(relation.to)}`}</title></path>
            </a>)}
            {layout.items.map((position) => {
              const item = byId.get(position.id)!;
              const interval = 'kind' in item ? item : undefined;
              const center = (position.x + position.endX) / 2;
              const laneIndex = data.lanes.findIndex((lane) => lane.id === item.lane);
              return <a key={item.id} href={`#${targetId(item.id)}`} aria-label={`#${position.number}: ${item.label}`} aria-current={selected === item.id ? 'true' : undefined} onClick={(event) => reveal(event, item.id)}>
                <g className="concurrency-lanes-item" data-item={item.id} data-kind={interval?.kind ?? 'event'} data-selected={related(item.id)} style={{ '--lane-color': `var(--concurrency-color-${laneIndex % 4})` } as CSSProperties}>
                  <title>{`${item.label} · ${interval ? `${time(interval.start)}–${time(interval.end)} · ${kindLabels[interval.kind]}` : time('at' in item ? item.at : 0)}`}</title>
                  {interval && <rect className="concurrency-lanes-interval" x={position.x} y={position.y - 5} width={Math.max(1, position.endX - position.x)} height={10} />}
                  {interval ? <rect className="concurrency-lanes-badge" x={center - 14} y={position.y - 11} width={28} height={22} rx={3} /> : <circle className="concurrency-lanes-badge" cx={position.x} cy={position.y} r={13} />}
                  <text x={center} y={position.y} textAnchor="middle" dominantBaseline="central">{position.number}</text>
                </g>
              </a>;
            })}
          </svg>
        </div>
      </div>
    </div>
    <details className="concurrency-lanes-reference" ref={reference}><summary>Sự kiện và quan hệ</summary>
    {!!data.relations?.length && <section className="concurrency-lanes-relations" aria-labelledby={`${uid}-relations`}><h3 id={`${uid}-relations`}>Quan hệ được khai báo</h3>
      {data.relations.map((relation, index) => <details key={relation.id} id={relationId(relation.id)} data-relation-detail={relation.id} data-selected={selected === relation.id}
        ref={(node) => { if (node) details.current.set(relation.id, node); else details.current.delete(relation.id); }}>
        <summary onClick={() => setSelection({ data, id: relation.id })}>R{index + 1} · {relation.label}</summary><p><a href={`#${targetId(relation.from)}`} onClick={(event) => reveal(event, relation.from)}>#{number(relation.from)} {byId.get(relation.from)!.label}</a> → <a href={`#${targetId(relation.to)}`} onClick={(event) => reveal(event, relation.to)}>#{number(relation.to)} {byId.get(relation.to)!.label}</a></p><p>{relation.description}</p>
      </details>)}
    </section>}
    <section className="concurrency-lanes-details" aria-labelledby={`${uid}-items`}><h3 id={`${uid}-items`}>Sự kiện và khoảng</h3>
      {data.lanes.map((lane) => <section key={lane.id} aria-labelledby={`${uid}-lane-${data.lanes.indexOf(lane)}`}>
        <h4 id={`${uid}-lane-${data.lanes.indexOf(lane)}`}>{lane.label}</h4>
        {lane.description && <p className="concurrency-lanes-lane-description">{lane.description}</p>}
        {layout.items.filter((position) => position.lane === lane.id).map((position) => {
          const item = byId.get(position.id)!;
          return <details key={item.id} id={targetId(item.id)} data-detail={item.id} data-selected={related(item.id)} ref={(node) => { if (node) details.current.set(item.id, node); else details.current.delete(item.id); }}>
            <summary onClick={() => setSelection({ data, id: item.id })}><span className="concurrency-lanes-number">{position.number}</span>{item.label}<small>{'at' in item ? time(item.at) : `${time(item.start)}–${time(item.end)} · ${kindLabels[item.kind]}`}</small></summary>
            <p>{item.description ?? 'Không có giải thích bổ sung.'}</p><p className="concurrency-lanes-item-id">ID: {item.id}{'start' in item ? ` · Độ dài: ${time(item.end - item.start)}` : ''}</p>
          </details>;
        })}
        {!all.some((item) => item.lane === lane.id) && <p className="concurrency-lanes-empty">Không có mục trong lane này.</p>}
      </section>)}
    </section>
    </details>
    <details className="concurrency-lanes-table"><summary>Bảng timeline đầy đủ</summary><div tabIndex={0} role="region" aria-label="Bảng concurrency lanes">
      <table><caption>{data.title} · {data.unit === 'step' ? 'Bước logic, không phải thời gian vật lý' : data.unit}</caption><thead><tr><th scope="col">Mục</th><th scope="col">Lane</th><th scope="col">Loại</th><th scope="col">Bắt đầu / mốc</th><th scope="col">Kết thúc</th></tr></thead>
        <tbody>{layout.items.map((position) => { const item = byId.get(position.id)!; return <tr key={item.id}><th scope="row">#{position.number} {item.label}<small>{item.id}</small></th><td>{data.lanes.find((lane) => lane.id === item.lane)!.label}</td><td>{'kind' in item ? kindLabels[item.kind] : 'Sự kiện'}</td><td>{time('at' in item ? item.at : item.start)}</td><td>{'end' in item ? time(item.end) : '—'}</td></tr>; })}</tbody>
      </table></div></details>
    <details className="concurrency-lanes-info"><summary>Về mô hình</summary>{data.description && <p>{data.description}</p>}<p>{data.provenance.description}</p>
    <p className="concurrency-lanes-notice">{data.unit === 'step' ? 'Trục bước logic, không phải thời gian vật lý.' : 'Thời gian tương đối từ mốc 0.'} Vị trí trái/phải không tự tạo happens-before. Mũi tên chỉ là quan hệ tác giả khai báo.{layout.end === 0 && ' Tất cả ở mốc 0; miền 0–1 chỉ dùng để hiển thị.'}</p>
    </details>
  </figure>;
}
