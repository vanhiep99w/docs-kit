'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { DataInspector } from './data-inspector.js';
import { formatProtocolMessage, protocolBodySource, validatePreparedProtocolExchange, type PreparedProtocolExchange, type PreparedProtocolBody, type ProtocolVariant } from '../protocol-exchange/data.js';

export type { ProtocolExchangeInput, PreparedProtocolExchange, ProtocolBodyInput, PreparedProtocolBody, ProtocolHeader, ProtocolRequest, ProtocolResponse, ProtocolVariant, ProtocolAnnotation } from '../protocol-exchange/data.js';
export type ProtocolExchangeProps = { data: PreparedProtocolExchange; className?: string };

/** Static HTTP-oriented examples, never an API client or a wire-format encoder. */
export function ProtocolExchange({ data, className }: ProtocolExchangeProps) {
  useMemo(() => { validatePreparedProtocolExchange(data); }, [data]);
  const uid = useId();
  const titleId = `${uid}-title`;
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('');
  useEffect(() => { setReady(true); }, []);
  useEffect(() => { setStatus(''); }, [data]);

  function targetId(variant: string, side: 'request' | 'response', target: string, header?: string) {
    const index = data.variants.findIndex((entry) => entry.id === variant);
    const headerIndex = header === undefined ? '' : `-${data.variants[index][side].headers!.findIndex((entry) => entry.id === header)}`;
    return `${uid}-variant-${index}-${side}-${target}${headerIndex}`;
  }

  async function copy(variant: ProtocolVariant<PreparedProtocolBody>, side: 'request' | 'response', bodyOnly = false) {
    try {
      const text = bodyOnly ? protocolBodySource(variant[side].body)! : formatProtocolMessage(variant, side);
      await navigator.clipboard.writeText(text);
      setStatus(`Đã sao chép ${bodyOnly ? 'body ' : ''}${side} — ${variant.title}.`);
    } catch { setStatus('Không thể sao chép. Hãy chọn và sao chép nội dung thủ công.'); }
  }

  function message(variant: ProtocolVariant<PreparedProtocolBody>, side: 'request' | 'response') {
    const value = variant[side];
    const label = side === 'request' ? 'Request' : 'Response';
    const headingId = targetId(variant.id, side, 'title');
    const start = side === 'request' ? <>
      <span className="protocol-exchange-method">{variant.request.method}</span><code>{variant.request.url}</code>
    </> : <>
      <span className="protocol-exchange-status-code" data-class={Math.floor(variant.response.status / 100)}>{variant.response.status}</span>
      {variant.response.statusText && <span>{variant.response.statusText}</span>}
    </>;
    return <section className="protocol-exchange-message" aria-labelledby={headingId}>
      <div className="protocol-exchange-message-heading">
        <h3 id={headingId}>{label}</h3>
        <button type="button" hidden={!ready} aria-label={`Sao chép ${side} — ${variant.title}`} onClick={() => copy(variant, side)}>Sao chép {side}</button>
      </div>
      <div className="protocol-exchange-start" id={targetId(variant.id, side, 'start')}>{start}</div>
      {value.headers?.length ? <div className="protocol-exchange-headers-scroll" tabIndex={0} role="region" aria-label={`Headers ${side} — ${variant.title}`}>
        <table className="protocol-exchange-headers">
          <caption>Headers</caption>
          <thead><tr><th scope="col">Tên</th><th scope="col">Giá trị</th></tr></thead>
          <tbody>{value.headers.map((header) => <tr key={header.id} id={targetId(variant.id, side, 'header', header.id)}>
            <th scope="row"><code>{header.name}</code></th><td><code>{header.value || '(rỗng)'}</code></td>
          </tr>)}</tbody>
        </table>
      </div> : <p className="protocol-exchange-empty">Không khai báo header.</p>}
      {value.body !== undefined ? <div className="protocol-exchange-body" id={targetId(variant.id, side, 'body')}>
        <div className="protocol-exchange-body-heading"><span>Body · {value.body.kind}</span>
          <button type="button" hidden={!ready} aria-label={`Sao chép body ${side} — ${variant.title}`} onClick={() => copy(variant, side, true)}>Sao chép body</button>
        </div>
        {value.body.kind === 'json' ? <DataInspector data={value.body.data} />
          : <>{!value.body.text && <p className="protocol-exchange-empty">Body rỗng.</p>}<pre tabIndex={0} role="region" aria-label={`Body ${side} — ${variant.title}`}><code>{value.body.text}</code></pre></>}
      </div> : <p className="protocol-exchange-empty">Không có body.</p>}
    </section>;
  }

  return <figure className={['protocol-exchange', 'not-prose', className].filter(Boolean).join(' ')} aria-labelledby={titleId}>
    <figcaption className="protocol-exchange-header">
      <span id={titleId}>{data.title}</span><small>{data.variants.length} tình huống</small>
      {data.description && <p>{data.description}</p>}
    </figcaption>
    <p className="protocol-exchange-notice">Ví dụ tĩnh · Không gửi request. Bản sao là transcript đọc được, không phải HTTP wire format.</p>
    <div className="protocol-exchange-variants">
      {data.variants.map((variant, index) => <details key={variant.id} className="protocol-exchange-variant" open={index === 0} data-variant={variant.id}>
        <summary><span>{variant.title}</span><small>{variant.request.method} → {variant.response.status}</small></summary>
        {variant.description && <p className="protocol-exchange-description">{variant.description}</p>}
        <div className="protocol-exchange-pair">
          {message(variant, 'request')}
          {message(variant, 'response')}
        </div>
        {variant.annotations && <ol className="protocol-exchange-annotations" aria-label={`Chú thích trao đổi — ${variant.title}`}>
          {variant.annotations.map((annotation) => <li key={annotation.id}>
            <a href={`#${targetId(variant.id, annotation.side, annotation.target, annotation.header)}`}>{annotation.title}</a>
            <span>{annotation.side} · {annotation.target}{annotation.header ? ` · ${annotation.header}` : ''}</span>
            <p>{annotation.description}</p>
          </li>)}
        </ol>}
      </details>)}
    </div>
    <div className="protocol-exchange-copy-status" role="status" aria-label="Sao chép trao đổi" aria-live="polite">{status}</div>
  </figure>;
}
