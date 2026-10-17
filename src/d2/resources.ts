import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

export interface D2ResourceOptions {
  /** Trusted .d2 files, recursively loaded into a bounded virtual filesystem. Symlinks are refused. */
  importsRoot?: string;
  /** Local image directory. Icons resolve relative to the MDX file, inside this root. */
  assetsRoot?: string;
  /** TTF paths, resolved relative to the consuming project's working directory. */
  fonts?: { regular?: string; italic?: string; bold?: string; semibold?: string };
}

export interface D2Resources {
  inputPath?: string;
  fs?: Record<string, string>;
  assets?: Record<string, string>;
  fonts?: Record<string, string>;
}

const mime: Record<string, string> = {
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif',
};

function inside(root: string, target: string) {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** Read on every transform: changes to any supplied resource invalidate the render cache. */
export async function loadD2Resources(options: D2ResourceOptions, filePath?: string, cwd = process.cwd()): Promise<D2Resources> {
  const result: D2Resources = {};
  for (const root of [options.importsRoot, options.assetsRoot]) {
    if (root !== undefined && (typeof root !== 'string' || !root.trim())) throw new Error('D2 resource roots must be non-empty paths.');
  }
  if (options.fonts !== undefined && (!options.fonts || typeof options.fonts !== 'object' || Array.isArray(options.fonts))) {
    throw new Error('D2 fonts must be a map of TTF paths.');
  }
  let bytes = 0;
  let files = 0;
  const read = async (file: string) => {
    if (++files > 256) throw new Error('D2 resources exceed 256 files.');
    const info = await stat(file);
    if (!info.isFile() || info.size + bytes > 8 * 1024 * 1024) throw new Error('D2 resources must be files and total at most 8 MB.');
    const data = await readFile(file);
    bytes += data.length;
    if (bytes > 8 * 1024 * 1024) throw new Error('D2 resources exceed 8 MB.');
    return data;
  };
  const entry = filePath ? path.resolve(cwd, filePath) : undefined;
  const roots = [options.importsRoot, options.assetsRoot].filter((root): root is string => !!root);
  // Keep one coordinate system when imports and icons use different allowed roots.
  const virtualRoot = roots.length ? path.resolve(cwd) : undefined;
  if (virtualRoot) {
    if (!entry || !inside(virtualRoot, entry)) throw new Error('D2 imports/assets require an MDX path inside file.cwd.');
    result.inputPath = path.relative(virtualRoot, entry).split(path.sep).join('/') + '.d2';
  }
  const scan = async (directory: string, kind: 'imports' | 'assets') => {
    const configured = path.resolve(cwd, directory);
    const root = await realpath(configured);
    if (!virtualRoot || !inside(virtualRoot, root) || root !== configured) {
      throw new Error('D2 resource roots must be real directories inside file.cwd (no symlink roots).');
    }
    const walk = async (dir: string) => {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const item of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (item.isSymbolicLink()) throw new Error(`D2 resource symlinks are not allowed: ${item.name}`);
        const file = path.join(dir, item.name);
        if (item.isDirectory()) await walk(file);
        else if (item.isFile()) {
          const ext = path.extname(item.name).toLowerCase();
          if (kind === 'imports' && ext !== '.d2' || kind === 'assets' && !mime[ext]) continue;
          const key = path.relative(virtualRoot, file).split(path.sep).join('/');
          const data = await read(file);
          if (kind === 'imports') (result.fs ??= {})[key] = data.toString('utf8');
          else (result.assets ??= {})[key] = `data:${mime[ext]};base64,${data.toString('base64')}`;
        }
      }
    };
    await walk(root);
  };
  if (options.importsRoot) await scan(options.importsRoot, 'imports');
  if (options.assetsRoot) { result.assets = {}; await scan(options.assetsRoot, 'assets'); }
  for (const [style, file] of Object.entries(options.fonts ?? {})) {
    if (!['regular', 'italic', 'bold', 'semibold'].includes(style) || typeof file !== 'string' || !file.endsWith('.ttf')) {
      throw new Error('D2 fonts must be regular/italic/bold/semibold .ttf paths.');
    }
    const name = `font${style[0].toUpperCase()}${style.slice(1)}`;
    (result.fonts ??= {})[name] = (await read(path.resolve(cwd, file))).toString('base64');
  }
  return result;
}
