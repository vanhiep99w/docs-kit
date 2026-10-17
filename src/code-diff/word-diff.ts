import { diffCodeLines, type DiffRow, type DiffWordRange } from './data.js';

type Word = { text: string; start: number; end: number };
const segmenter = new Intl.Segmenter('und', { granularity: 'word' });
function words(text: string): Word[] | undefined {
  const result: Word[] = [];
  for (const segment of segmenter.segment(text)) {
    if (result.length === 512) return undefined;
    result.push({ text: segment.segment, start: segment.index, end: segment.index + segment.segment.length });
  }
  return result;
}
function add(ranges: DiffWordRange[], word: Word) {
  const last = ranges.at(-1);
  if (last?.[1] === word.start) last[1] = word.end;
  else ranges.push([word.start, word.end]);
}
function compare(before: string, after: string, budget: { cells: number }): [DiffWordRange[], DiffWordRange[]] {
  if (before === after) return [[], []]; // EOL-only change has no word detail.
  const a = words(before); const b = words(after);
  const cells = a && b ? (a.length + 1) * (b.length + 1) : Infinity;
  if (!a || !b || cells > 65536 || cells > budget.cells) return [before ? [[0, before.length]] : [], after ? [[0, after.length]] : []];
  budget.cells -= cells;
  const cols = b.length + 1;
  const lengths = new Uint16Array(cells);
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) {
    lengths[i * cols + j] = a[i].text === b[j].text ? lengths[(i + 1) * cols + j + 1] + 1 : Math.max(lengths[(i + 1) * cols + j], lengths[i * cols + j + 1]);
  }
  const removed: DiffWordRange[] = []; const added: DiffWordRange[] = [];
  let i = 0; let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i].text === b[j].text) { i++; j++; }
    else if (i < a.length && (j === b.length || lengths[(i + 1) * cols + j] >= lengths[i * cols + j + 1])) add(removed, a[i++]);
    else add(added, b[j++]);
  }
  return [removed, added];
}

/** Build-only: pair replacement lines by position within each contiguous change hunk. */
export function addWordRanges(rows: DiffRow[], beforeCode: string, afterCode: string): DiffRow[] {
  const before = diffCodeLines(beforeCode); const after = diffCodeLines(afterCode);
  const result = rows.map((row) => ({ ...row }));
  const budget = { cells: 1_000_000 };
  let index = 0;
  while (index < result.length) {
    if (result[index].type === 'equal') { index++; continue; }
    const removed: Extract<DiffRow, { type: 'remove' }>[] = [];
    const added: Extract<DiffRow, { type: 'add' }>[] = [];
    while (index < result.length && result[index].type !== 'equal') {
      const row = result[index++];
      if (row.type === 'remove') removed.push(row);
      else if (row.type === 'add') added.push(row);
    }
    for (let pair = 0; pair < Math.min(removed.length, added.length); pair++) {
      const [oldRanges, newRanges] = compare(before[removed[pair].beforeLine - 1].text, after[added[pair].afterLine - 1].text, budget);
      removed[pair].ranges = oldRanges; added[pair].ranges = newRanges;
    }
  }
  return result;
}
