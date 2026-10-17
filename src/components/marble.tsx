import { useId } from 'react';
import {
  describeMarbleToken, marbleSymbols, marbleSyntaxLabels, prepareMarbleDiagram,
  type MarbleDiagramData, type MarbleToken, type MarbleTokenType,
} from '../marble/data.js';

export type { MarbleDiagramData, MarbleRow, MarbleAnnotation, MarbleToken, MarbleTokenType } from '../marble/data.js';

/** Direct props preserve the existing rxjs-learn JSX API; data is used by remark. */
export type MarbleDiagramProps = (MarbleDiagramData | { data: MarbleDiagramData }) & { className?: string; /** Frame spacing only, 36–96 pixels. */ frameWidth?: number };

const PADDING = 24;
const STACK_HEIGHT = 34;
const legendOrder: MarbleTokenType[] = ['next', 'complete', 'error', 'subscribe', 'unsubscribe'];

function Marker({ token, y, color, values, order, frameWidth }: {
  token: MarbleToken; y: number; color: number; values?: Readonly<Record<string, string>>; order: number; frameWidth: number;
}) {
  const x = PADDING + token.frame * frameWidth;
  return <g className={`marble-token marble-token--${token.type}`} data-frame={token.frame} data-type={token.type}
    data-order={order} data-color={color} transform={`translate(${x} ${y})`}>
    <title>{`Frame ${token.frame}: ${describeMarbleToken(token, values)}`}</title>
    {token.type === 'next' && <><circle r={14} /><text textAnchor="middle" dominantBaseline="central">{token.value}</text></>}
    {token.type === 'complete' && <line x1={0} x2={0} y1={-14} y2={14} />}
    {token.type === 'error' && <><circle r={13} /><path d="M-5-5 5 5 M5-5-5 5" /></>}
    {token.type === 'subscribe' && <path d="M0 14 V-14 M-6-7 0-14 6-7" />}
    {token.type === 'unsubscribe' && <><path d="M0-14 V4" /><circle className="marble-unsubscribe-dot" cy={12} r={2} /></>}
  </g>;
}

/** Server-first SVG + native text disclosure. No client hooks, observers or RxJS runtime. */
export function MarbleDiagram(props: MarbleDiagramProps) {
  const { className, frameWidth = 48, ...direct } = props;
  if (!Number.isFinite(frameWidth) || frameWidth < 36 || frameWidth > 96) throw new Error('Marble Diagram: frameWidth must be between 36 and 96 pixels.');
  const data = 'data' in direct ? direct.data : direct;
  const { rows, frameCount } = prepareMarbleDiagram(data);
  const uid = useId();
  const titleId = `${uid}-title`;
  const width = PADDING * 2 + (frameCount - 1) * frameWidth + 24;
  const colors = new Map<string, number>();
  const used = new Set<MarbleTokenType>();
  for (const row of rows) for (const token of row.tokens) {
    used.add(token.type);
    if (token.value !== undefined && !colors.has(token.value)) colors.set(token.value, colors.size % 4);
  }
  const tickStep = frameCount <= 21 ? 1 : 5;
  const ticks = Array.from({ length: frameCount }, (_, frame) => frame).filter((frame) => frame % tickStep === 0);

  return <figure className={['marble-diagram', 'not-prose', className].filter(Boolean).join(' ')} aria-labelledby={titleId}>
    <figcaption className="marble-header">
      <span id={titleId} className="marble-title">{data.title}</span>
      <span className="marble-scale">{data.frameLabel ?? 'Cột minh họa · 1 khoảng = 1 frame, không mặc định là ms'}</span>
    </figcaption>
    <div className="marble-scroller" tabIndex={0} role="region" aria-label={`Sơ đồ: ${data.title}`}>
      <div className="marble-grid">
        <div className="marble-lane marble-ruler">
          <span className="marble-row-label">Frame →</span>
          <svg aria-hidden="true" width={width} height={32}>
            {ticks.map((frame) => <g key={frame} transform={`translate(${PADDING + frame * frameWidth} 0)`}>
              <text textAnchor="middle" y={16}>{frame}</text><line y1={22} y2={28} />
            </g>)}
          </svg>
        </div>
        {rows.map((row, rowIndex) => {
          const groups = new Map<number, MarbleToken[]>();
          row.tokens.forEach((token) => groups.set(token.frame, [...(groups.get(token.frame) ?? []), token]));
          const depth = Math.max(1, ...Array.from(groups.values(), (group) => group.length));
          const height = Math.max(52, depth * STACK_HEIGHT + 16);
          const baseline = height / 2;
          const annotations = data.annotations?.filter((annotation) => annotation.row === row.id) ?? [];
          return <div className={`marble-lane marble-lane--${row.kind ?? 'inner'}`} key={rowIndex} data-row={row.id ?? rowIndex + 1}>
            <div className="marble-row-label"><span>{row.label}</span>{row.kind && <small>{row.kind}</small>}</div>
            <svg className="marble-axis" aria-hidden="true" width={width} height={height}>
              {annotations.map((annotation) => <rect key={annotation.id} className="marble-annotation-band"
                x={PADDING + annotation.frames[0] * frameWidth - 17} y={4}
                width={(annotation.frames[1] - annotation.frames[0]) * frameWidth + 34} height={height - 8}>
                <title>{annotation.title}</title>
              </rect>)}
              <path className="marble-baseline" d={`M${PADDING} ${baseline} H${width - 12} m-7-5 7 5-7 5`} />
              {Array.from(groups.entries()).filter(([, group]) => group.length > 1).map(([frame, group]) =>
                <line key={frame} className="marble-group-link" x1={PADDING + frame * frameWidth} x2={PADDING + frame * frameWidth}
                  y1={baseline - (group.length - 1) * STACK_HEIGHT / 2} y2={baseline + (group.length - 1) * STACK_HEIGHT / 2} />)}
              {Array.from(groups.entries()).flatMap(([frame, group]) => group.map((token, order) => <Marker key={`${frame}-${order}`}
                token={token} y={baseline + (order - (group.length - 1) / 2) * STACK_HEIGHT} color={colors.get(token.value ?? '') ?? 0} values={data.values} order={order} frameWidth={frameWidth} />))}
            </svg>
          </div>;
        })}
      </div>
    </div>
    {data.caption && <p className="marble-caption">{data.caption}</p>}
    {(data.showLegend ?? true) && used.size > 0 && <div className="marble-syntax" aria-label="Chú thích ký hiệu">
      {legendOrder.filter((type) => used.has(type)).map((type) => <span key={type}><code>{marbleSymbols[type]}</code>{marbleSyntaxLabels[type]}</span>)}
    </div>}
    {data.values && <dl className="marble-values" aria-label="Ý nghĩa giá trị">
      {Object.entries(data.values).map(([value, description]) => <div key={value}><dt>{value}</dt><dd>{description}</dd></div>)}
    </dl>}
    {data.annotations && <ol className="marble-annotations" aria-label="Chú thích diễn biến">
      {data.annotations.map((annotation) => <li key={annotation.id}>
        <strong>{annotation.title}</strong>
        <span>{rows.find((row) => row.id === annotation.row)!.label} · Frame {annotation.frames[0]}{annotation.frames[1] !== annotation.frames[0] ? `–${annotation.frames[1]}` : ''}</span>
        <p>{annotation.description}</p>
      </li>)}
    </ol>}
    <details className="marble-text">
      <summary>Bảng sự kiện ({rows.length} lane)</summary>
      <p>Các sự kiện cùng frame được liệt kê theo thứ tự trong nhóm, không bị dịch sang thời điểm khác.</p>
      <div className="marble-table-scroll" tabIndex={0} role="region" aria-label="Bảng sự kiện marble">
        <table>
          <caption>{data.title} — diễn biến dạng text</caption>
          <thead><tr><th scope="col">Lane</th><th scope="col">Ký pháp</th><th scope="col">Sự kiện theo frame</th></tr></thead>
          <tbody>{rows.map((row, index) => <tr key={index}>
            <th scope="row">{row.label}</th><td><code>{row.marble || '(trống)'}</code></td>
            <td>{row.tokens.length ? <ol>{row.tokens.map((token, tokenIndex) => <li key={tokenIndex}>Frame {token.frame}: {describeMarbleToken(token, data.values)}</li>)}</ol>
              : 'Không có sự kiện trong cửa sổ này.'}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>
  </figure>;
}
