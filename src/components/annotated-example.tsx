'use client';

import { useEffect, useId, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { codeLines, validateAnnotatedExample, type AnnotatedExampleData, type ExampleAnnotation } from '../annotated-example/data.js';
import { CopyIcon } from './copy-icon.js';
import { codeTokenStyle } from './code-token-style.js';
import { writeSourceURL } from '../source-explorer/index.js';

export type { AnnotatedExampleData, ExampleAnnotation, ExampleRange, ExampleToken } from '../annotated-example/data.js';

export type AnnotatedExampleProps = {
  data: AnnotatedExampleData;
  className?: string;
  /** Optional host integration. The default source link works without a provider. */
  sourceLink?: ReactNode;
  /** Optional controlled selection, used by Code Walkthrough. null clears the highlight. */
  activeAnnotation?: string | null;
  onAnnotationSelect?: (id: string) => void;
};

function rangeLabel(annotation: ExampleAnnotation): string {
  return annotation.ranges.map(([start, end]) => start === end ? `${start}` : `${start}–${end}`).join(', ');
}

/** SSR-readable example. Only selection and clipboard need JavaScript. */
export function AnnotatedExample({ data, className, sourceLink, activeAnnotation, onAnnotationSelect }: AnnotatedExampleProps) {
  const example = useMemo(() => {
    validateAnnotatedExample(data);
    return { ...data, lines: codeLines(data.code) };
  }, [data]);
  const uid = useId();
  const captionId = `${uid}-caption`;
  const lineId = (number: number) => `${uid}-line-${number}`;
  const [selected, setSelected] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const codeRef = useRef<HTMLPreElement>(null);
  useEffect(() => { setReady(true); }, []);
  useEffect(() => { setSelected(null); setCopyStatus(''); }, [data]);

  const selectedId = activeAnnotation !== undefined ? activeAnnotation : selected;
  const annotation = example.annotations.find((entry) => entry.id === selectedId);
  if (activeAnnotation !== undefined && activeAnnotation !== null && !annotation) throw new Error('Annotated Example: activeAnnotation must reference an existing annotation.');
  const sourceHref = example.source ? writeSourceURL(new URL('https://source.invalid/'), example.source).search : undefined;

  function scrollAnnotation(entry: ExampleAnnotation) {
    const line = document.getElementById(`${uid}-line-${entry.ranges[0][0]}`);
    const viewport = codeRef.current;
    if (line && viewport) {
      // Scroll only the code viewport; don't move the reader's page or steal focus.
      const top = line.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop;
      if (top < viewport.scrollTop || top + line.clientHeight > viewport.scrollTop + viewport.clientHeight) {
        viewport.scrollTop = Math.max(0, top - viewport.clientHeight / 3);
      }
    }
  }
  useEffect(() => { if (annotation) scrollAnnotation(annotation); }, [annotation, uid]);

  function select(event: MouseEvent<HTMLAnchorElement>, entry: ExampleAnnotation) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (activeAnnotation === undefined) setSelected(entry.id);
    onAnnotationSelect?.(entry.id);
    scrollAnnotation(entry);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(example.code);
      setCopyStatus('Đã sao chép code.');
    } catch {
      setCopyStatus('Không thể sao chép. Hãy chọn và sao chép code thủ công.');
    }
  }

  return (
    <figure className={['annotated-example', 'not-prose', className].filter(Boolean).join(' ')} aria-labelledby={captionId}>
      <figcaption className="annotated-example-header" id={captionId}>
        <span className="annotated-example-title">{example.title}</span>
        <span className="annotated-example-language">{example.language ?? 'text'}</span>
        <button type="button" hidden={!ready} aria-label="Sao chép code" title="Sao chép code" onClick={copy}><CopyIcon /></button>
      </figcaption>
      <div className="annotated-example-layout">
        <pre ref={codeRef} className="annotated-example-code" tabIndex={0} role="region" aria-label={`Code: ${example.title}`}>
          <code>{example.lines.map((line, index) => {
            const number = index + 1;
            const active = annotation?.ranges.some(([start, end]) => number >= start && number <= end);
            return <span key={number} id={lineId(number)} data-line={number} data-highlighted={active ? 'true' : undefined}
              className="annotated-example-line">
              <span className="annotated-example-number" aria-hidden="true">{number}</span>
              <span className="annotated-example-content">{example.tokens
                ? example.tokens[index].map((token, tokenIndex) => <span key={tokenIndex} className="annotated-example-token" style={codeTokenStyle(token, 'annotated')}>{token.content}</span>)
                : line}</span>
            </span>;
          })}</code>
        </pre>
        <div className="annotated-example-notes">
          <ol aria-label="Chú thích code">
            {example.annotations.map((entry, index) => <li key={entry.id} data-selected={selectedId === entry.id ? 'true' : undefined}>
              <a href={`#${lineId(entry.ranges[0][0])}`} onClick={(event) => select(event, entry)}
                aria-current={selectedId === entry.id ? 'true' : undefined}>
                <span className="annotated-example-note-number" aria-hidden="true">{index + 1}</span>
                <span>{entry.title}<span className="annotated-example-range">Dòng {rangeLabel(entry)}</span></span>
              </a>
              <p>{entry.description}</p>
            </li>)}
          </ol>
          {sourceLink ?? (sourceHref && <a className="annotated-example-source" href={sourceHref}>Mở source đầy đủ ↗</a>)}
        </div>
      </div>
      <div className="annotated-example-status" role="status" aria-live="polite">{copyStatus}</div>
    </figure>
  );
}
