// Visual-column semantics adapted from rxjs-learn/components/marble-diagram.tsx.
// This is deliberately NOT the RxJS TestScheduler parser.

export type MarbleTokenType = 'next' | 'complete' | 'error' | 'subscribe' | 'unsubscribe';
export type MarbleToken = { frame: number; type: MarbleTokenType; value?: string };
export type MarbleRow = {
  id?: string;
  label: string;
  marble: string;
  kind?: 'source' | 'inner' | 'output' | 'subscription';
};
export type MarbleAnnotation = {
  id: string;
  /** References an explicit rows[].id. */
  row: string;
  /** Zero-based inclusive visual frame range on the shared axis. */
  frames: [start: number, end: number];
  title: string;
  description: string;
};
export type MarbleDiagramData = {
  title: string;
  rows: readonly MarbleRow[];
  caption?: string;
  /** Describes the scale; defaults to illustrative frames, never implicitly milliseconds. */
  frameLabel?: string;
  values?: Readonly<Record<string, string>>;
  showLegend?: boolean;
  /** Opt-in remark launcher; direct JSX uses MarbleZoomDiagram explicitly. */
  zoom?: boolean;
  annotations?: readonly MarbleAnnotation[];
};
export type ParsedMarbleRow = MarbleRow & { frameCount: number; tokens: MarbleToken[] };
export type PreparedMarbleDiagram = { rows: ParsedMarbleRow[]; frameCount: number };

export const marbleSyntaxLabels: Record<MarbleTokenType, string> = {
  next: 'Next',
  complete: 'Complete',
  error: 'Error',
  subscribe: 'Subscribe',
  unsubscribe: 'Unsubscribe',
};
export const marbleSymbols: Record<MarbleTokenType, string> = {
  next: 'a', complete: '|', error: '#', subscribe: '^', unsubscribe: '!',
};

const MAX_ROWS = 40;
const MAX_FRAMES = 512;
const MAX_GROUP = 12;
const characterTypes: Record<string, MarbleTokenType> = { '|': 'complete', '#': 'error', '^': 'subscribe', '!': 'unsubscribe' };
const identifier = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

function fail(message: string): never {
  throw new Error(`Marble Diagram: ${message}`);
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, allowed: string[], path: string) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`unknown property ${path}.${key}.`);
}
function text(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) fail(`${name} must be a non-empty string.`);
}
function optionalText(value: unknown, name: string) {
  if (value !== undefined) text(value, name);
}
function rowShape(value: unknown): asserts value is MarbleRow {
  if (!record(value)) fail('each row must be an object.');
  keys(value, ['id', 'label', 'marble', 'kind'], 'row');
  text(value.label, 'row.label');
  if (typeof value.marble !== 'string') fail('row.marble must be a string.');
  if (value.id !== undefined && (typeof value.id !== 'string' || !identifier.test(value.id))) fail('row.id must be an ASCII identifier.');
  if (value.kind !== undefined && !['source', 'inner', 'output', 'subscription'].includes(value.kind as string)) fail('invalid row.kind.');
}

/**
 * Every token and '-' occupies one visual column; a group occupies ONE column.
 * Whitespace is ignored. '^' is a lifecycle marker, not a hot-observable zero.
 */
export function parseMarble(row: MarbleRow): ParsedMarbleRow {
  rowShape(row);
  if (row.marble.length > 4096) fail(`row "${row.label}" exceeds 4096 characters.`);
  if (/\d+(?:\.\d+)?(?:ms|s|m)/.test(row.marble)) fail(`row "${row.label}": time-progression syntax is unsupported; use '-' and frameLabel.`);
  const tokens: MarbleToken[] = [];
  let frame = 0;
  let ended = false;
  let subscribed = false;

  function emit(character: string) {
    if (!/^[a-zA-Z0-9|#!^]$/.test(character)) fail(`row "${row.label}": unsupported symbol "${character}".`);
    if (ended) fail(`row "${row.label}": an event follows a terminal marker or unsubscribe.`);
    const type = characterTypes[character] ?? 'next';
    if (type === 'subscribe') {
      if (subscribed) fail(`row "${row.label}": duplicate subscribe; use a separate row for each execution.`);
      subscribed = true;
    }
    tokens.push(type === 'next' ? { frame, type, value: character } : { frame, type });
    if (type === 'complete' || type === 'error' || type === 'unsubscribe') ended = true;
  }

  for (let index = 0; index < row.marble.length; index++) {
    const character = row.marble[index];
    if (/\s/.test(character)) continue;
    if (character === '-') frame++;
    else if (character === '(') {
      const end = row.marble.indexOf(')', index + 1);
      if (end === -1) fail(`row "${row.label}": unclosed group.`);
      const group = row.marble.slice(index + 1, end).replace(/\s/g, '');
      if (!group || group.length > MAX_GROUP) fail(`row "${row.label}": groups must contain 1–${MAX_GROUP} events.`);
      for (const entry of group) emit(entry);
      frame++;
      index = end;
    } else {
      emit(character);
      frame++;
    }
    if (frame > MAX_FRAMES) fail(`row "${row.label}" exceeds ${MAX_FRAMES} visual frames.`);
  }
  return { ...row, tokens, frameCount: Math.max(frame, 1) };
}

/** Runtime-safe parser and validation shared by the build plugin and React component. */
export function prepareMarbleDiagram(value: MarbleDiagramData): PreparedMarbleDiagram {
  if (!record(value)) fail('expected an object.');
  keys(value, ['title', 'rows', 'caption', 'frameLabel', 'values', 'showLegend', 'annotations', 'zoom'], 'diagram');
  text(value.title, 'title');
  optionalText(value.caption, 'caption');
  optionalText(value.frameLabel, 'frameLabel');
  if (value.showLegend !== undefined && typeof value.showLegend !== 'boolean') fail('showLegend must be boolean.');
  if (value.zoom !== undefined && typeof value.zoom !== 'boolean') fail('zoom must be boolean.');
  if (!Array.isArray(value.rows) || !value.rows.length || value.rows.length > MAX_ROWS) fail(`rows must contain 1–${MAX_ROWS} rows.`);
  const rows = Array.from(value.rows, (row) => parseMarble(row));
  const frameCount = Math.max(...rows.map((row) => row.frameCount));
  const rowIds = new Set<string>();
  for (const row of rows) {
    if (row.id !== undefined) {
      if (rowIds.has(row.id)) fail(`duplicate row id "${row.id}".`);
      rowIds.add(row.id);
    }
  }
  if (value.values !== undefined) {
    if (!record(value.values)) fail('values must be a string map.');
    for (const [key, description] of Object.entries(value.values)) {
      if (!/^[a-zA-Z0-9]$/.test(key)) fail('value keys must be single ASCII letters or digits.');
      text(description, `values.${key}`);
    }
  }
  if (value.annotations !== undefined) {
    if (!Array.isArray(value.annotations) || !value.annotations.length || value.annotations.length > 100) fail('annotations must contain 1–100 entries when supplied.');
    const ids = new Set<string>();
    for (const annotation of value.annotations) {
      if (!record(annotation)) fail('each annotation must be an object.');
      keys(annotation, ['id', 'row', 'frames', 'title', 'description'], 'annotation');
      if (typeof annotation.id !== 'string' || !identifier.test(annotation.id)) fail('annotation.id must be an ASCII identifier.');
      if (ids.has(annotation.id)) fail(`duplicate annotation id "${annotation.id}".`);
      ids.add(annotation.id);
      if (typeof annotation.row !== 'string' || !rowIds.has(annotation.row)) fail('annotation.row must reference an explicit row.id.');
      text(annotation.title, 'annotation.title');
      text(annotation.description, 'annotation.description');
      const range = annotation.frames;
      if (!Array.isArray(range) || range.length !== 2 || !Number.isSafeInteger(range[0]) || !Number.isSafeInteger(range[1]) ||
          range[0] < 0 || range[1] < range[0] || range[1] >= frameCount) fail(`annotation.frames must be within 0–${frameCount - 1}.`);
    }
  }
  return { rows, frameCount };
}

export function validateMarbleDiagram(value: unknown): asserts value is MarbleDiagramData {
  prepareMarbleDiagram(value as MarbleDiagramData);
}

export function describeMarbleToken(token: MarbleToken, values?: Readonly<Record<string, string>>): string {
  return token.type === 'next'
    ? `Next ${token.value}${values && Object.hasOwn(values, token.value!) ? `: ${values[token.value!]}` : ''}`
    : marbleSyntaxLabels[token.type];
}
