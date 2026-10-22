export type ExampleVersion = Readonly<{
  id: string;
  title: string;
  src: string;
  sourceUrl?: string;
}>;
export type ExampleDefinition = Readonly<{
  id: string;
  title: string;
  defaultVersion: string;
  versions: readonly ExampleVersion[];
}>;
export type ExampleRequest = Readonly<{ example: string; version?: string }>;

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value);
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();

export function validateExampleURL(value: unknown, label = 'URL'): asserts value is string {
  const fail = (): never => { throw new TypeError(`Example ${label} must use HTTP(S) without credentials, or a root-relative path`); };
  if (typeof value !== 'string' || value !== value.trim() || /[\\\u0000-\u0020]/.test(value)) fail();
  if ((value as string).startsWith('/') && !(value as string).startsWith('//')) return;
  let url: URL;
  try { url = new URL(value as string); } catch { fail(); }
  if (!['https:', 'http:'].includes(url!.protocol) || url!.username || url!.password) fail();
}

/** Host-owned metadata only. Do not accept arbitrary URLs from query parameters. */
export function validateExamples(value: unknown): asserts value is readonly ExampleDefinition[] {
  if (!Array.isArray(value)) throw new TypeError('Examples must be an array');
  const ids = new Set<string>();
  for (const example of value) {
    if (!record(example) || !identifier(example.id) || !text(example.title)
      || !identifier(example.defaultVersion) || !Array.isArray(example.versions) || !example.versions.length) {
      throw new TypeError('Invalid example definition');
    }
    if (ids.has(example.id)) throw new TypeError(`Duplicate example: ${example.id}`);
    ids.add(example.id);
    const versions = new Set<string>();
    for (const version of example.versions) {
      if (!record(version) || !identifier(version.id) || !text(version.title)) throw new TypeError('Invalid example version');
      if (versions.has(version.id)) throw new TypeError(`Duplicate example version: ${version.id}`);
      versions.add(version.id);
      validateExampleURL(version.src, 'src');
      if (version.sourceUrl !== undefined) validateExampleURL(version.sourceUrl, 'sourceUrl');
    }
    if (!versions.has(example.defaultVersion)) throw new TypeError(`Missing default version: ${example.id}`);
  }
}
export function validateExampleRequest(value: unknown): asserts value is ExampleRequest {
  if (!record(value) || !identifier(value.example) || (value.version !== undefined && !identifier(value.version))) {
    throw new TypeError('Example request needs valid example/version IDs');
  }
}
export function resolveExample(examples: readonly ExampleDefinition[], request: ExampleRequest) {
  validateExampleRequest(request);
  const example = examples.find(item => item.id === request.example);
  if (!example) throw new Error(`Không tìm thấy example “${request.example}”.`);
  const version = example.versions.find(item => item.id === (request.version ?? example.defaultVersion));
  if (!version) throw new Error(`Phiên bản “${request.version}” của example không tồn tại.`);
  return { example, version };
}

export function readExampleURL(url: URL): ExampleRequest | null {
  const example = url.searchParams.get('example');
  if (!example) return null;
  const request = { example, version: url.searchParams.get('exampleVersion') || undefined };
  try { validateExampleRequest(request); return request; } catch { return null; }
}
export function writeExampleURL(url: URL, request: ExampleRequest | null): URL {
  const next = new URL(url);
  next.searchParams.delete('example');
  next.searchParams.delete('exampleVersion');
  if (request) {
    validateExampleRequest(request);
    next.searchParams.set('example', request.example);
    if (request.version) next.searchParams.set('exampleVersion', request.version);
  }
  return next;
}
