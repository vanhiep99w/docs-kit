import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Code, Root } from 'mdast';
import type { MdxJsxAttribute, MdxJsxFlowElement } from 'mdast-util-mdx-jsx';
import type { Plugin } from 'unified';
import remarkFrontmatter from 'remark-frontmatter';
import { parseDocument } from 'yaml';
import { visit } from 'unist-util-visit';
import { getEngineFingerprint, renderWithPool } from './pool-client.js';
import { loadD2Resources, type D2ResourceOptions, type D2Resources } from './resources.js';
import type { D2Board, D2Mode } from '../components/d2-types.js';
export type { D2Mode } from '../components/d2-types.js';
export type { D2ResourceOptions } from './resources.js';

export type D2Layout = 'elk' | 'dagre' | 'tala';

export interface RemarkD2Options extends D2ResourceOptions {
  /** Opt-in client viewer; register D2InteractiveDiagram in your MDX components. */
  interactive?: boolean;
  mode?: D2Mode;
  target?: string;
  interval?: number;
  maxBoards?: number;
  fitLabels?: 'auto' | 'off';
  themeOverrides?: { light?: Record<string, string>; dark?: Record<string, string> };
  /** Relative to the consuming project's working directory. */
  cacheDir?: string;
  sketch?: boolean;
  /** Default engine; overridden by page d2Layout and then fence layout. */
  layout?: D2Layout;
  scale?: number;
  padding?: number;
  themes?: { light?: number; dark?: number };
  /** Maximum simultaneous WASM renderers per cache directory, across processes. */
  concurrency?: number;
  /** Stop idle workers automatically; defaults to 30 seconds. */
  poolIdleTimeoutMs?: number;
  defaultCaption?: string;
}

interface RendererOptions {
  mode: D2Mode;
  target?: string;
  interval: number;
  maxBoards: number;
  fitLabels: 'auto' | 'off';
  lightOverrides?: Record<string, string>;
  darkOverrides?: Record<string, string>;
  sketch: boolean;
  layout: D2Layout;
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
  boards?: D2Board[];
  animation?: { lightSvg: string; darkSvg: string };
}

const pending = new Map<string, Promise<RenderedDiagram>>();

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isRenderedDiagram(value: unknown): value is RenderedDiagram {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<RenderedDiagram>;
  return typeof result.lightSvg === 'string' && result.lightSvg.startsWith('<svg') &&
    typeof result.darkSvg === 'string' && result.darkSvg.startsWith('<svg') &&
    (result.boards === undefined || Array.isArray(result.boards) && result.boards.every((board) =>
      board !== null && typeof board === 'object' && typeof board.id === 'string' && typeof board.label === 'string' &&
      ['root', 'layer', 'scenario', 'step'].includes(board.kind) &&
      typeof board.lightSvg === 'string' && board.lightSvg.startsWith('<svg') &&
      typeof board.darkSvg === 'string' && board.darkSvg.startsWith('<svg'))) &&
    (result.animation === undefined || result.animation !== null && typeof result.animation === 'object' &&
      typeof result.animation.lightSvg === 'string' && result.animation.lightSvg.startsWith('<svg') &&
      typeof result.animation.darkSvg === 'string' && result.animation.darkSvg.startsWith('<svg')) &&
    Array.isArray(result.labelLayout) && result.labelLayout.every((label) =>
      label !== null && typeof label === 'object' &&
      label.labelPosition === 'INSIDE_MIDDLE_CENTER' &&
      Number.isFinite(label.width) && Number.isFinite(label.height) &&
      Number.isFinite(label.labelWidth) && Number.isFinite(label.labelHeight) &&
      label.width >= label.labelWidth + 24 && label.height >= label.labelHeight + 16,
    );
}

function isLayout(value: unknown): value is D2Layout {
  return value === 'elk' || value === 'dagre' || value === 'tala';
}

function layoutOverride(value: unknown, name: string): D2Layout {
  if (!isLayout(value)) {
    throw new Error(`docs-kit D2: ${name} must be elk, dagre or tala.`);
  }
  return value;
}

function frontmatterLayout(value: unknown): D2Layout | undefined {
  if (value !== null && typeof value === 'object' && Object.hasOwn(value, 'd2Layout')) {
    return layoutOverride((value as Record<string, unknown>).d2Layout, 'frontmatter d2Layout');
  }
}

interface FenceOptions {
  title?: string;
  layout?: D2Layout;
  interactive?: boolean;
  mode?: D2Mode;
  target?: string;
  interval?: number;
  sketch?: boolean;
  scale?: number;
  padding?: number;
  lightTheme?: number;
  darkTheme?: number;
  fitLabels?: 'auto' | 'off';
}

function fenceOptions(meta: string | null | undefined): FenceOptions {
  const result: Record<string, unknown> = {};
  const known = new Set(['title', 'layout', 'interactive', 'mode', 'target', 'interval', 'sketch', 'scale', 'padding', 'lightTheme', 'darkTheme', 'fitLabels']);
  const attributes = /(?:^|\s)([^\s=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s]*))?(?=\s|$)/g;
  for (const [, name, raw] of (meta ?? '').matchAll(attributes)) {
    if (!known.has(name)) continue;
    if (Object.hasOwn(result, name)) throw new Error(`docs-kit D2: duplicate fence ${name} option.`);
    const value = raw && /^("[^"]*"|'[^']*')$/.test(raw) ? raw.slice(1, -1) : raw;
    if (name === 'layout') result.layout = layoutOverride(value, 'fence layout');
    else if (['interactive', 'sketch'].includes(name)) {
      if (value !== undefined && value !== 'true' && value !== 'false') throw new Error(`docs-kit D2: fence ${name} must be true or false.`);
      result[name] = value !== 'false';
    } else if (['interval', 'scale', 'padding', 'lightTheme', 'darkTheme'].includes(name)) {
      if (!value?.trim()) throw new Error(`docs-kit D2: fence ${name} requires a number.`);
      result[name] = Number(value);
    } else result[name] = value ?? '';
  }
  return result as FenceOptions;
}

function resolveOptions(options: RemarkD2Options): RendererOptions {
  const resolved: RendererOptions = {
    mode: options.mode ?? 'static',
    target: options.target,
    interval: options.interval ?? 1500,
    maxBoards: options.maxBoards ?? 32,
    fitLabels: options.fitLabels ?? 'auto',
    lightOverrides: options.themeOverrides?.light,
    darkOverrides: options.themeOverrides?.dark,
    sketch: options.sketch ?? true,
    layout: options.layout ?? 'elk',
    scale: options.scale ?? 0.8,
    padding: options.padding ?? 12,
    lightTheme: options.themes?.light ?? 0,
    darkTheme: options.themes?.dark ?? 200,
  };
  if (typeof resolved.sketch !== 'boolean' || !isLayout(resolved.layout)) {
    throw new Error('docs-kit D2: invalid sketch or layout option.');
  }
  if (!Number.isFinite(resolved.scale) || resolved.scale <= 0 ||
      !Number.isFinite(resolved.padding) || resolved.padding < 0) {
    throw new Error('docs-kit D2: scale must be positive and padding must be non-negative.');
  }
  if (![resolved.lightTheme, resolved.darkTheme].every((theme) => Number.isInteger(theme) && theme >= 0)) {
    throw new Error('docs-kit D2: theme IDs must be non-negative integers.');
  }
  if (!['static', 'steps', 'tabs', 'explorer', 'animation'].includes(resolved.mode)) throw new Error('docs-kit D2: invalid mode.');
  if (!['auto', 'off'].includes(resolved.fitLabels)) throw new Error('docs-kit D2: fitLabels must be auto or off.');
  if (!Number.isInteger(resolved.interval) || resolved.interval < 250 || resolved.interval > 60000) throw new Error('docs-kit D2: interval must be 250–60000 ms.');
  if (!Number.isInteger(resolved.maxBoards) || resolved.maxBoards < 1 || resolved.maxBoards > 128) throw new Error('docs-kit D2: maxBoards must be 1–128.');
  if (resolved.target !== undefined && (typeof resolved.target !== 'string' || !resolved.target.trim() || resolved.target.includes('*'))) {
    throw new Error('docs-kit D2: target must be a single non-empty board path (no wildcards).');
  }
  if (options.interactive !== undefined && typeof options.interactive !== 'boolean') throw new Error('docs-kit D2: interactive must be boolean.');
  for (const palette of [resolved.lightOverrides, resolved.darkOverrides]) {
    if (palette !== undefined && (!palette || typeof palette !== 'object' || Array.isArray(palette) ||
      Object.entries(palette).some(([key, value]) => !/^(?:N[1-7]|B[1-6]|AA[245]|AB[45])$/.test(key) || typeof value !== 'string'))) {
      throw new Error('docs-kit D2: invalid themeOverrides palette.');
    }
  }
  return resolved;
}

async function render(
  source: string,
  salt: string,
  cacheDir: string,
  concurrency: number,
  options: RendererOptions,
  idleTimeoutMs: number,
  resources: D2Resources,
): Promise<RenderedDiagram> {
  const engine = await getEngineFingerprint();
  const key = hash(JSON.stringify([3, source, salt, engine, options, resources]));
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
    const value: unknown = await renderWithPool(key, { source, salt, options, resources }, {
      cacheDir, concurrency, idleTimeoutMs,
    });
    if (!isRenderedDiagram(value)) throw new Error('D2 renderer returned invalid SVG or label layout.');
    const result = value;
    await mkdir(cacheDir, { recursive: true });
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
  })();
  pending.set(cacheFile, task);
  try {
    return await task;
  } finally {
    pending.delete(cacheFile);
  }
}

function attribute(name: string, value: unknown): MdxJsxAttribute {
  return {
    type: 'mdxJsxAttribute',
    name,
    value: {
      type: 'mdxJsxAttributeValueExpression',
      value: typeof value === 'string' ? JSON.stringify(value) : `JSON.parse(${JSON.stringify(JSON.stringify(value))})`,
      data: {
        estree: {
          type: 'Program',
          sourceType: 'module',
          body: [{ type: 'ExpressionStatement', expression: typeof value === 'string' ? { type: 'Literal', value } : {
            type: 'CallExpression', optional: false,
            callee: { type: 'MemberExpression', computed: false, optional: false, object: { type: 'Identifier', name: 'JSON' }, property: { type: 'Identifier', name: 'parse' } },
            arguments: [{ type: 'Literal', value: JSON.stringify(value) }],
          } }],
        },
      },
    },
  };
}

/** Build-time only. Use with trusted, repository-authored MDX, not user input. */
export const remarkD2: Plugin<[RemarkD2Options?], Root> = function (options = {}) {
  const rendererOptions = resolveOptions(options);
  const cacheDir = path.resolve(options.cacheDir ?? '.cache/docs-kit/d2');
  const concurrency = options.concurrency ?? 1;
  const idleTimeoutMs = options.poolIdleTimeoutMs ?? 30_000;
  const defaultCaption = options.defaultCaption ?? 'Diagram';
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new Error('docs-kit D2: concurrency must be an integer from 1 to 8.');
  }
  if (!Number.isInteger(idleTimeoutMs) || idleTimeoutMs < 1000 || idleTimeoutMs > 600_000) {
    throw new Error('docs-kit D2: poolIdleTimeoutMs must be from 1000 to 600000.');
  }
  if (typeof defaultCaption !== 'string' || !defaultCaption.trim()) {
    throw new Error('docs-kit D2: defaultCaption must not be empty.');
  }
  this.use(remarkFrontmatter);

  return async (tree, file) => {
    const blocks: { node: Code; replace: (value: MdxJsxFlowElement) => void }[] = [];
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang !== 'd2' || index === undefined || !parent) return;
      blocks.push({ node, replace: (value) => { parent.children[index] = value; } });
    });
    if (!blocks.length) return;
    const yamlNode = tree.children.find((node) => node.type === 'yaml');
    let pageLayout = rendererOptions.layout;
    try {
      // Hosts such as Fumadocs may strip YAML before remark runs.
      let override = frontmatterLayout(file.data.frontmatter);
      if (override === undefined && yamlNode) {
        const document = parseDocument(yamlNode.value);
        if (document.errors.length) throw document.errors[0];
        override = frontmatterLayout(document.toJS());
      }
      pageLayout = override ?? pageLayout;
    } catch (error) {
      file.fail(`D2 page layout failed: ${error instanceof Error ? error.message : String(error)}`, yamlNode ?? blocks[0].node);
    }
    const fileIdentity = file.path
      ? path.relative(file.cwd, path.resolve(file.cwd, file.path)).split(path.sep).join('/')
      : 'document';
    let resources: D2Resources = {};
    try { resources = await loadD2Resources(options, file.path, file.cwd); }
    catch (error) { file.fail(`D2 resources failed: ${error instanceof Error ? error.message : String(error)}`, blocks[0].node); }
    for (const [index, { node, replace }] of blocks.entries()) {
      const id = `d2-${hash(`${fileIdentity}:${index}`).slice(0, 16)}`;
      try {
        const meta = fenceOptions(node.meta);
        const caption = meta.title?.trim() || defaultCaption;
        const blockOptions = resolveOptions({ ...options, ...meta, layout: meta.layout ?? pageLayout,
          themes: { light: meta.lightTheme ?? rendererOptions.lightTheme, dark: meta.darkTheme ?? rendererOptions.darkTheme } });
        const { lightSvg, darkSvg, boards, animation } = await render(node.value, id, cacheDir, concurrency, blockOptions, idleTimeoutMs, resources);
        const interactive = (meta.interactive ?? options.interactive ?? false) || blockOptions.mode !== 'static';
        const extra = interactive ? [attribute('source', node.value), attribute('mode', blockOptions.mode),
          attribute('interval', blockOptions.interval), ...(boards ? [attribute('boards', boards)] : []),
          ...(animation ? [attribute('animation', animation)] : [])] : [];
        replace({
          type: 'mdxJsxFlowElement',
          name: interactive ? 'D2InteractiveDiagram' : 'D2Diagram',
          attributes: [attribute('id', id), attribute('caption', caption),
            attribute('lightSvg', lightSvg), attribute('darkSvg', darkSvg), ...extra],
          children: [],
          position: node.position,
        });
      } catch (error) {
        file.fail(`D2 diagram failed: ${error instanceof Error ? error.message : String(error)}`, node);
      }
    }
  };
};
