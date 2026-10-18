import { D2 } from '@d2lang/d2';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const horizontalPadding = 24;
const verticalPadding = 16;
const quote = (key) => JSON.stringify(key);
const boardPath = (segments) => segments.map((part) => /^[\w-]+$/.test(part) ? part : quote(part)).join('.');
function targetParts(target) {
  if (!target) return [];
  const tokens = target.match(/"(?:\\.|[^"\\])*"|'[^']*'|[^.]+/g) ?? [];
  return tokens.map((part) => part.startsWith('"') ? JSON.parse(part) : part.startsWith("'") ? part.slice(1, -1) : part);
}
function canonicalTarget(target) { return boardPath(targetParts(target)); }

function walkBoards(diagram, graph, visit, segments = [], kind = 'root', parent) {
  visit(diagram, graph, segments, kind, parent);
  for (const [field, childKind] of [['layers', 'layer'], ['scenarios', 'scenario'], ['steps', 'step']]) {
    for (const child of diagram[field] ?? []) {
      if (!child) continue;
      const childGraph = graph?.[field]?.find((item) => item?.name === child.name);
      walkBoards(child, childGraph, visit, [...segments, field, child.name], childKind, boardPath(segments));
    }
  }
}

function leafBoxes(diagram, graph) {
  const objects = graph?.objects ?? [];
  const objectFor = (shape) => {
    // Exported graph IDs are local; rendered shape IDs are absolute key paths.
    const localID = targetParts(shape.id).at(-1);
    return objects.find((object) => object && (object.id_val === localID || object.id === localID) &&
      Math.abs(object.box?.TopLeft?.x - shape.pos.x) < 1 && Math.abs(object.box?.TopLeft?.y - shape.pos.y) < 1 &&
      Math.abs(object.box?.Width - shape.width) < 1 && Math.abs(object.box?.Height - shape.height) < 1);
  };
  const sequences = diagram.shapes.filter((shape) => objectFor(shape)?.attributes?.shape?.value === 'sequence_diagram');
  // Sequence fragments share actor scope: ID prefixes cannot identify their children.
  if (graph?.root?.attributes?.shape?.value === 'sequence_diagram') return [];
  return diagram.shapes.filter((shape) => {
    const object = objectFor(shape);
    return shape.label && ['rectangle', 'diamond'].includes(shape.type) &&
      !shape.icon && !shape.language &&
      (!object?.attributes?.labelPosition?.value || object.attributes.labelPosition.value === 'center-center') &&
      !['INSIDE_TOP_LEFT', 'INSIDE_TOP_CENTER'].includes(shape.labelPosition) &&
      !sequences.some((sequence) => shape.id === sequence.id || shape.id.startsWith(`${sequence.id}.`)) &&
      !diagram.shapes.some((other) => other.id.startsWith(`${shape.id}.`));
  });
}

function fittedSize(shape) {
  let width = Math.max(shape.width, shape.labelWidth + horizontalPadding);
  let height = Math.max(shape.height, shape.labelHeight + verticalPadding);
  if (shape.type === 'diamond') {
    const factor = shape.labelWidth / (width - horizontalPadding) + shape.labelHeight / (height - verticalPadding);
    if (factor > 1) {
      width = horizontalPadding + (width - horizontalPadding) * factor;
      height = verticalPadding + (height - verticalPadding) * factor;
    }
  }
  return { width: Math.ceil(width), height: Math.ceil(height) };
}

export async function compileWithFittedLabels(d2, source, options = {}, resources = {}) {
  const compileOptions = { sketch: options.sketch ?? true, layout: options.layout ?? 'elk' };
  for (const [name, bytes] of Object.entries(resources.fonts ?? {})) {
    // d2.js 0.1.34 JSON-stringifies options. A Uint8Array becomes an object,
    // not a byte array, and fails Go's JSON decoder despite the SDK typings.
    compileOptions[name] = Array.from(Buffer.from(bytes, 'base64'));
  }
  const inputPath = resources.inputPath ?? 'index.d2';
  const compile = (value) => d2.compile({
    fs: { ...resources.fs, [inputPath]: value }, inputPath, options: compileOptions,
  });
  let compiled = await compile(source);
  if (options.fitLabels === 'off') return { ...compiled, labelLayout: [] };
  const overrides = [];
  const eligible = new Map();
  walkBoards(compiled.diagram, compiled.graph, (diagram, graph, segments) => {
    const boxes = leafBoxes(diagram, graph);
    eligible.set(JSON.stringify(segments), new Set(boxes.map((shape) => shape.id)));
    for (const shape of boxes) {
      const { width, height } = fittedSize(shape);
      if (width > shape.width || height > shape.height || shape.labelPosition !== 'INSIDE_MIDDLE_CENTER') {
        // Shape IDs are already escaped D2 key paths; board names must be quoted.
        const prefix = segments.length ? segments.map((part, index) => index % 2 === 0 ? part : quote(part)).join('.') + '.' : '';
        overrides.push(`${prefix}${shape.id}.width: ${width}`, `${prefix}${shape.id}.height: ${height}`,
          `${prefix}${shape.id}.label.near: center-center`);
      }
    }
  });
  if (overrides.length) compiled = await compile(`${source}\n${overrides.join('\n')}\n`);
  const labelLayout = [];
  walkBoards(compiled.diagram, compiled.graph, (diagram, graph, segments) => {
    for (const shape of diagram.shapes.filter((shape) => eligible.get(JSON.stringify(segments))?.has(shape.id))) {
      const size = fittedSize(shape);
      if (shape.labelPosition !== 'INSIDE_MIDDLE_CENTER' || size.width > shape.width + 1 || size.height > shape.height + 1) {
        throw new Error(`D2 label does not fit inside node ${shape.id}: ${shape.label}`);
      }
      labelLayout.push({ id: shape.id, board: segments.join('.'), type: shape.type, label: shape.label,
        width: shape.width, height: shape.height, labelWidth: shape.labelWidth,
        labelHeight: shape.labelHeight, labelPosition: shape.labelPosition });
    }
  });
  return { ...compiled, labelLayout };
}

function embedAssets(diagram, resources) {
  const assets = resources.assets ?? {};
  const embed = (item) => {
    if (!item?.icon || resources.assets === undefined) return;
    const icon = item.icon;
    if (typeof icon === 'object' && icon.Scheme || typeof icon === 'string' && /^(?:https?:|data:)/i.test(icon)) return;
    const location = typeof icon === 'string' ? icon : icon.Path;
    if (typeof location !== 'string') throw new Error('D2 icon has an unsupported URL representation.');
    const key = path.posix.normalize(path.posix.join(path.posix.dirname(resources.inputPath ?? 'index.d2'), location));
    if (!assets[key]) throw new Error(`D2 local icon is not in assetsRoot: ${location}`);
    item.icon = typeof icon === 'string' ? assets[key] : { ...icon, Scheme: 'data', Opaque: assets[key].slice(5), Path: '', RawPath: '' };
  };
  walkBoards(diagram, undefined, (board) => {
    [board.root, ...board.shapes, ...board.connections, ...(board.legend?.shapes ?? []), ...(board.legend?.connections ?? [])].forEach(embed);
  });
}

export async function renderDiagram(d2, { source, salt, options = {}, resources = {} }) {
  const { diagram, graph, renderOptions, labelLayout } = await compileWithFittedLabels(d2, source, options, resources);
  embedAssets(diagram, resources);
  const renderSettings = {
    ...renderOptions, darkThemeID: undefined, noXMLTag: true,
    sketch: renderOptions.sketch ?? options.sketch ?? true,
    pad: options.padding ?? 12, scale: options.scale ?? 1,
    target: canonicalTarget(options.target) || undefined, animateInterval: undefined,
  };
  walkBoards(diagram, graph, (board) => { board.root.fill = 'transparent'; });
  const themes = {
    light: { themeID: options.lightTheme ?? 0, themeOverrides: options.lightOverrides ?? renderOptions.themeOverrides },
    dark: { themeID: options.darkTheme ?? 200, themeOverrides: options.darkOverrides ?? renderOptions.darkThemeOverrides },
  };
  const renderPair = async (target, suffix = '', extra = {}) => {
    const pair = {};
    for (const theme of ['light', 'dark']) {
      pair[`${theme}Svg`] = (await d2.render(diagram, {
        ...renderSettings, ...themes[theme], darkThemeOverrides: undefined, target,
        salt: `${salt}-${theme}${suffix}`, ...extra,
      })).replace(/^<\?xml[^>]*\?>\s*/, ''); // Animated SVGs in this SDK ignore noXMLTag.
    }
    return pair;
  };
  const result = { ...await renderPair(renderSettings.target), labelLayout };
  if (options.mode && options.mode !== 'static') {
    const definitions = [];
    walkBoards(diagram, graph, (board, _graph, segments, kind, parent) => {
      if (board.isFolderOnly) return;
      const id = boardPath(segments);
      const target = canonicalTarget(options.target);
      if (target && id !== target && !id.startsWith(target + '.')) return;
      const field = options.mode === 'steps' ? 'steps' : options.mode === 'tabs' ? 'scenarios' : undefined;
      if (field && segments.slice(targetParts(target).length).some((part, index) => index % 2 === 0 && part !== field)) return;
      definitions.push({ id, label: board.name || 'Overview', kind, parent, description: board.description });
    });
    if (definitions.length > (options.maxBoards ?? 32)) throw new Error(`D2 diagram exceeds maxBoards (${options.maxBoards ?? 32}).`);
    if (!definitions.length) throw new Error('D2 diagram has no renderable boards for this target.');
    result.boards = [];
    for (const [index, board] of definitions.entries()) {
      result.boards.push({ ...board, ...await renderPair(board.id || undefined, `-board-${index}`) });
    }
    if (options.mode === 'animation') {
      const target = options.target ? options.target + '.*' : '*';
      result.animation = await renderPair(target, '-animation', { animateInterval: options.interval ?? 1500 });
    }
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    const result = await renderDiagram(new D2(), JSON.parse(input));
    process.stdout.write(JSON.stringify(result), () => process.exit(0));
  } catch (error) {
    process.stderr.write(String(error), () => process.exit(1));
  }
}
