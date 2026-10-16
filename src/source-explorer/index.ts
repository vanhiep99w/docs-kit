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
