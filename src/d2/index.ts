import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import lockfile from 'proper-lockfile';
import type { Code, Root } from 'mdast';
import type { MdxJsxAttribute, MdxJsxFlowElement } from 'mdast-util-mdx-jsx';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

export interface RemarkD2Options {
  /** Relative to the consuming project's working directory. */
  cacheDir?: string;
  sketch?: boolean;
  layout?: 'elk' | 'dagre';
  scale?: number;
  padding?: number;
  themes?: { light?: number; dark?: number };
  /** Maximum simultaneous WASM renderers per cache directory, across processes. */
  concurrency?: number;
  defaultCaption?: string;
}

interface RendererOptions {
  sketch: boolean;
  layout: 'elk' | 'dagre';
  scale: number;
  padding: number;
  lightTheme: number;
  darkTheme: number;
}

interface BoxLabelLayout {
  width: number;
  height: number;
  labelWidth: number;
  labelHeight: number;
  labelPosition: string;
}

interface RenderedDiagram {
  lightSvg: string;
  darkSvg: string;
  labelLayout: BoxLabelLayout[];
}

// Resolve package-owned assets and dependencies here, never from the host's
// lib/ directory or node_modules layout. The renderer stays external to bundlers.
const renderer = fileURLToPath(new URL('./render.mjs', import.meta.url));
const require = createRequire(import.meta.url);
const sdkManifest = path.resolve(path.dirname(require.resolve('@terrastruct/d2')), '../../package.json');
const pending = new Map<string, Promise<RenderedDiagram>>();

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isRenderedDiagram(value: unknown): value is RenderedDiagram {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<RenderedDiagram>;
  return typeof result.lightSvg === 'string' && result.lightSvg.startsWith('<svg') &&
    typeof result.darkSvg === 'string' && result.darkSvg.startsWith('<svg') &&
    Array.isArray(result.labelLayout) && result.labelLayout.every((label) =>
      label !== null && typeof label === 'object' &&
      label.labelPosition === 'INSIDE_MIDDLE_CENTER' &&
      Number.isFinite(label.width) && Number.isFinite(label.height) &&
      Number.isFinite(label.labelWidth) && Number.isFinite(label.labelHeight) &&
      label.width >= label.labelWidth + 24 && label.height >= label.labelHeight + 16,
    );
}

function resolveOptions(options: RemarkD2Options): RendererOptions {
  const resolved: RendererOptions = {
    sketch: options.sketch ?? true,
    layout: options.layout ?? 'elk',
    scale: options.scale ?? 0.75,
    padding: options.padding ?? 12,
    lightTheme: options.themes?.light ?? 0,
    darkTheme: options.themes?.dark ?? 200,
  };
  if (typeof resolved.sketch !== 'boolean' || !['elk', 'dagre'].includes(resolved.layout)) {
    throw new Error('docs-kit D2: invalid sketch or layout option.');
  }
  if (!Number.isFinite(resolved.scale) || resolved.scale <= 0 ||
      !Number.isFinite(resolved.padding) || resolved.padding < 0) {
    throw new Error('docs-kit D2: scale must be positive and padding must be non-negative.');
  }
  if (![resolved.lightTheme, resolved.darkTheme].every((theme) => Number.isInteger(theme) && theme >= 0)) {
    throw new Error('docs-kit D2: theme IDs must be non-negative integers.');
  }
  return resolved;
}

async function acquireRendererSlot(cacheDir: string, concurrency: number): Promise<() => Promise<void>> {
  await mkdir(cacheDir, { recursive: true });
  for (;;) {
    for (let slot = 0; slot < concurrency; slot++) {
      try {
        return await lockfile.lock(path.join(cacheDir, `render-slot-${slot}`), {
          realpath: false,
          stale: 120_000,
          update: 10_000,
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ELOCKED') throw error;
      }
    }
    await setTimeout(100);
  }
}

async function render(
  source: string,
  salt: string,
  cacheDir: string,
  concurrency: number,
  options: RendererOptions,
): Promise<RenderedDiagram> {
  const sdkVersion = JSON.parse(await readFile(sdkManifest, 'utf8')).version;
  const rendererVersion = await readFile(renderer, 'utf8');
  const key = hash(JSON.stringify([source, salt, sdkVersion, rendererVersion, options]));
  const cacheFile = path.join(cacheDir, `${key}.json`);
  const cached = pending.get(cacheFile);
  if (cached) return cached;

  const readCache = async (): Promise<RenderedDiagram | undefined> => {
    try {
      const value: unknown = JSON.parse(await readFile(cacheFile, 'utf8'));
      if (isRenderedDiagram(value)) return value;
    } catch (error) {
      if (!(error instanceof SyntaxError) && (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  };

  const task = (async () => {
    const cached = await readCache();
    if (cached) return cached;
    const release = await acquireRendererSlot(cacheDir, concurrency);
    try {
      // Another MDX process may have populated the cache while this job waited.
      const cached = await readCache();
      if (cached) return cached;
      const result = await new Promise<RenderedDiagram>((resolve, reject) => {
        const child = execFile(process.execPath, [renderer], {
          timeout: 60_000,
          maxBuffer: 20 * 1024 * 1024,
        }, (error, stdout, stderr) => {
          if (error) return reject(new Error(stderr.trim() || error.message));
          try {
            const value: unknown = JSON.parse(stdout);
            if (!isRenderedDiagram(value)) throw new Error('D2 renderer returned invalid SVG or label layout.');
            resolve(value);
          } catch (error) {
            reject(error);
          }
        });
        child.stdin?.on('error', reject);
        child.stdin?.end(JSON.stringify({ source, salt, options }));
      });
      const temporaryFile = `${cacheFile}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporaryFile, JSON.stringify(result));
        await rename(temporaryFile, cacheFile);
      } catch (error) {
        // Never leave a partial cache entry behind.
        const { rm } = await import('node:fs/promises');
        await rm(temporaryFile, { force: true });
        throw error;
      }
      return result;
    } finally {
      await release();
    }
  })();
  pending.set(cacheFile, task);
  try {
    return await task;
  } finally {
    pending.delete(cacheFile);
  }
}

function attribute(name: string, value: string): MdxJsxAttribute {
  return {
    type: 'mdxJsxAttribute',
    name,
    value: {
      type: 'mdxJsxAttributeValueExpression',
      value: JSON.stringify(value),
      data: {
        estree: {
          type: 'Program',
          sourceType: 'module',
          body: [{ type: 'ExpressionStatement', expression: { type: 'Literal', value } }],
        },
      },
    },
  };
}

/** Build-time only. Use with trusted, repository-authored MDX, not user input. */
export const remarkD2: Plugin<[RemarkD2Options?], Root> = (options = {}) => {
  const rendererOptions = resolveOptions(options);
  const cacheDir = path.resolve(options.cacheDir ?? '.cache/docs-kit/d2');
  const concurrency = options.concurrency ?? 2;
  const defaultCaption = options.defaultCaption ?? 'Diagram';
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new Error('docs-kit D2: concurrency must be an integer from 1 to 8.');
  }
  if (typeof defaultCaption !== 'string' || !defaultCaption.trim()) {
    throw new Error('docs-kit D2: defaultCaption must not be empty.');
  }

  return async (tree, file) => {
    const blocks: { node: Code; replace: (value: MdxJsxFlowElement) => void }[] = [];
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang !== 'd2' || index === undefined || !parent) return;
      blocks.push({ node, replace: (value) => { parent.children[index] = value; } });
    });
    for (const [index, { node, replace }] of blocks.entries()) {
      const title = node.meta?.match(/\btitle=(?:"([^"]*)"|'([^']*)')/);
      const caption = (title?.[1] ?? title?.[2])?.trim() || defaultCaption;
      const id = `d2-${hash(`${file.path ?? 'document'}:${index}`).slice(0, 16)}`;
      try {
        const { lightSvg, darkSvg } = await render(node.value, id, cacheDir, concurrency, rendererOptions);
        replace({
          type: 'mdxJsxFlowElement',
          name: 'D2Diagram',
          attributes: [attribute('id', id), attribute('caption', caption),
            attribute('lightSvg', lightSvg), attribute('darkSvg', darkSvg)],
          children: [],
          position: node.position,
        });
      } catch (error) {
        file.fail(`D2 diagram failed: ${error instanceof Error ? error.message : String(error)}`, node);
      }
    }
  };
};
