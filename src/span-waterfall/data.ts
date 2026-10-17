import { validateDataInspectorInput, validatePreparedDataInspector, type PreparedDataInspector } from '../data-inspector/data.js';

export type SpanAnnotation = { id: string; span: string; title: string; description: string };
export type WaterfallSpan<A = string> = {
  id: string;
  name: string;
  service: string;
  parent?: string;
  /** Non-negative offset relative to the author's common origin, in `unit`. */
  start: number;
  duration: number;
  status?: 'ok' | 'error' | 'unset';
  description?: string;
  /** Strict JSON source, already filtered by the author; never auto-redacted. */
  attributes?: A;
};
export type SpanWaterfallInput = {
  title: string;
  description?: string;
  unit: 'ms' | 'us' | 's';
  provenance: { kind: 'illustrative' | 'measured'; description: string };
  spans: WaterfallSpan[];
  annotations?: SpanAnnotation[];
};
export type PreparedSpanWaterfall = Omit<SpanWaterfallInput, 'spans'> & { spans: WaterfallSpan<PreparedDataInspector>[] };
export type WaterfallRow<A = string> = { span: WaterfallSpan<A>; depth: number };

function fail(message: string): never { throw new Error(`Span Waterfall: ${message}`); }
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function keys(value: Record<string, unknown>, allowed: string[], path: string) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`unknown property ${path}.${key}.`);
}
function text(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 16384) fail(`${path} must be a non-empty string of at most 16384 UTF-16 code units.`);
}
function identifier(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)) fail(`${path} must be an ASCII identifier of at most 128 characters.`);
}

/** Stable depth-first order. Siblings retain author order, not a fabricated causal order. */
export function waterfallRows<A>(spans: WaterfallSpan<A>[]): WaterfallRow<A>[] {
  const children = new Map<string | undefined, WaterfallSpan<A>[]>();
  const ids = new Set<string>();
  for (const span of spans) {
    if (ids.has(span.id)) fail(`duplicate span id "${span.id}".`);
    ids.add(span.id);
    const siblings = children.get(span.parent) ?? [];
    siblings.push(span); children.set(span.parent, siblings);
  }
  for (const span of spans) if (span.parent !== undefined && !ids.has(span.parent)) fail(`parent "${span.parent}" does not exist.`);
  const rows: WaterfallRow<A>[] = [];
  function walk(parent: string | undefined, depth: number) {
    for (const span of children.get(parent) ?? []) {
      if (depth > 16) fail('hierarchy exceeds depth 16.');
      rows.push({ span, depth }); walk(span.id, depth + 1);
    }
  }
  walk(undefined, 0);
  if (rows.length !== spans.length) fail('parent hierarchy contains a cycle.');
  return rows;
}

function validate(value: unknown, prepared: boolean) {
  if (!record(value)) fail('expected an object.');
  keys(value, ['title', 'description', 'unit', 'provenance', 'spans', 'annotations'], 'waterfall');
  text(value.title, 'title');
  if (value.description !== undefined) text(value.description, 'description');
  if (!['ms', 'us', 's'].includes(value.unit as string)) fail('unit must be ms, us or s.');
  if (!record(value.provenance)) fail('provenance is required.');
  keys(value.provenance, ['kind', 'description'], 'provenance');
  if (!['illustrative', 'measured'].includes(value.provenance.kind as string)) fail('provenance.kind must be illustrative or measured.');
  text(value.provenance.description, 'provenance.description');
  if (!Array.isArray(value.spans) || !value.spans.length || value.spans.length > 256) fail('spans must contain 1–256 entries.');
  let budget = value.title.length + ((value.description as string | undefined)?.length ?? 0);
  budget += value.provenance.description.length;
  const ids = new Set<string>();
  for (const span of value.spans) {
    if (!record(span)) fail('each span must be an object.');
    keys(span, ['id', 'name', 'service', 'parent', 'start', 'duration', 'status', 'description', 'attributes'], 'span');
    identifier(span.id, 'span.id');
    if (ids.has(span.id)) fail(`duplicate span id "${span.id}".`);
    ids.add(span.id);
    text(span.name, 'span.name'); text(span.service, 'span.service');
    if (span.parent !== undefined) identifier(span.parent, 'span.parent');
    for (const key of ['start', 'duration']) {
      if (typeof span[key] !== 'number' || !Number.isFinite(span[key]) || (span[key] as number) < 0 || (span[key] as number) > 1e12) fail(`span.${key} must be finite and between 0 and 1e12.`);
    }
    const start = span.start as number; const duration = span.duration as number;
    if (start + duration > 1e12 || (duration > 0 && start + duration === start)) fail('span end exceeds 1e12 or duration is below numeric precision at this start.');
    if (span.status !== undefined && !['ok', 'error', 'unset'].includes(span.status as string)) fail('invalid span.status.');
    if (span.description !== undefined) text(span.description, 'span.description');
    if (span.attributes !== undefined) {
      if (prepared) validatePreparedDataInspector(span.attributes);
      else validateDataInspectorInput({ title: 'Attributes', json: span.attributes });
      budget += prepared ? (span.attributes as PreparedDataInspector).json.length : (span.attributes as string).length;
    }
    budget += span.name.length + span.service.length + ((span.description as string | undefined)?.length ?? 0);
  }
  waterfallRows(value.spans as WaterfallSpan[]);
  if (value.annotations !== undefined) {
    if (!Array.isArray(value.annotations) || !value.annotations.length || value.annotations.length > 100) fail('annotations must contain 1–100 entries.');
    const annotationIds = new Set<string>();
    for (const annotation of value.annotations) {
      if (!record(annotation)) fail('each annotation must be an object.');
      keys(annotation, ['id', 'span', 'title', 'description'], 'annotation');
      identifier(annotation.id, 'annotation.id'); identifier(annotation.span, 'annotation.span');
      if (annotationIds.has(annotation.id)) fail('duplicate annotation id.');
      annotationIds.add(annotation.id);
      if (!ids.has(annotation.span)) fail(`annotation span "${annotation.span}" does not exist.`);
      text(annotation.title, 'annotation.title'); text(annotation.description, 'annotation.description');
      budget += annotation.title.length + annotation.description.length;
    }
  }
  if (budget > 1048576) fail('text sources exceed 1048576 UTF-16 code units.');
}
export function validateSpanWaterfallInput(value: unknown): asserts value is SpanWaterfallInput { validate(value, false); }
export function validatePreparedSpanWaterfall(value: unknown): asserts value is PreparedSpanWaterfall { validate(value, true); }

/** Domain always begins at the declared common origin, including leading idle time. */
export function waterfallExtent(spans: Pick<WaterfallSpan, 'start' | 'duration'>[]): number {
  return Math.max(...spans.map((span) => span.start + span.duration)) || 1;
}
export function formatSpanTime(value: number): string { return String(Number(value.toPrecision(12))); }
