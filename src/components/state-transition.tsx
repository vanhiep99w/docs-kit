'use client';

import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from 'react';
import { STATE_TRANSITION_HISTORY_LIMIT, traceStateTransitions, validateStateTransition, type ExplorerTransition, type StateTransitionData } from '../state-transition/data.js';

export type { StateTransitionData, ExplorerState, ExplorerTransition } from '../state-transition/data.js';
export type StateTransitionExplorerProps = { data: StateTransitionData; className?: string };
const EMPTY_PATH: readonly string[] = [];

/** Manual traversal of authored branches; no guard interpreter, timers, context mutation or side effects. */
export function StateTransitionExplorer({ data, className }: StateTransitionExplorerProps) {
  const model = useMemo(() => {
    validateStateTransition(data);
    return { states: new Map(data.states.map((state) => [state.id, state])), transitions: new Map(data.transitions.map((transition) => [transition.id, transition])) };
  }, [data]);
  const uid = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const reference = useRef<HTMLDetailsElement>(null);
  const [ready, setReady] = useState(false);
  const [selection, setSelection] = useState<{ data: StateTransitionData; path: string[] } | null>(null);
  const path = selection?.data === data ? selection.path : EMPTY_PATH;
  const trace = useMemo(() => traceStateTransitions(data, path), [data, path]);
  const current = model.states.get(trace.current)!;
  const choices = data.transitions.filter((transition) => transition.from === current.id);
  const last = trace.entries.at(-1)?.transition;
  const capped = path.length >= STATE_TRANSITION_HISTORY_LIMIT;
  useEffect(() => { setReady(true); }, []);
  const transitionId = (id: string) => `${uid}-transition-${data.transitions.findIndex((transition) => transition.id === id)}`;
  const stateId = (id: string) => `${uid}-state-${data.states.findIndex((state) => state.id === id)}`;

  function choose(transition: ExplorerTransition) {
    if (capped || transition.from !== current.id) return;
    setSelection((previous) => {
      const previousPath = previous?.data === data ? previous.path : [];
      const previousState = previousPath.length ? model.transitions.get(previousPath.at(-1)!)!.to : data.initial;
      if (previousPath.length >= STATE_TRANSITION_HISTORY_LIMIT || transition.from !== previousState) return previous;
      return { data, path: [...previousPath, transition.id] };
    });
    // The chosen button may disappear in the next state. Keep keyboard focus on a stable heading.
    heading.current?.focus({ preventScroll: true });
  }
  function back() {
    setSelection((previous) => {
      const previousPath = previous?.data === data ? previous.path : [];
      return previousPath.length ? { data, path: previousPath.slice(0, -1) } : previous;
    });
  }
  function reset() { setSelection(null); }
  function reveal(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (reference.current) reference.current.open = true;
  }
  function explanation(transition: ExplorerTransition, guardId?: string) {
    return <>
      <p>{transition.description}</p>
      <p id={guardId} className="state-transition-guard"><strong>{transition.guard ? 'Giả định điều kiện thỏa: ' : 'Không khai báo điều kiện.'}</strong>{transition.guard}</p>
      {!!transition.effects?.length && <div className="state-transition-effects"><span>Side effects được mô tả, không thực thi:</span><ul>{transition.effects.map((effect, index) => <li key={index}>{effect}</li>)}</ul></div>}
    </>;
  }

  return <figure className={['state-transition', 'not-prose', className].filter(Boolean).join(' ')} aria-labelledby={`${uid}-title`}>
    <figcaption className="state-transition-header"><span id={`${uid}-title`}>{data.title}</span><small>Mô hình minh họa</small></figcaption>
    <section className="state-transition-current" aria-labelledby={`${uid}-current`}>
      <div className="state-transition-current-heading"><h3 id={`${uid}-current`} ref={heading} tabIndex={-1}>Hiện tại: {current.label}</h3><span>{current.id === data.initial ? 'Trạng thái đầu' : current.terminal ? 'Kết thúc (khai báo)' : 'Đang khám phá'}{current.id === data.initial && current.terminal ? ' · Kết thúc (khai báo)' : ''}</span></div>
      {current.description && <p>{current.description}</p>}
      <div className="state-transition-controls" hidden={!ready}>
        <button type="button" aria-disabled={!path.length} onClick={back}>← Quay lại</button>
        <button type="button" aria-disabled={!path.length} onClick={reset}>Về ban đầu</button>
        <span role="status" aria-label="Trạng thái mô hình" aria-live="polite">{current.label} · {path.length} chuyển đã chọn</span>
      </div>
    </section>
    {last && <section className="state-transition-last" aria-labelledby={`${uid}-last`}>
      <h3 className="state-transition-sr-only" id={`${uid}-last`}>Chuyển trạng thái vừa chọn</h3>
      <p className="state-transition-route"><span>{model.states.get(last.from)!.label}</span><strong>— {last.event} →</strong><span>{model.states.get(last.to)!.label}</span></p>
      {last.label && <span className="state-transition-branch">{last.label}</span>}<details className="state-transition-choice-info"><summary>Giải thích</summary>{explanation(last)}</details>
    </section>}
    <div className="state-transition-layout">
      <section className="state-transition-choices" aria-labelledby={`${uid}-choices`}>
        <h3 className="state-transition-sr-only" id={`${uid}-choices`}>Chọn event / nhánh tiếp theo</h3>
        {capped && <p className="state-transition-limit" role="status">Đã đạt {STATE_TRANSITION_HISTORY_LIMIT} chuyển. Quay lại hoặc về ban đầu để tiếp tục; lịch sử không bị cắt âm thầm.</p>}
        {choices.length ? <><ul>{choices.map((transition) => <li key={transition.id} data-transition-choice={transition.id}>
            <div className="state-transition-choice-heading">
              <span hidden={ready}>{transition.event} → {model.states.get(transition.to)!.label}</span>
              <button type="button" hidden={!ready} aria-disabled={capped} aria-describedby={`${transitionId(transition.id)}-guard`} aria-label={`Chọn ${transition.event} → ${model.states.get(transition.to)!.label} (${transition.id})`} onClick={() => choose(transition)}>{transition.event}<small>→ {model.states.get(transition.to)!.label}</small></button>
              {transition.label && <span className="state-transition-branch">{transition.label}</span>}
            </div>
            <p id={`${transitionId(transition.id)}-guard`} className={transition.guard ? 'state-transition-guard' : 'state-transition-sr-only'}>{transition.guard ? `Giả định: ${transition.guard}` : 'Không khai báo điều kiện.'}</p>
            <details className="state-transition-choice-info"><summary>Giải thích</summary><p>{transition.description}</p>
              {!!transition.effects?.length && <ul aria-label="Side effects chỉ mô tả">{transition.effects.map((effect, index) => <li key={index}>{effect}</li>)}</ul>}
            </details>
          </li>)}</ul></> : <p className="state-transition-empty">{current.terminal ? 'Đây là trạng thái kết thúc do tác giả khai báo.' : 'Không có chuyển tiếp từ trạng thái này; không tự suy ra đây là trạng thái kết thúc.'}</p>}
      </section>
      <section className="state-transition-history" aria-labelledby={`${uid}-history`}>
        <h3 className="state-transition-sr-only" id={`${uid}-history`}>Đường đi đã chọn</h3><details><summary>Lịch sử · {path.length} chuyển</summary>
        <p className="state-transition-origin">Bắt đầu: {model.states.get(data.initial)!.label}</p>
        {trace.entries.length ? <ol>{trace.entries.map(({ step, transition }) => <li key={step}>
          <a href={`#${transitionId(transition.id)}`} aria-label={`Chi tiết bước ${step}: ${transition.event}`} onClick={reveal}><span>{step}</span><strong>{transition.event}</strong></a>
          <p>{model.states.get(transition.from)!.label} → {model.states.get(transition.to)!.label}</p>
          {transition.label && <small>{transition.label}</small>}
        </li>)}</ol> : <p className="state-transition-empty">Chưa chọn chuyển trạng thái nào.</p>}
        <p className="state-transition-history-notice">Lịch sử thao tác đọc mô hình, không phải log thực thi hệ thống. Quay lại chỉ bỏ lựa chọn cuối, không hoàn tác side effect thật.</p></details>
      </section>
    </div>
    <details className="state-transition-info"><summary>Giả định và cách đọc</summary>
      {data.description && <p>{data.description}</p>}<p><strong>Giả định mô hình: </strong>{data.assumptions}</p>
      <p>Chọn nhánh là giả định điều kiện của nhánh đó thỏa. Không đánh giá guard, chạy side effect hoặc tự phát event theo thời gian.</p>
    </details>
    <details className="state-transition-reference" ref={reference}><summary>Tra cứu toàn bộ trạng thái và chuyển tiếp</summary>
      <dl className="state-transition-states" aria-label="Các trạng thái">{data.states.map((state) => <div key={state.id} id={stateId(state.id)} data-current={state.id === current.id}>
        <dt>{state.label} <small>{state.id === data.initial ? 'Đầu · ' : ''}{state.terminal ? 'Kết thúc · ' : ''}{state.id === current.id ? 'Đang chọn · ' : ''}{state.id}</small></dt>
        <dd>{state.description ?? 'Không có mô tả bổ sung.'}</dd>
      </div>)}</dl>
      <div className="state-transition-table-scroll" tabIndex={0} role="region" aria-label="Bảng chuyển trạng thái đầy đủ">
        <table><caption>{data.title} · Các nhánh được khai báo, không tự đánh giá điều kiện</caption><thead><tr><th scope="col">Từ</th><th scope="col">Event / nhánh</th><th scope="col">Đến</th><th scope="col">Điều kiện và giải thích</th></tr></thead>
          <tbody>{data.transitions.map((transition) => <tr key={transition.id} id={transitionId(transition.id)}>
            <td><a href={`#${stateId(transition.from)}`}>{model.states.get(transition.from)!.label}</a></td>
            <th scope="row">{transition.event}<small>{transition.label ?? transition.id}</small></th>
            <td><a href={`#${stateId(transition.to)}`}>{model.states.get(transition.to)!.label}</a></td>
            <td>{explanation(transition)}</td>
          </tr>)}</tbody>
        </table>
        {!data.transitions.length && <p className="state-transition-empty">Mô hình không khai báo chuyển trạng thái nào.</p>}
      </div>
    </details>
  </figure>;
}
