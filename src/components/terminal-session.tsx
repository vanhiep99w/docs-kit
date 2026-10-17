'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { CopyIcon } from './copy-icon.js';
import { codeLines } from '../code/annotations.js';
import { terminalContextLabel, validateTerminalSession, type TerminalOutput, type TerminalSessionData } from '../terminal-session/data.js';

export type { TerminalSessionData, TerminalStep, TerminalOutput, TerminalContext, ExampleAnnotation, ExampleRange } from '../terminal-session/data.js';

export type TerminalSessionProps = {
  data: TerminalSessionData;
  className?: string;
};

function Output({ output, id, stepTitle }: { output: TerminalOutput; id: string; stepTitle: string }) {
  const lines = codeLines(output.text);
  const content = <>
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
  </>;
  if (output.collapsed === undefined && lines.length <= 8 && !output.annotations) return <div className="terminal-session-output terminal-session-output-plain" data-stream={output.stream}>
    <span className="terminal-session-stream">{output.stream}</span>{content}
  </div>;
  return (
    <details className="terminal-session-output" data-stream={output.stream} open={!output.collapsed}>
      <summary><span>{output.stream}</span><span className="terminal-session-line-count">{lines.length} dòng</span></summary>
      {content}
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
        <span className="terminal-session-symbol" aria-hidden="true">❯_</span>
        <span className="terminal-session-title">{session.title}</span>
        <span className="terminal-session-context">{terminalContextLabel(session.context)}</span>
      </figcaption>
      <ol className="terminal-session-steps" aria-label="Các bước terminal">
        {session.steps.map((step, index) => {
          const number = index + 1;
          const title = step.title ?? `Bước ${number}`;
          const warningId = `${uid}-${step.id}-warning`;
          const contextLabel = terminalContextLabel(step.context ?? session.context);
          const previousContext = index ? terminalContextLabel(session.steps[index - 1].context ?? session.context) : terminalContextLabel(session.context);
          return <li key={step.id} className="terminal-session-step">
            {step.title && <div className="terminal-session-step-title"><span aria-hidden="true"># </span>{step.title}</div>}
            {(step.context || previousContext !== contextLabel) && <p className="terminal-session-step-context">{contextLabel}</p>}
            {step.warning && <aside className="terminal-session-warning" role="note" aria-label="Cảnh báo" id={warningId}>
              <strong>Cảnh báo: </strong><p>{step.warning}</p>
            </aside>}
            <div className="terminal-session-command">
              <span className="terminal-session-prompt" aria-hidden="true">{step.prompt ?? '$'}</span>
              <pre tabIndex={0} role="region" aria-label={`Lệnh: ${title}`}><code>{step.command}</code></pre>
              <button type="button" className="terminal-session-copy" hidden={!ready} onClick={() => copy(step.command, number)}
                aria-label={`Sao chép lệnh bước ${number}`} title="Sao chép lệnh" aria-describedby={step.warning ? warningId : undefined}><CopyIcon /></button>
            </div>
            {step.outputs?.map((output, outputIndex) => <Output key={outputIndex} output={output} id={`${uid}-${step.id}-output-${outputIndex}`} stepTitle={title} />)}
            {(step.description || step.expected !== undefined) && <details className="terminal-session-notes"><summary>Ghi chú{step.exitCode !== undefined ? ` · Exit code: ${step.exitCode}` : ''}</summary>
              {step.description && <p>{step.description}</p>}
              {step.expected !== undefined && <p><strong>Kết quả kỳ vọng: </strong>{step.expected}</p>}
            </details>}
            {step.exitCode !== undefined && (!step.description && step.expected === undefined || step.exitCode !== 0) && <span className="terminal-session-exit" data-failed={step.exitCode !== 0 ? 'true' : undefined}>Exit code: {step.exitCode}</span>}
          </li>;
        })}
      </ol>
      {session.description && <details className="terminal-session-info"><summary>Về phiên lệnh</summary><p>{session.description}</p></details>}
      <div className="terminal-session-status" role="status" aria-live="polite">{status}</div>
    </figure>
  );
}
