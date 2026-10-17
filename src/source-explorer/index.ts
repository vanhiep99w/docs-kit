export type SourceRequest = {
  project: string;
  snapshot?: string;
  file?: string;
  region?: string;
  lines?: string;
};

export type SourceManifest = {
  id: string;
  title: string;
  defaultSnapshot: string;
  snapshots: { id: string; title: string; asset: string }[];
};

export type SourceFile = {
  path: string;
  displayPath?: string;
  language: string;
  code: string;
  html: string;
  regions: Record<string, [number, number]>;
};

export type SourceSnapshot = {
  project: string;
  snapshot: string;
  defaultFile: string;
  files: SourceFile[];
};

const keys = ['source', 'snapshot', 'file', 'region', 'lines'] as const;

export function readSourceURL(url: URL): SourceRequest | null {
  const project = url.searchParams.get('source');
  if (!project) return null;
  return {
    project,
    snapshot: url.searchParams.get('snapshot') || undefined,
    file: url.searchParams.get('file') || undefined,
    region: url.searchParams.get('region') || undefined,
    lines: url.searchParams.get('lines') || undefined,
  };
}

export function writeSourceURL(url: URL, request: SourceRequest | null): URL {
  const next = new URL(url);
  keys.forEach((key) => next.searchParams.delete(key));
  if (request) {
    next.searchParams.set('source', request.project);
    for (const key of ['snapshot', 'file', 'region', 'lines'] as const) {
      if (request[key]) next.searchParams.set(key, request[key]);
    }
  }
  return next;
}

/** Validate repository-authored source references without importing the drawer. */
export function validateSourceRequest(value: unknown): asserts value is SourceRequest {
  const record = (entry: unknown): entry is Record<string, unknown> => entry !== null && typeof entry === 'object' && !Array.isArray(entry);
  const nonempty = (entry: unknown): entry is string => typeof entry === 'string' && !!entry.trim();
  function fail(message: string): never { throw new Error(message); }
  if (!record(value) || !nonempty(value.project)) fail('source.project must be a non-empty string.');
  for (const key of ['snapshot', 'file', 'region', 'lines']) {
    if (value[key] !== undefined && !nonempty(value[key])) fail(`source.${key} must be a non-empty string.`);
  }
  if (value.region !== undefined && value.lines !== undefined) fail('source cannot combine region and lines.');
  if (typeof value.lines === 'string' && !/^[1-9]\d*(?:-[1-9]\d*)?$/.test(value.lines)) fail('source.lines must be a line or inclusive range.');
  if (typeof value.lines === 'string') {
    const [start, end = start] = value.lines.split('-').map(Number);
    if (![start, end].every(Number.isSafeInteger) || start > end) fail('source.lines must be an ordered, safe-integer range.');
  }
}
