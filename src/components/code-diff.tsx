'use client';

import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { diffBlocks, diffCodeLines, diffLineEndings, splitDiffRows, validatePreparedCodeDiff, type DiffSide, type DiffView, type DiffWordRange, type DiffSplitRow, type PreparedCodeDiff } from '../code-diff/data.js';
import { CopyIcon } from './copy-icon.js';
import { writeSourceURL } from '../source-explorer/index.js';
import { codeTokenStyle } from './code-token-style.js';

export type { PreparedCodeDiff, CodeDiffInput, CodeDiffFile, DiffAnnotation, DiffRow, DiffSide, DiffView, DiffWordRange, DiffSplitRow } from '../code-diff/data.js';
export type CodeDiffProps = {
  data: PreparedCodeDiff;
  className?: string;
  sourceLinks?: Partial<Record<DiffSide, ReactNode>>;
};

/** Prepared inline/split diff. Diff engines and word segmentation remain build-only. */
export function CodeDiff({ data, className, sourceLinks }: CodeDiffProps) {
  const view = useMemo(() => {
    validatePreparedCodeDiff(data);
    const splitBlocks: { folded: boolean; rows: DiffSplitRow[] }[] = [];
    for (const row of splitDiffRows(data)) {
      const last = splitBlocks.at(-1);
      if (last?.folded === row.folded) last.rows.push(row);
      else splitBlocks.push({ folded: row.folded, rows: [row] });
    }
    return { before: diffCodeLines(data.before.code), after: diffCodeLines(data.after.code), blocks: diffBlocks(data), splitBlocks };
  }, [data]);
  const uid = useId();
  const titleId = `${uid}-title`;
  const lineId = (side: DiffSide, number: number) => `${uid}-${side}-${number}`;
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('');
  const [layout, setLayout] = useState<{ data: PreparedCodeDiff; view: DiffView } | null>(null);
  const displayView = layout?.data === data ? layout.view : data.view ?? 'inline';
  useEffect(() => { setReady(true); }, []);
  useEffect(() => { setStatus(''); }, [data]);
  const added = data.rows.filter((row) => row.type === 'add').length;
  const removed = data.rows.filter((row) => row.type === 'remove').length;
  const showNewline = view.before.at(-1)?.ending !== view.after.at(-1)?.ending;

  async function copy(side: DiffSide) {
    try {
      await navigator.clipboard.writeText(data[side].code);
      setStatus(`Đã sao chép bản ${side === 'before' ? 'trước' : 'sau'}.`);
    } catch { setStatus('Không thể sao chép. Hãy chọn và sao chép code thủ công.'); }
  }

  function renderCode(side: DiffSide, number: number, ranges: DiffWordRange[]) {
    const line = view[side][number - 1];
    const tokens = data[side].tokens?.[number - 1] ?? [{ content: line.text }];
    const parts: ReactNode[] = [];
    let offset = 0; let rangeIndex = 0;
    for (const token of tokens) {
      const end = offset + token.content.length;
      let position = offset;
      while (position < end) {
        while (rangeIndex < ranges.length && ranges[rangeIndex][1] <= position) rangeIndex++;
        const range = ranges[rangeIndex];
        const changed = !!range && range[0] <= position;
        const stop = Math.min(end, changed ? range[1] : range?.[0] ?? end);
        parts.push(<span key={parts.length} className="code-diff-token" data-word-changed={changed ? 'true' : undefined} style={codeTokenStyle(token, 'code-diff')}>{token.content.slice(position - offset, stop - offset)}</span>);
        position = stop;
      }
      offset = end;
    }
    return parts;
  }

  function renderRow(index: number, splitSide?: DiffSide) {
    const row = data.rows[index];
    const oldNumber = 'beforeLine' in row ? row.beforeLine : undefined;
    const newNumber = 'afterLine' in row ? row.afterLine : undefined;
    const side = splitSide ?? (row.type === 'remove' ? 'before' : 'after');
    const number = side === 'before' ? oldNumber! : newNumber!;
    const line = view[side][number - 1];
    const annotated = data.annotations?.some((annotation) => {
      if (splitSide && annotation.side !== splitSide) return false;
      const target = annotation.side === 'before' ? oldNumber : newNumber;
      return target !== undefined && annotation.ranges.some(([start, end]) => target >= start && target <= end);
    });
    const ranges = data.wordDiff && row.type !== 'equal' ? row.ranges ?? [] : [];
    return <div key={`${splitSide ?? 'inline'}-${index}`} className="code-diff-row" data-type={row.type} data-side={splitSide} data-annotated={annotated ? 'true' : undefined}>
      <span className="code-diff-sr-only">{row.type === 'remove' ? 'Xóa' : row.type === 'add' ? 'Thêm' : 'Giữ'}; {oldNumber !== undefined && splitSide !== 'after' ? `trước ${oldNumber}; ` : ''}{newNumber !== undefined && splitSide !== 'before' ? `sau ${newNumber}; ` : ''}</span>
      {splitSide !== 'after' && <span className="code-diff-number" aria-hidden="true" id={oldNumber !== undefined ? lineId('before', oldNumber) : undefined} data-before-line={oldNumber}>{oldNumber ?? ''}</span>}
      {splitSide !== 'before' && <span className="code-diff-number" aria-hidden="true" id={newNumber !== undefined ? lineId('after', newNumber) : undefined} data-after-line={newNumber}>{newNumber ?? ''}</span>}
      <span className="code-diff-sign" aria-hidden="true">{row.type === 'remove' ? '−' : row.type === 'add' ? '+' : ' '}</span>
      <code className="code-diff-content">{renderCode(side, number, ranges)}</code>
      {!line.ending && showNewline && <span className="code-diff-no-newline" title="Không có newline cuối"><span aria-hidden="true">∅↵</span><span className="code-diff-sr-only">Không có newline cuối</span></span>}
    </div>;
  }
  function renderPair(pair: DiffSplitRow, index: number) {
    return <div className="code-diff-split-row" key={index}>{(['before', 'after'] as const).map((side) => pair[side] !== undefined
      ? renderRow(pair[side], side)
      : <div className="code-diff-row code-diff-placeholder" data-side={side} aria-hidden="true" key={side} />)}</div>;
  }

  return <figure className={['code-diff', 'not-prose', className].filter(Boolean).join(' ')} data-view={displayView} aria-labelledby={titleId}>
    <figcaption id={titleId} className="code-diff-sr-only">{data.title}</figcaption>
    <div className="code-diff-toolbar">
      <div className="code-diff-view-controls" hidden={!ready} role="group" aria-label="Chế độ diff">{(['inline', 'split'] as const).map((mode) => <button type="button" key={mode} aria-pressed={displayView === mode} onClick={() => setLayout({ data, view: mode })}>{mode === 'inline' ? 'Inline' : 'Song song'}</button>)}</div>
      <div className="code-diff-copy-controls">{(['before', 'after'] as const).map((side) => {
        const sourceHref = data[side].source ? writeSourceURL(new URL('https://source.invalid/'), data[side].source!).search : undefined;
        return <span key={side}><button type="button" hidden={!ready} aria-label={`Sao chép bản ${side === 'before' ? 'trước' : 'sau'}`} title={`Sao chép bản ${side === 'before' ? 'trước' : 'sau'}`} onClick={() => copy(side)}><CopyIcon /><span>{side === 'before' ? 'Trước' : 'Sau'}</span></button>
          {sourceLinks?.[side] ?? (sourceHref && <a href={sourceHref}>Source {side === 'before' ? 'trước' : 'sau'} ↗</a>)}</span>;
      })}</div>
    </div>
    {added === 0 && removed === 0 && <p className="code-diff-identical">Nội dung hai bản giống nhau.{!data.before.code && ' Cả hai file rỗng.'}</p>}
    <div className="code-diff-scroll" tabIndex={0} role="region" aria-label={`Diff: ${data.title}`}>
      <div className="code-diff-lines" data-view={displayView} key={displayView}>
        {displayView === 'inline' ? view.blocks.map((block, index) => block.folded
          ? <details className="code-diff-fold" key={index}><summary>{block.indices.length} dòng không đổi</summary>{block.indices.map((row) => renderRow(row))}</details>
          : <div key={index}>{block.indices.map((row) => renderRow(row))}</div>) : <>
          <div className="code-diff-split-header"><strong>Trước</strong><strong>Sau</strong></div>
          {view.splitBlocks.map((block, index) => block.folded
            ? <details className="code-diff-fold code-diff-block" key={index}><summary>{block.rows.length} dòng không đổi</summary><div className="code-diff-block">{block.rows.map(renderPair)}</div></details>
            : <div className="code-diff-block" key={index}>{block.rows.map(renderPair)}</div>)}
        </>}
      </div>
    </div>
    {data.annotations && <ol className="code-diff-annotations" aria-label="Giải thích thay đổi">
      {data.annotations.map((annotation) => <li key={annotation.id}>
        <a href={`#${lineId(annotation.side, annotation.ranges[0][0])}`}>{annotation.title}</a>
        <span>Bản {annotation.side === 'before' ? 'trước' : 'sau'} · Dòng {annotation.ranges.map(([start, end]) => start === end ? start : `${start}–${end}`).join(', ')}</span>
        <p>{annotation.description}</p>
      </li>)}
    </ol>}
    <details className="code-diff-info"><summary>Chi tiết</summary>
      <strong>{data.title}</strong>{data.caption && <p>{data.caption}</p>}
      <p>+{added} thêm · −{removed} xóa</p>
      {(['before', 'after'] as const).map((side) => <p key={side}>{side === 'before' ? 'Trước' : 'Sau'}{data[side].label ? ` · ${data[side].label}` : ''} · {diffLineEndings(data[side].code)}{view[side].length && !view[side].at(-1)!.ending ? ' · Không có newline cuối' : ''}</p>)}
      <p>{displayView === 'split' ? 'Trái: trước · Phải: sau. Ô trống không phải dòng của file. ' : 'Số dòng: trước / sau. '}Dấu − là xóa; dấu + là thêm.{data.wordDiff && ' Vùng gạch chân là chi tiết từ trong các dòng thay thế đã ghép theo vị trí.'}</p>
    </details>
    <div className="code-diff-status" role="status" aria-live="polite">{status}</div>
  </figure>;
}
