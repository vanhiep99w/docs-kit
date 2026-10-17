export type ConcurrencyLane = { id: string; label: string; description?: string };
export type ConcurrencyEvent = { id: string; lane: string; at: number; label: string; description?: string };
export type ConcurrencyInterval = {
  id: string; lane: string; start: number; end: number;
  kind: 'work' | 'wait' | 'hold'; label: string; description?: string;
};
/** References discrete events only. A label is an author's assertion, not a verified causal edge. */
export type ConcurrencyRelation = { id: string; from: string; to: string; label: string; description: string };
export type ConcurrencyLanesData = {
  title: string;
  description?: string;
  unit: 'step' | 'ms' | 'us' | 's';
  provenance: { kind: 'illustrative' | 'measured'; description: string };
  lanes: ConcurrencyLane[];
  events: ConcurrencyEvent[];
  intervals?: ConcurrencyInterval[];
  relations?: ConcurrencyRelation[];
};
export type ConcurrencyPosition = {
  id: string; lane: string; number: number; type: 'event' | 'interval';
  x: number; endX: number; y: number; track: number;
};
export type ConcurrencyLayout = {
  width: number; height: number; extent: number; end: number;
  lanes: { id: string; top: number; height: number; tracks: number }[];
  items: ConcurrencyPosition[];
};

function fail(message: string): never { throw new Error(`Concurrency Lanes: ${message}`); }
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
function array(value: unknown, path: string, max: number): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length > max) fail(`${path} must be an array of at most ${max} entries.`);
}

export function validateConcurrencyLanes(value: unknown): asserts value is ConcurrencyLanesData {
  if (!record(value)) fail('expected an object.');
  keys(value, ['title', 'description', 'unit', 'provenance', 'lanes', 'events', 'intervals', 'relations'], 'diagram');
  text(value.title, 'title');
  if (value.description !== undefined) text(value.description, 'description');
  if (!['step', 'ms', 'us', 's'].includes(value.unit as string)) fail('unit must be step, ms, us or s.');
  if (!record(value.provenance)) fail('provenance is required.');
  keys(value.provenance, ['kind', 'description'], 'provenance');
  if (!['illustrative', 'measured'].includes(value.provenance.kind as string)) fail('invalid provenance.kind.');
  text(value.provenance.description, 'provenance.description');
  let budget = value.title.length + ((value.description as string | undefined)?.length ?? 0) + value.provenance.description.length;
  const logical = value.unit === 'step';
  const ids = new Set<string>();
  const laneIds = new Set<string>(); const eventIds = new Set<string>();
  function entry(item: unknown, allowed: string[], path: string): asserts item is Record<string, unknown> {
    if (!record(item)) fail(`${path} must be an object.`);
    keys(item, allowed, path); identifier(item.id, `${path}.id`);
    if (ids.has(item.id)) fail(`duplicate id "${item.id}"; IDs must be unique across lanes, items and relations.`);
    ids.add(item.id);
    text(item.label, `${path}.label`);
    if (item.description !== undefined) text(item.description, `${path}.description`);
    budget += item.label.length + ((item.description as string | undefined)?.length ?? 0);
  }
  function coordinate(at: unknown, path: string): asserts at is number {
    if (typeof at !== 'number' || !Number.isFinite(at) || at < 0 || at > 1e12 || (logical && !Number.isSafeInteger(at))) fail(`${path} must be finite, non-negative and <= 1e12; step coordinates must be integers.`);
  }
  array(value.lanes, 'lanes', 16);
  if (!value.lanes.length) fail('at least one lane is required.');
  for (const lane of value.lanes) {
    entry(lane, ['id', 'label', 'description'], 'lane'); laneIds.add(lane.id as string);
  }
  array(value.events, 'events', 256);
  for (const event of value.events) {
    entry(event, ['id', 'lane', 'at', 'label', 'description'], 'event');
    identifier(event.lane, 'event.lane');
    if (!laneIds.has(event.lane)) fail(`event lane "${event.lane}" does not exist.`);
    coordinate(event.at, 'event.at'); eventIds.add(event.id as string);
  }
  if (value.intervals !== undefined) {
    array(value.intervals, 'intervals', 128);
    for (const interval of value.intervals) {
      entry(interval, ['id', 'lane', 'start', 'end', 'kind', 'label', 'description'], 'interval');
      identifier(interval.lane, 'interval.lane');
      if (!laneIds.has(interval.lane)) fail(`interval lane "${interval.lane}" does not exist.`);
      coordinate(interval.start, 'interval.start'); coordinate(interval.end, 'interval.end');
      if (interval.end <= interval.start) fail('interval.end must be greater than start; use an event for an instant.');
      if (!['work', 'wait', 'hold'].includes(interval.kind as string)) fail('interval.kind must be work, wait or hold.');
    }
  }
  const total = value.events.length + ((value.intervals as unknown[] | undefined)?.length ?? 0);
  if (!total || total > 256) fail('events + intervals must contain 1–256 entries.');
  if (value.relations !== undefined) {
    array(value.relations, 'relations', 128);
    for (const relation of value.relations) {
      entry(relation, ['id', 'from', 'to', 'label', 'description'], 'relation');
      text(relation.description, 'relation.description');
      identifier(relation.from, 'relation.from'); identifier(relation.to, 'relation.to');
      if (!eventIds.has(relation.from) || !eventIds.has(relation.to)) fail('relation endpoints must reference existing events, not lanes or intervals.');
      if (relation.from === relation.to) fail('a relation cannot point to the same event.');
    }
  }
  if (budget > 1048576) fail('text exceeds 1048576 UTF-16 code units.');
}

const WIDTH = 640;
const PADDING = 24;
const TRACK = 36;

/** Pure bounded geometry. Only vertical stacking changes to avoid collisions, never time coordinates. */
export function layoutConcurrencyLanes(data: ConcurrencyLanesData): ConcurrencyLayout {
  validateConcurrencyLanes(data);
  const all = [
    ...data.events.map((item, index) => ({ id: item.id, lane: item.lane, start: item.at, end: item.at, number: index + 1, type: 'event' as const })),
    ...(data.intervals ?? []).map((item, index) => ({ id: item.id, lane: item.lane, start: item.start, end: item.end, number: data.events.length + index + 1, type: 'interval' as const })),
  ];
  const end = Math.max(...all.map((item) => item.end));
  const extent = end || 1;
  const x = (at: number) => PADDING + at / extent * (WIDTH - PADDING * 2);
  const items: ConcurrencyPosition[] = [];
  const lanes: ConcurrencyLayout['lanes'] = [];
  let top = 0;
  for (const lane of data.lanes) {
    const trackEnds: number[] = [];
    const entries = all.filter((item) => item.lane === lane.id).sort((a, b) => a.start - b.start || a.number - b.number);
    for (const item of entries) {
      const startX = x(item.start); const endX = x(item.end); const center = (startX + endX) / 2;
      // Number badges occupy 28px even when an interval is very short.
      const left = Math.min(startX, center - 14); const right = Math.max(endX, center + 14);
      let track = trackEnds.findIndex((previous) => previous + 8 < left);
      if (track === -1) track = trackEnds.length;
      trackEnds[track] = right;
      items.push({ id: item.id, lane: lane.id, number: item.number, type: item.type, x: startX, endX, y: top + 28 + track * TRACK, track });
    }
    const tracks = Math.max(1, trackEnds.length);
    const height = tracks * TRACK + 20;
    lanes.push({ id: lane.id, top, height, tracks }); top += height;
  }
  return { width: WIDTH, height: top, extent, end, lanes, items };
}
export function formatConcurrencyTime(value: number): string { return String(Number(value.toPrecision(12))); }
