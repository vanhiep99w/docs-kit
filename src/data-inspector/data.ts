export type InspectorNodeType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
export type InspectorAnnotation = { id: string; pointer: string; title: string; description: string };
export type DataInspectorInput = {
  title: string;
  /** Strict JSON source, not a JavaScript value; number lexemes remain lossless. */
  json: string;
  description?: string;
  expandedDepth?: number;
  annotations?: InspectorAnnotation[];
};
export type InspectorNode = {
  pointer: string;
  /** Decoded object key / array index; root uses (root). */
  key: string;
  type: InspectorNodeType;
  offset: number;
  length: number;
  children: string[];
};
export type PreparedDataInspector = DataInspectorInput & { nodes: InspectorNode[] };
export type InspectorSearchResult = { matches: string[]; visible: string[]; ancestors: string[] };

function fail(message: string): never { throw new Error(`Data Inspector: ${message}`); }
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, allowed: string[], path: string) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`unknown property ${path}.${key}.`);
}
function text(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) fail(`${path} must be a non-empty string.`);
}

export function encodeJSONPointer(segments: readonly (string | number)[]): string {
  return segments.map((segment) => {
    if (typeof segment !== 'string' && (!Number.isSafeInteger(segment) || segment < 0)) fail('pointer segments must be strings or non-negative safe integers.');
    return '/' + String(segment).replace(/~/g, '~0').replace(/\//g, '~1');
  }).join('');
}

export function decodeJSONPointer(pointer: string): string[] {
  if (typeof pointer !== 'string' || (pointer !== '' && !pointer.startsWith('/')) || /~(?![01])/.test(pointer)) fail('expected an RFC 6901 JSON Pointer, not JSONPath or a URI fragment.');
  return pointer === '' ? [] : pointer.slice(1).split('/').map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
}

export function inspectorParent(pointer: string): string | undefined {
  return pointer === '' ? undefined : pointer.slice(0, pointer.lastIndexOf('/'));
}

function validate(value: unknown, prepared: boolean): asserts value is DataInspectorInput {
  if (!record(value)) fail('expected an object.');
  keys(value, ['title', 'json', 'description', 'expandedDepth', 'annotations', ...(prepared ? ['nodes'] : [])], 'inspector');
  text(value.title, 'title'); text(value.json, 'json');
  if (value.json.length > 262144) fail('json exceeds 262144 UTF-16 code units.');
  if (value.description !== undefined) text(value.description, 'description');
  if (value.expandedDepth !== undefined && (!Number.isInteger(value.expandedDepth) || (value.expandedDepth as number) < 0 || (value.expandedDepth as number) > 8)) fail('expandedDepth must be an integer from 0 to 8.');
  if (value.annotations !== undefined) {
    if (!Array.isArray(value.annotations) || !value.annotations.length || value.annotations.length > 100) fail('annotations must contain 1–100 entries when supplied.');
    const ids = new Set<string>();
    for (const annotation of value.annotations) {
      if (!record(annotation)) fail('each annotation must be an object.');
      keys(annotation, ['id', 'pointer', 'title', 'description'], 'annotation');
      if (typeof annotation.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(annotation.id)) fail('annotation.id must be an ASCII identifier.');
      if (ids.has(annotation.id)) fail(`duplicate annotation id "${annotation.id}".`);
      ids.add(annotation.id);
      if (typeof annotation.pointer !== 'string') fail('annotation.pointer must be a string, including empty string for root.');
      decodeJSONPointer(annotation.pointer);
      text(annotation.title, 'annotation.title'); text(annotation.description, 'annotation.description');
    }
  }
}

export function validateDataInspectorInput(value: unknown): asserts value is DataInspectorInput { validate(value, false); }

/** Structural checks only. Strict JSON syntax and duplicate keys are checked by the build parser. */
export function validatePreparedDataInspector(value: unknown): asserts value is PreparedDataInspector {
  validate(value, true);
  const data = value as PreparedDataInspector;
  if (!Array.isArray(data.nodes) || !data.nodes.length || data.nodes.length > 1024) fail('nodes must contain 1–1024 entries.');
  const byPointer = new Map<string, InspectorNode>();
  for (const node of data.nodes) {
    if (!record(node)) fail('each node must be an object.');
    keys(node, ['pointer', 'key', 'type', 'offset', 'length', 'children'], 'node');
    if (typeof node.pointer !== 'string' || typeof node.key !== 'string') fail('node.pointer and node.key must be strings.');
    const segments = decodeJSONPointer(node.pointer);
    if (segments.length > 32) fail('JSON exceeds 32 levels of nesting.');
    if (byPointer.has(node.pointer)) fail(`duplicate pointer "${node.pointer}".`);
    if (!['object', 'array', 'string', 'number', 'boolean', 'null'].includes(node.type)) fail('invalid node.type.');
    if (!Number.isSafeInteger(node.offset) || !Number.isSafeInteger(node.length) || node.offset < 0 || node.length < 1 || node.offset + node.length > data.json.length) fail('node offsets must be inside json.');
    if (!Array.isArray(node.children) || new Set(node.children).size !== node.children.length || node.children.some((entry) => typeof entry !== 'string')) fail('node.children must contain unique pointers.');
    const parent = inspectorParent(node.pointer);
    if (parent === undefined) {
      if (byPointer.size !== 0 || node.key !== '(root)' || data.json.slice(0, node.offset).trim() || data.json.slice(node.offset + node.length).trim()) fail('the first node must cover the root JSON value.');
    } else {
      const owner = byPointer.get(parent);
      if (!owner || !owner.children.includes(node.pointer) || node.key !== segments.at(-1) || node.offset <= owner.offset || node.offset + node.length >= owner.offset + owner.length) fail('nodes must follow their declared parents with matching keys and offsets.');
    }
    const raw = data.json.slice(node.offset, node.offset + node.length);
    if (node.type === 'object' || node.type === 'array') {
      if (raw[0] !== (node.type === 'object' ? '{' : '[') || raw.at(-1) !== (node.type === 'object' ? '}' : ']')) fail('container node does not match its source delimiters.');
    } else {
      if (node.children.length) fail('scalar nodes cannot have children.');
      if (node.type === 'number' && !/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(raw)) fail('number node must retain a JSON number lexeme.');
      if (node.type === 'boolean' && raw !== 'true' && raw !== 'false') fail('boolean node must contain true or false.');
      if (node.type === 'null' && raw !== 'null') fail('null node must contain null.');
      if (node.type === 'string') {
        try { if (typeof JSON.parse(raw) !== 'string') fail('string node must contain a JSON string.'); }
        catch { fail('invalid string node.'); }
      }
    }
    byPointer.set(node.pointer, node);
  }
  for (const node of data.nodes) {
    let previousEnd = node.offset;
    for (const [index, pointer] of node.children.entries()) {
      const child = byPointer.get(pointer);
      if (!child || inspectorParent(pointer) !== node.pointer || child.offset < previousEnd ||
        (node.type === 'array' && child.key !== String(index))) fail('child links must preserve source order and canonical array indices.');
      previousEnd = child.offset + child.length;
    }
  }
  for (const annotation of data.annotations ?? []) if (!byPointer.has(annotation.pointer)) fail(`annotation pointer "${annotation.pointer}" does not exist.`);
}

export function inspectorValue(data: PreparedDataInspector, pointer: string): string {
  const node = data.nodes.find((entry) => entry.pointer === pointer);
  if (!node) fail(`pointer "${pointer}" does not exist.`);
  return pointer === '' ? data.json : data.json.slice(node.offset, node.offset + node.length);
}

export function inspectorPreview(data: PreparedDataInspector, node: InspectorNode): string {
  if (node.type === 'object') return `{ ${node.children.length} field }`;
  if (node.type === 'array') return `[ ${node.children.length} phần tử ]`;
  const raw = data.json.slice(node.offset, node.offset + node.length);
  const compact = node.type === 'string' ? JSON.stringify(JSON.parse(raw)) : raw;
  const chars = Array.from(compact);
  return chars.length <= 120 ? compact : chars.slice(0, 120).join('') + '…';
}

export function searchInspector(data: PreparedDataInspector, query: string): InspectorSearchResult {
  const needle = query.trim().slice(0, 200).toLowerCase();
  if (!needle) return { matches: [], visible: data.nodes.map((node) => node.pointer), ancestors: [] };
  const matches: string[] = []; const visible = new Set<string>(); const ancestors = new Set<string>();
  for (const node of data.nodes) {
    const raw = node.type === 'object' || node.type === 'array' ? '' : data.json.slice(node.offset, node.offset + node.length);
    const value = node.type === 'string' ? JSON.parse(raw) as string : raw;
    if (![node.key, node.pointer, value].some((part) => part.toLowerCase().includes(needle))) continue;
    matches.push(node.pointer); visible.add(node.pointer);
    let parent = inspectorParent(node.pointer);
    while (parent !== undefined) { visible.add(parent); ancestors.add(parent); parent = inspectorParent(parent); }
  }
  return { matches, visible: [...visible], ancestors: [...ancestors] };
}

/** Annotation ancestors are open even with JS disabled. */
export function inspectorInitialExpanded(data: PreparedDataInspector): string[] {
  const expanded = new Set(data.nodes.filter((node) => node.children.length && decodeJSONPointer(node.pointer).length < (data.expandedDepth ?? 1)).map((node) => node.pointer));
  for (const annotation of data.annotations ?? []) {
    let parent = inspectorParent(annotation.pointer);
    while (parent !== undefined) { expanded.add(parent); parent = inspectorParent(parent); }
  }
  return [...expanded];
}
