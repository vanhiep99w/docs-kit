import { validateDataInspectorInput, validatePreparedDataInspector, type InspectorAnnotation, type PreparedDataInspector } from '../data-inspector/data.js';

export type ProtocolHeader = { id: string; name: string; value: string };
export type ProtocolBodyInput =
  | { kind: 'text'; text: string }
  | { kind: 'json'; json: string; expandedDepth?: number; annotations?: InspectorAnnotation[] };
export type PreparedProtocolBody =
  | { kind: 'text'; text: string }
  | { kind: 'json'; data: PreparedDataInspector };
export type ProtocolRequest<B = ProtocolBodyInput> = {
  method: string;
  /** Origin-relative target or absolute HTTP(S) URL. Display only, never fetched. */
  url: string;
  headers?: ProtocolHeader[];
  body?: B;
};
export type ProtocolResponse<B = ProtocolBodyInput> = {
  status: number;
  statusText?: string;
  headers?: ProtocolHeader[];
  body?: B;
};
export type ProtocolAnnotation = {
  id: string;
  side: 'request' | 'response';
  target: 'start' | 'header' | 'body';
  /** References the header ID, not its name; repeated names are allowed. */
  header?: string;
  title: string;
  description: string;
};
export type ProtocolVariant<B = ProtocolBodyInput> = {
  id: string;
  title: string;
  description?: string;
  request: ProtocolRequest<B>;
  response: ProtocolResponse<B>;
  annotations?: ProtocolAnnotation[];
};
export type ProtocolExchangeInput = { title: string; description?: string; variants: ProtocolVariant[] };
export type PreparedProtocolExchange = Omit<ProtocolExchangeInput, 'variants'> & { variants: ProtocolVariant<PreparedProtocolBody>[] };

const identifier = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const headerName = /^[!#$%&'*+.^_`|~0-9a-zA-Z-]+$/;
function fail(message: string): never { throw new Error(`Protocol Exchange: ${message}`); }
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, allowed: string[], path: string) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`unknown property ${path}.${key}.`);
}
function text(value: unknown, path: string, allowEmpty = false): asserts value is string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) fail(`${path} must be a ${allowEmpty ? '' : 'non-empty '}string.`);
}
function optionalText(value: unknown, path: string) { if (value !== undefined) text(value, path); }
function line(value: unknown, path: string, allowEmpty = false): asserts value is string {
  text(value, path, allowEmpty);
  if (/[\x00-\x08\x0A-\x1F\x7F]/.test(value)) fail(`${path} must be a single line without control characters.`);
}
function id(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || !identifier.test(value)) fail(`${path} must be an ASCII identifier.`);
}
function headers(value: unknown, path: string) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > 64) fail(`${path} must be an ordered array of at most 64 headers.`);
  const ids = new Set<string>();
  for (const header of value) {
    if (!record(header)) fail(`${path}: each header must be an object.`);
    keys(header, ['id', 'name', 'value'], path);
    id(header.id, `${path}.id`);
    if (ids.has(header.id)) fail(`${path}: duplicate header id "${header.id}".`);
    ids.add(header.id);
    if (typeof header.name !== 'string' || !headerName.test(header.name)) fail(`${path}.name must be an HTTP field-name token, not a pseudo-header.`);
    line(header.value, `${path}.value`, true);
    if (header.value.length > 8192) fail(`${path}.value exceeds 8192 characters.`);
  }
}
function body(value: unknown, path: string, prepared: boolean) {
  if (value === undefined) return;
  if (!record(value)) fail(`${path} must be an object.`);
  if (value.kind === 'text') {
    keys(value, ['kind', 'text'], path);
    text(value.text, `${path}.text`, true);
    if (value.text.length > 262144) fail(`${path}.text exceeds 262144 characters.`);
  } else if (value.kind === 'json') {
    try {
      if (prepared) {
        keys(value, ['kind', 'data'], path);
        validatePreparedDataInspector(value.data);
      } else {
        keys(value, ['kind', 'json', 'expandedDepth', 'annotations'], path);
        validateDataInspectorInput({
          title: 'JSON body', json: value.json,
          ...(value.expandedDepth !== undefined ? { expandedDepth: value.expandedDepth } : {}),
          ...(value.annotations !== undefined ? { annotations: value.annotations } : {}),
        });
      }
    } catch (error) { fail(`${path}: ${error instanceof Error ? error.message : String(error)}`); }
  } else fail(`${path}.kind must be text or json.`);
}
function validate(value: unknown, prepared: boolean) {
  if (!record(value)) fail('expected an object.');
  keys(value, ['title', 'description', 'variants'], 'exchange');
  text(value.title, 'title'); optionalText(value.description, 'description');
  if (!Array.isArray(value.variants) || !value.variants.length || value.variants.length > 12) fail('variants must contain 1–12 entries.');
  const ids = new Set<string>();
  let sourceSize = 0;
  for (const variant of value.variants) {
    if (!record(variant)) fail('each variant must be an object.');
    keys(variant, ['id', 'title', 'description', 'request', 'response', 'annotations'], 'variant');
    id(variant.id, 'variant.id');
    if (ids.has(variant.id)) fail(`duplicate variant id "${variant.id}".`);
    ids.add(variant.id);
    text(variant.title, 'variant.title'); optionalText(variant.description, 'variant.description');
    const request = variant.request;
    const response = variant.response;
    if (!record(request) || !record(response)) fail('each variant needs request and response objects.');
    keys(request, ['method', 'url', 'headers', 'body'], 'request');
    keys(response, ['status', 'statusText', 'headers', 'body'], 'response');
    if (typeof request.method !== 'string' || !/^[!#$%&'*+.^_`|~0-9A-Z-]+$/.test(request.method)) fail('request.method must be an uppercase HTTP method token.');
    line(request.url, 'request.url');
    if (request.url.length > 8192 || /\s/.test(request.url) || request.url.includes('#') || request.url.includes('\\')) fail('request.url must not contain whitespace, fragments or backslashes and must be at most 8192 characters.');
    if (!request.url.startsWith('/') && !/^https?:\/\//i.test(request.url) || request.url.startsWith('//')) fail('request.url must be origin-relative or an absolute HTTP(S) URL.');
    if (!request.url.startsWith('/')) {
      try {
        const url = new URL(request.url);
        if (!url.hostname || url.username || url.password) fail('request.url must not contain embedded credentials.');
      } catch (error) { fail(`invalid request.url: ${error instanceof Error ? error.message : String(error)}`); }
    }
    if (!Number.isInteger(response.status) || (response.status as number) < 100 || (response.status as number) > 599) fail('response.status must be an integer from 100 to 599.');
    if (response.statusText !== undefined) line(response.statusText, 'response.statusText');
    if (response.body !== undefined && (request.method === 'HEAD' || (response.status as number) < 200 || [204, 205, 304].includes(response.status as number))) fail('response.body must be omitted for HEAD, 1xx, 204, 205 and 304 responses.');
    for (const side of ['request', 'response'] as const) {
      const message = variant[side] as Record<string, unknown>;
      headers(message.headers, `${side}.headers`);
      body(message.body, `${side}.body`, prepared);
      if (message.body !== undefined) {
        const content = message.body as Record<string, unknown>;
        sourceSize += content.kind === 'text' ? (content.text as string).length :
          prepared ? (content.data as PreparedDataInspector).json.length : (content.json as string).length;
      }
    }
    if (variant.annotations !== undefined) {
      if (!Array.isArray(variant.annotations) || !variant.annotations.length || variant.annotations.length > 100) fail('variant.annotations must contain 1–100 entries when supplied.');
      const annotationIds = new Set<string>();
      for (const annotation of variant.annotations) {
        if (!record(annotation)) fail('each annotation must be an object.');
        keys(annotation, ['id', 'side', 'target', 'header', 'title', 'description'], 'annotation');
        id(annotation.id, 'annotation.id');
        if (annotationIds.has(annotation.id)) fail(`duplicate annotation id "${annotation.id}".`);
        annotationIds.add(annotation.id);
        text(annotation.title, 'annotation.title'); text(annotation.description, 'annotation.description');
        if (annotation.side !== 'request' && annotation.side !== 'response') fail('annotation.side must be request or response.');
        const message = variant[annotation.side] as Record<string, unknown>;
        if (!['start', 'header', 'body'].includes(annotation.target as string)) fail('annotation.target must be start, header or body.');
        if (annotation.target === 'header') {
          if (typeof annotation.header !== 'string' || !(message.headers as ProtocolHeader[] | undefined)?.some((header) => header.id === annotation.header)) fail('annotation.header must reference a header ID on the specified side.');
        } else if (annotation.header !== undefined) fail('annotation.header is only allowed for target=header.');
        if (annotation.target === 'body' && message.body === undefined) fail('body annotation must reference a body that exists.');
      }
    }
  }
  if (sourceSize > 1048576) fail('combined body sources exceed 1048576 characters.');
}
export function validateProtocolExchangeInput(value: unknown): asserts value is ProtocolExchangeInput { validate(value, false); }
export function validatePreparedProtocolExchange(value: unknown): asserts value is PreparedProtocolExchange { validate(value, true); }

export function protocolBodySource(body?: PreparedProtocolBody): string | undefined {
  return body === undefined ? undefined : body.kind === 'json' ? body.data.json : body.text;
}

/** Human-readable transcript, not a wire request or executable curl command. */
export function formatProtocolMessage(variant: ProtocolVariant<PreparedProtocolBody>, side: 'request' | 'response'): string {
  const message = variant[side];
  const start = side === 'request' ? `${variant.request.method} ${variant.request.url}` :
    `${variant.response.status}${variant.response.statusText ? ` ${variant.response.statusText}` : ''}`;
  const fields = (message.headers ?? []).map((header) => `${header.name}: ${header.value}`);
  const source = protocolBodySource(message.body);
  return [start, ...fields].join('\r\n') + (source !== undefined ? '\r\n\r\n' + source : '');
}
