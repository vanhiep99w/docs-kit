'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { codeLines } from '../code/annotations.js';
import { terminalContextLabel, validateTerminalSession, type TerminalOutput, type TerminalSessionData } from '../terminal-session/data.js';

export type { TerminalSessionData, TerminalStep, TerminalOutput, TerminalContext, ExampleAnnotation, ExampleRange } from '../terminal-session/data.js';

export type TerminalSessionProps = {
  data: TerminalSessionData;
  className?: string;
};

function Output({ output, id, stepTitle }: { output: TerminalOutput; id: string; stepTitle: string }) {
  const lines = codeLines(output.text);
  return (
    <details className="terminal-session-output" data-stream={output.stream} open={!output.collapsed}>
      <summary><span>{output.stream}</span><span className="terminal-session-line-count">{lines.length} dòng</span></summary>
      <pre tabIndex={0} role="region" aria-label={`${output.stream}: ${stepTitle}`}>
        <code>{output.annotations ? lines.map((line, index) => {
          const number = index + 1;
          const highlighted = output.annotations!.some((annotation) => annotation.ranges.some(([start, end]) => number >= start && number <= end));
          return <span className="terminal-session-output-line" key={number} id={`${id}-line-${number}`}
            data-line={number} data-highlighted={highlighted ? 'true' : undefined}>
            <span className="terminal-session-line-number" aria-hidden="true">{number}</span>
            <span>{line}</span>
          </span>;
        }) : output.text}</code>
      </pre>
      {output.annotations && <ol className="terminal-session-annotations" aria-label={`Chú thích ${output.stream}: ${stepTitle}`}>
        {output.annotations.map((annotation) => <li key={annotation.id}>
          <a href={`#${id}-line-${annotation.ranges[0][0]}`}>{annotation.title}</a>
          <span className="terminal-session-range">Dòng {annotation.ranges.map(([start, end]) => start === end ? start : `${start}–${end}`).join(', ')}</span>
          <p>{annotation.description}</p>
        </li>)}
      </ol>}
    </details>
  );
}

/** A readable transcript, not a shell. Only copying requires JavaScript. */
export function TerminalSession({ data, className }: TerminalSessionProps) {
  const session = useMemo(() => {
    validateTerminalSession(data);
    return data;
  }, [data]);
  const uid = useId();
  const captionId = `${uid}-caption`;
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('');
  useEffect(() => { setReady(true); }, []);
  useEffect(() => { setStatus(''); }, [data]);

  async function copy(command: string, stepNumber: number) {
    try {
      await navigator.clipboard.writeText(command);
      setStatus(`Đã sao chép lệnh bước ${stepNumber}.`);
    } catch {
      setStatus('Không thể sao chép. Hãy chọn và sao chép lệnh thủ công.');
    }
  }

  return (
    <figure className={['terminal-session', 'not-prose', className].filter(Boolean).join(' ')} aria-labelledby={captionId}>
      <figcaption className="terminal-session-header" id={captionId}>
        <span className="terminal-session-title">{session.title}</span>
        <span className="terminal-session-context">{terminalContextLabel(session.context)}</span>
      </figcaption>
      {session.description && <p className="terminal-session-description">{session.description}</p>}
      <ol className="terminal-session-steps" aria-label="Các bước terminal">
        {session.steps.map((step, index) => {
          const number = index + 1;
          const title = step.title ?? `Bước ${number}`;
          const warningId = `${uid}-${step.id}-warning`;
          return <li key={step.id} className="terminal-session-step">
            <div className="terminal-session-step-header">
              <span className="terminal-session-step-title"><span aria-hidden="true">{number.toString().padStart(2, '0')}</span>{title}</span>
              <button type="button" hidden={!ready} onClick={() => copy(step.command, number)}
                aria-label={`Sao chép lệnh bước ${number}`} aria-describedby={step.warning ? warningId : undefined}>Sao chép lệnh</button>
            </div>
            {step.context && <p className="terminal-session-step-context">{terminalContextLabel(step.context)}</p>}
            {step.description && <p className="terminal-session-prose">{step.description}</p>}
            {step.warning && <aside className="terminal-session-warning" role="note" aria-label="Cảnh báo" id={warningId}>
              <strong>Cảnh báo</strong><p>{step.warning}</p>
            </aside>}
            <div className="terminal-session-command">
              <span className="terminal-session-prompt" aria-hidden="true">{step.prompt ?? '$'}</span>
              <pre tabIndex={0} role="region" aria-label={`Lệnh: ${title}`}><code>{step.command}</code></pre>
            </div>
            {step.outputs?.map((output, outputIndex) => <Output key={outputIndex} output={output} id={`${uid}-${step.id}-output-${outputIndex}`} stepTitle={title} />)}
            {(step.expected !== undefined || step.exitCode !== undefined) && <div className="terminal-session-result">
              {step.expected !== undefined && <p><strong>Kết quả kỳ vọng: </strong>{step.expected}</p>}
              {step.exitCode !== undefined && <span className="terminal-session-exit" data-failed={step.exitCode !== 0 ? 'true' : undefined}>Exit code: {step.exitCode}</span>}
            </div>}
          </li>;
        })}
      </ol>
      <div className="terminal-session-status" role="status" aria-live="polite">{status}</div>
    </figure>
  );
}
