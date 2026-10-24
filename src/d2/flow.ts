import { parseDocument } from 'yaml';
import type { D2Flow, D2FlowStep } from '../components/d2-types.js';

type FlowDescriptor = { scenarios: { id: string; label: string; steps: { edge: string; description: string; duration?: number }[] }[] };
const fail = (message: string): never => { throw new Error(`D2 flow: ${message}`); };
function object(value: unknown, keys: string[], where: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(`${where} must be an object.`);
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!keys.includes(key)) fail(`unknown ${where} field: ${key}.`);
  return record;
}
function text(value: unknown, where: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 4000) return fail(`${where} must be non-empty text (max 4000 characters).`);
  return value;
}

/** Only a leading, explicitly delimited comment block is metadata. D2 still receives the original source. */
export function parseD2Flow(source: string): FlowDescriptor {
  const lines = source.trimStart().split(/\r?\n/);
  if (lines[0].trim() !== '# @flow') return fail('mode=flow requires a leading # @flow … # @endflow YAML comment block.');
  const end = lines.findIndex((line) => line.trim() === '# @endflow');
  if (end < 0) return fail('missing # @endflow.');
  const yaml = lines.slice(1, end).map((line) => {
    const match = line.match(/^\s*#(?: ?)(.*)$/);
    if (!match) return fail('every metadata line must be a D2 comment.');
    return match[1];
  }).join('\n');
  if (Buffer.byteLength(yaml, 'utf8') > 65536) return fail('metadata exceeds 64 KiB.');
  const document = parseDocument(yaml, { uniqueKeys: true });
  if (document.errors.length) return fail(document.errors[0].message);
  const root = object(document.toJS({ maxAliasCount: 0 }), ['scenarios'], 'descriptor');
  if (!Array.isArray(root.scenarios) || !root.scenarios.length || root.scenarios.length > 16) return fail('scenarios must contain 1–16 items.');
  const ids = new Set<string>();
  let totalSteps = 0;
  const scenarios = root.scenarios.map((value, index) => {
    const scenario = object(value, ['id', 'label', 'steps'], `scenario ${index + 1}`);
    const id = text(scenario.id, 'scenario id');
    if (!/^[a-zA-Z][\w-]{0,63}$/.test(id) || ids.has(id)) return fail(`invalid or duplicate scenario id: ${id}.`);
    ids.add(id);
    const label = text(scenario.label, 'scenario label');
    if (!Array.isArray(scenario.steps) || !scenario.steps.length || scenario.steps.length > 128) return fail('steps must contain 1–128 items.');
    totalSteps += scenario.steps.length;
    if (totalSteps > 512) return fail('descriptor exceeds 512 total steps.');
    const steps = scenario.steps.map((value) => {
      const step = object(value, ['edge', 'description', 'duration'], 'step');
      const edge = text(step.edge, 'step edge');
      const description = text(step.description, 'step description');
      const duration = step.duration;
      if (duration !== undefined && (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 250 || duration > 60000)) return fail('step duration must be 250–60000 ms.');
      return { edge, description, ...(duration === undefined ? {} : { duration: duration as number }) };
    });
    return { id, label, steps };
  });
  return { scenarios };
}

interface FlowBoard {
  shapes: { id: string }[];
  connections: { id: string; src: string; dst: string; opacity?: number }[];
}

export function prepareD2Flow(descriptor: FlowDescriptor, board: FlowBoard): D2Flow {
  const nodes = new Map(board.shapes.map((shape, index) => [shape.id, `n${index}`]));
  const edges = new Map(board.connections.map((edge, index) => [edge.id, { ...edge, token: `e${index}` }]));
  return { scenarios: descriptor.scenarios.map((scenario) => ({ ...scenario, steps: scenario.steps.map((step): D2FlowStep => {
    const edge = edges.get(step.edge);
    if (!edge || edge.opacity === 0) return fail(`unknown or invisible edge ${step.edge}. Use the exact compiled D2 edge ID, including [index].`);
    const from = nodes.get(edge.src), to = nodes.get(edge.dst);
    if (!from || !to) return fail(`cannot resolve endpoints for ${step.edge}.`);
    return { ...step, edgeToken: edge.token, fromToken: from, toToken: to, from: edge.src, to: edge.dst };
  }) })) };
}

function escapeXML(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&#34;').replace(/'/g, '&#39;');
}

function groupTag(id: string) {
  return `<g class="${Buffer.from(escapeXML(id)).toString('base64')}">`;
}

/** Extract one continuous, rounded route from a non-sketch rendering of the SAME compiled layout.
 * A sketch route contains a pair of disconnected subpaths for EVERY line segment, not just two
 * complete strokes. Splitting its d at the first M silently loses most of the connection.
 */
export function extractD2FlowPaths(svg: string, flow: D2Flow): Map<string, string> {
  const paths = new Map<string, string>();
  for (const scenario of flow.scenarios) for (const step of scenario.steps) {
    if (paths.has(step.edgeToken)) continue;
    const tag = groupTag(step.edge);
    const start = svg.indexOf(tag);
    if (start < 0 || svg.indexOf(tag, start + tag.length) >= 0) return fail(`cannot map route ${step.edge}.`);
    const group = svg.slice(start + tag.length, svg.indexOf('</g>', start));
    const path = group.match(/<path\b[^>]*>/g)?.find((path) =>
      /\bclass="connection(?:\s|")/.test(path) && /\bfill="none"/.test(path) && !/\btransform=/.test(path));
    const d = path?.match(/\bd="([^"]+)"/)?.[1];
    if (!d || (d.match(/[Mm]/g) ?? []).length !== 1) return fail(`cannot resolve a continuous route for ${step.edge}.`);
    paths.set(step.edgeToken, d);
  }
  return paths;
}

/** The pinned D2 SDK encodes escaped IDs as base64 group classes. Fail closed if that contract changes. */
export function annotateD2FlowSvg(svg: string, flow: D2Flow, paths: Map<string, string>, board: FlowBoard): string {
  const required = new Map<string, { id: string; attribute: 'edge' | 'node' }>();
  for (const scenario of flow.scenarios) for (const step of scenario.steps) {
    required.set(step.edgeToken, { id: step.edge, attribute: 'edge' });
    required.set(step.fromToken, { id: step.from, attribute: 'node' });
    required.set(step.toToken, { id: step.to, attribute: 'node' });
  }
  // Annotate all rendered components, including ones absent from EVERY scenario.
  // Hidden/unrendered optional shapes may have no group; referenced steps still fail closed.
  const items = new Map(required);
  board.shapes.forEach((shape, index) => items.set(`n${index}`, { id: shape.id, attribute: 'node' }));
  board.connections.forEach((edge, index) => items.set(`e${index}`, { id: edge.id, attribute: 'edge' }));
  for (const [token, { id, attribute }] of items) {
    const tag = groupTag(id);
    if (svg.split(tag).length !== 2) {
      if (required.has(token)) return fail(`cannot map ${attribute} ${id} to its SVG group.`);
      continue;
    }
    const d = attribute === 'edge' ? paths.get(token) : undefined;
    if (attribute === 'edge' && required.has(token) && !d) return fail(`missing continuous route for ${id}.`);
    // Retain container ancestry from compiled key paths, never from SVG order.
    const parent = attribute === 'node' ? board.shapes
      .map((shape, index) => ({ id: shape.id, token: `n${index}` }))
      .filter((shape) => id.startsWith(shape.id + '.'))
      .sort((a, b) => b.id.length - a.id.length)[0]?.token : undefined;
    svg = svg.replace(tag, tag.slice(0, -1) + ` data-d2-flow-${attribute}="${token}"${d ? ` data-d2-flow-path="${escapeXML(d)}"` : ''}${parent ? ` data-d2-flow-parent="${parent}"` : ''}>`);
  }
  return svg;
}

export function isD2Flow(value: unknown): value is D2Flow {
  if (!value || typeof value !== 'object') return false;
  const scenarios = (value as D2Flow).scenarios;
  return Array.isArray(scenarios) && scenarios.length > 0 && scenarios.length <= 16 && scenarios.every((scenario) =>
    scenario && typeof scenario.id === 'string' && typeof scenario.label === 'string' && Array.isArray(scenario.steps) &&
    scenario.steps.length > 0 && scenario.steps.length <= 128 && scenario.steps.every((step) => step &&
      ['edge', 'description', 'from', 'to'].every((key) => typeof step[key as keyof D2FlowStep] === 'string') &&
      /^e\d+$/.test(step.edgeToken) && /^n\d+$/.test(step.fromToken) && /^n\d+$/.test(step.toToken) &&
      (step.duration === undefined || typeof step.duration === 'number' && Number.isFinite(step.duration) && step.duration >= 250 && step.duration <= 60000)));
}
