import { diffCodeLines, type DiffRow } from './data.js';

/** Bounded LCS; build-time only. Full-file input is limited to 2000 lines per side. */
export function buildDiffRows(beforeCode: string, afterCode: string): DiffRow[] {
  const before = diffCodeLines(beforeCode);
  const after = diffCodeLines(afterCode);
  const rows: DiffRow[] = [];
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix].raw === after[prefix].raw) {
    rows.push({ type: 'equal', beforeLine: prefix + 1, afterLine: prefix + 1 });
    prefix++;
  }
  let suffix = 0;
  while (suffix < before.length - prefix && suffix < after.length - prefix &&
    before[before.length - suffix - 1].raw === after[after.length - suffix - 1].raw) suffix++;
  const n = before.length - prefix - suffix;
  const m = after.length - prefix - suffix;
  const cols = m + 1;
  const lengths = new Uint16Array((n + 1) * cols);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    lengths[i * cols + j] = before[prefix + i].raw === after[prefix + j].raw
      ? lengths[(i + 1) * cols + j + 1] + 1
      : Math.max(lengths[(i + 1) * cols + j], lengths[i * cols + j + 1]);
  }
  let i = 0; let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && before[prefix + i].raw === after[prefix + j].raw) {
      rows.push({ type: 'equal', beforeLine: prefix + i++ + 1, afterLine: prefix + j++ + 1 });
    } else if (i < n && (j === m || lengths[(i + 1) * cols + j] >= lengths[i * cols + j + 1])) {
      rows.push({ type: 'remove', beforeLine: prefix + i++ + 1 });
    } else rows.push({ type: 'add', afterLine: prefix + j++ + 1 });
  }
  for (let index = 0; index < suffix; index++) rows.push({
    type: 'equal', beforeLine: before.length - suffix + index + 1, afterLine: after.length - suffix + index + 1,
  });
  return rows;
}
