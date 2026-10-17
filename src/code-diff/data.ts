import { codeLines, validateAnnotations, type ExampleAnnotation } from '../code/annotations.js';
import { validateCodeTokens, type ExampleToken } from '../code/tokens.js';
import { validateSourceRequest, type SourceRequest } from '../source-explorer/index.js';

export type { ExampleToken } from '../code/tokens.js';
export type { ExampleRange } from '../code/annotations.js';
export type DiffSide = 'before' | 'after';
export type DiffView = 'inline' | 'split';
/** Half-open UTF-16 offsets within physical line text, excluding EOL. */
export type DiffWordRange = [start: number, end: number];
export type DiffAnnotation = ExampleAnnotation & { side: DiffSide };
export type CodeDiffFile = { code: string; label?: string; source?: SourceRequest; tokens?: ExampleToken[][] };
export type CodeDiffInput = {
  title: string;
  language?: string;
  caption?: string;
  before: CodeDiffFile;
  after: CodeDiffFile;
  annotations?: DiffAnnotation[];
  /** Unchanged lines adjacent to a change; 0–20, defaults to 3. */
  contextLines?: number;
  /** Initial SSR layout; defaults to inline. */
  view?: DiffView;
  /** Opt-in build-time word detail for positionally paired replacement lines. */
  wordDiff?: boolean;
};
export type DiffRow =
  | { type: 'equal'; beforeLine: number; afterLine: number }
  | { type: 'remove'; beforeLine: number; ranges?: DiffWordRange[] }
  | { type: 'add'; afterLine: number; ranges?: DiffWordRange[] };
export type PreparedCodeDiff = CodeDiffInput & { rows: DiffRow[] };
export type DiffPhysicalLine = { text: string; ending: '' | '\n' | '\r\n' | '\r'; raw: string };
export type DiffBlock = { folded: boolean; indices: number[] };

/** Physical file lines: empty file has zero lines; final newline creates no phantom row. */
export function diffCodeLines(code: string): DiffPhysicalLine[] {
  const lines: DiffPhysicalLine[] = [];
  for (const match of code.matchAll(/([^\r\n]*)(\r\n|\r|\n|$)/g)) {
    if (match.index === code.length) break;
    lines.push({ text: match[1], ending: match[2] as DiffPhysicalLine['ending'], raw: match[0] });
  }
  return lines;
}

function fail(message: string): never { throw new Error(`Code Diff: ${message}`); }
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, allowed: string[], path: string) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`unknown property ${path}.${key}.`);
}
function text(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) fail(`${path} must be a non-empty string.`);
}

function validate(value: unknown, prepared: boolean): asserts value is CodeDiffInput {
  if (!record(value)) fail('expected an object.');
  keys(value, ['title', 'language', 'caption', 'before', 'after', 'annotations', 'contextLines', 'view', 'wordDiff', ...(prepared ? ['rows'] : [])], 'diff');
  text(value.title, 'title');
  if (value.view !== undefined && value.view !== 'inline' && value.view !== 'split') fail('view must be inline or split.');
  if (value.wordDiff !== undefined && typeof value.wordDiff !== 'boolean') fail('wordDiff must be boolean.');
  for (const key of ['language', 'caption']) if (value[key] !== undefined) text(value[key], key);
  if (value.contextLines !== undefined && (!Number.isInteger(value.contextLines) || (value.contextLines as number) < 0 || (value.contextLines as number) > 20)) fail('contextLines must be an integer from 0 to 20.');
  for (const side of ['before', 'after'] as const) {
    const file = value[side];
    if (!record(file)) fail(`${side} must be an object.`);
    keys(file, ['code', 'label', 'source', 'tokens'], side);
    if (typeof file.code !== 'string') fail(`${side}.code must be a string.`);
    if (file.code.length > 262144 || diffCodeLines(file.code).length > 2000) fail(`${side}.code exceeds 256K characters or 2000 physical lines.`);
    if (file.label !== undefined) text(file.label, `${side}.label`);
    try {
      validateCodeTokens(file.tokens, codeLines(file.code));
      if (file.source !== undefined) validateSourceRequest(file.source);
    } catch (error) { fail(`${side}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  if (value.annotations !== undefined) {
    if (!Array.isArray(value.annotations) || !value.annotations.length || value.annotations.length > 100) fail('annotations must contain 1–100 entries when supplied.');
    const ids = new Set<string>();
    for (const annotation of value.annotations) {
      if (!record(annotation)) fail('each annotation must be an object.');
      keys(annotation, ['id', 'title', 'description', 'ranges', 'side'], 'annotation');
      if (annotation.side !== 'before' && annotation.side !== 'after') fail('annotation.side must be before or after.');
      try { validateAnnotations([annotation], diffCodeLines((value[annotation.side] as CodeDiffFile).code).length); }
      catch (error) { fail(error instanceof Error ? error.message : String(error)); }
      if (ids.has(annotation.id as string)) fail(`duplicate annotation id "${annotation.id}".`);
      ids.add(annotation.id as string);
    }
  }
}

export function validateCodeDiffInput(value: unknown): asserts value is CodeDiffInput { validate(value, false); }

/** Checks reconstruction, numbering and token alignment without running a diff algorithm in the client. */
export function validatePreparedCodeDiff(value: unknown): asserts value is PreparedCodeDiff {
  validate(value, true);
  const data = value as PreparedCodeDiff;
  const before = diffCodeLines(data.before.code);
  const after = diffCodeLines(data.after.code);
  if (!Array.isArray(data.rows) || data.rows.length > before.length + after.length) fail('rows must be an array within the input line count.');
  let oldLine = 1; let newLine = 1;
  for (const row of data.rows) {
    if (!record(row)) fail('each row must be an object.');
    keys(row, row.type === 'equal' ? ['type', 'beforeLine', 'afterLine'] : row.type === 'remove' ? ['type', 'beforeLine', 'ranges'] : ['type', 'afterLine', 'ranges'], 'row');
    if (!['equal', 'remove', 'add'].includes(row.type)) fail('invalid row.type.');
    if (row.type !== 'add' && (row.beforeLine !== oldLine || !before[oldLine - 1])) fail('before line numbers must reconstruct the original file in order.');
    if (row.type !== 'remove' && (row.afterLine !== newLine || !after[newLine - 1])) fail('after line numbers must reconstruct the new file in order.');
    if (row.type === 'equal' && before[oldLine - 1].raw !== after[newLine - 1].raw) fail('equal rows must match both text and line endings.');
    if (row.type !== 'equal' && row.ranges !== undefined) {
      if (!data.wordDiff || !Array.isArray(row.ranges) || row.ranges.length > 512) fail('word ranges require wordDiff and at most 512 ranges.');
      const source = row.type === 'remove' ? before[oldLine - 1].text : after[newLine - 1].text;
      let end = 0;
      for (const range of row.ranges) {
        if (!Array.isArray(range) || range.length !== 2 || !Number.isSafeInteger(range[0]) || !Number.isSafeInteger(range[1]) || range[0] < end || range[1] <= range[0] || range[1] > source.length) fail('word ranges must be ordered, non-overlapping offsets inside line text.');
        for (const boundary of range) if (boundary > 0 && boundary < source.length && /[\uD800-\uDBFF]/.test(source[boundary - 1]) && /[\uDC00-\uDFFF]/.test(source[boundary])) fail('word ranges cannot split surrogate pairs.');
        end = range[1];
      }
    }
    if (row.type !== 'add') oldLine++;
    if (row.type !== 'remove') newLine++;
  }
  if (oldLine !== before.length + 1 || newLine !== after.length + 1) fail('rows must cover both complete files.');
}

/** Presentation only: annotations are always kept visible, including unchanged lines. */
export function diffBlocks(data: PreparedCodeDiff): DiffBlock[] {
  const visible = new Set<number>();
  const context = data.contextLines ?? 3;
  for (let index = 0; index < data.rows.length; index++) {
    const row = data.rows[index];
    if (row.type !== 'equal') {
      for (let near = Math.max(0, index - context); near <= Math.min(data.rows.length - 1, index + context); near++) visible.add(near);
    }
    if (data.annotations?.some((annotation) => {
      const line = annotation.side === 'before' ? ('beforeLine' in row ? row.beforeLine : undefined) : ('afterLine' in row ? row.afterLine : undefined);
      return line !== undefined && annotation.ranges.some(([start, end]) => line >= start && line <= end);
    })) visible.add(index);
  }
  const blocks: DiffBlock[] = [];
  data.rows.forEach((_, index) => {
    const folded = !visible.has(index);
    const last = blocks.at(-1);
    if (last?.folded === folded) last.indices.push(index);
    else blocks.push({ folded, indices: [index] });
  });
  return blocks;
}

export function diffLineEndings(code: string): string {
  if (!code) return 'File rỗng';
  const endings = new Set(diffCodeLines(code).map((line) => line.ending).filter(Boolean));
  const label = endings.size > 1 ? 'EOL hỗn hợp' : endings.has('\r\n') ? 'CRLF' : endings.has('\r') ? 'CR' : endings.has('\n') ? 'LF' : 'Không có EOL';
  return label;
}

/** Row-index projection only, not a text diff engine. Missing sides are intentional blank cells. */
export type DiffSplitRow = { before?: number; after?: number; folded: boolean };
export function splitDiffRows(data: PreparedCodeDiff): DiffSplitRow[] {
  const folded = new Set(diffBlocks(data).filter((block) => block.folded).flatMap((block) => block.indices));
  const result: DiffSplitRow[] = [];
  let index = 0;
  while (index < data.rows.length) {
    if (data.rows[index].type === 'equal') {
      result.push({ before: index, after: index, folded: folded.has(index) }); index++;
      continue;
    }
    const before: number[] = []; const after: number[] = [];
    while (index < data.rows.length && data.rows[index].type !== 'equal') {
      (data.rows[index].type === 'remove' ? before : after).push(index++);
    }
    for (let pair = 0; pair < Math.max(before.length, after.length); pair++) result.push({
      ...(before[pair] !== undefined ? { before: before[pair] } : {}),
      ...(after[pair] !== undefined ? { after: after[pair] } : {}), folded: false,
    });
  }
  return result;
}
