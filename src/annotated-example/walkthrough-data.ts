import { codeLines, validateAnnotations, type ExampleRange, type ExampleAnnotation } from '../code/annotations.js';
import { validateCodeTokens, type ExampleToken } from '../code/tokens.js';
import { validateSourceRequest, type SourceRequest } from '../source-explorer/index.js';
import type { AnnotatedExampleData } from './data.js';

export type WalkthroughSnapshot = {
  id: string;
  title: string;
  code: string;
  language?: string;
  source?: SourceRequest;
  /** Optional build-time tokens; never raw HTML. */
  tokens?: ExampleToken[][];
};
export type WalkthroughStep = { id: string; title: string; description: string; snapshot: string; ranges: ExampleRange[] };
export type CodeWalkthroughData = {
  title: string;
  description?: string;
  language?: string;
  snapshots: WalkthroughSnapshot[];
  /** Author order, including revisits to an earlier snapshot. */
  steps: WalkthroughStep[];
};

function fail(message: string): never { throw new Error(`Code Walkthrough: ${message}`); }
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function keys(value: Record<string, unknown>, allowed: string[], path: string) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`unknown property ${path}.${key}.`);
}
function text(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 16384) fail(`${path} must be a non-empty string of at most 16384 UTF-16 code units.`);
}
function identifier(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)) fail(`${path} must be an ASCII identifier of at most 128 characters.`);
}

export function validateCodeWalkthrough(value: unknown): asserts value is CodeWalkthroughData {
  if (!record(value)) fail('expected an object.');
  keys(value, ['title', 'description', 'language', 'snapshots', 'steps'], 'walkthrough');
  text(value.title, 'title');
  if (value.description !== undefined) text(value.description, 'description');
  if (value.language !== undefined) text(value.language, 'language');
  if (!Array.isArray(value.snapshots) || !value.snapshots.length || value.snapshots.length > 12) fail('snapshots must contain 1–12 entries.');
  if (!Array.isArray(value.steps) || !value.steps.length || value.steps.length > 64) fail('steps must contain 1–64 entries.');
  let budget = value.title.length + ((value.description as string | undefined)?.length ?? 0) + ((value.language as string | undefined)?.length ?? 0);
  let lineBudget = 0; let tokenBudget = 0;
  const snapshots = new Map<string, { lines: number; uses: number }>();
  for (const snapshot of value.snapshots) {
    if (!record(snapshot)) fail('each snapshot must be an object.');
    keys(snapshot, ['id', 'title', 'code', 'language', 'source', 'tokens'], 'snapshot');
    identifier(snapshot.id, 'snapshot.id'); text(snapshot.title, 'snapshot.title');
    if (snapshots.has(snapshot.id)) fail(`duplicate snapshot id "${snapshot.id}".`);
    if (typeof snapshot.code !== 'string' || snapshot.code.length > 262144) fail('snapshot.code must be a string of at most 262144 UTF-16 code units.');
    const lines = codeLines(snapshot.code);
    if (lines.length > 4096) fail('a snapshot exceeds 4096 displayed lines.');
    lineBudget += lines.length;
    if (lineBudget > 8192) fail('snapshots exceed 8192 total displayed lines.');
    if (snapshot.language !== undefined) text(snapshot.language, 'snapshot.language');
    if (snapshot.source !== undefined) {
      if (!record(snapshot.source)) fail('snapshot.source must be an object.');
      keys(snapshot.source, ['project', 'snapshot', 'file', 'region', 'lines'], 'source');
      try { validateSourceRequest(snapshot.source); }
      catch (error) { fail(error instanceof Error ? error.message : String(error)); }
      for (const [key, sourceText] of Object.entries(snapshot.source)) {
        if (sourceText !== undefined) { text(sourceText, `source.${key}`); budget += sourceText.length; }
      }
    }
    if (snapshot.tokens !== undefined) {
      if (!Array.isArray(snapshot.tokens) || snapshot.tokens.length !== lines.length) fail('tokens must match the displayed lines.');
      for (const row of snapshot.tokens) {
        if (!Array.isArray(row)) fail('each token row must be an array.');
        tokenBudget += row.length;
        if (tokenBudget > 131072) fail('snapshots exceed 131072 total tokens.');
      }
    }
    try { validateCodeTokens(snapshot.tokens, lines); }
    catch (error) { fail(error instanceof Error ? error.message : String(error)); }
    snapshots.set(snapshot.id, { lines: lines.length, uses: 0 });
    budget += snapshot.title.length + snapshot.code.length + ((snapshot.language as string | undefined)?.length ?? 0);
  }
  const steps = new Set<string>();
  for (const step of value.steps) {
    if (!record(step)) fail('each step must be an object.');
    keys(step, ['id', 'title', 'description', 'snapshot', 'ranges'], 'step');
    identifier(step.id, 'step.id'); identifier(step.snapshot, 'step.snapshot');
    if (steps.has(step.id)) fail(`duplicate step id "${step.id}".`);
    steps.add(step.id);
    text(step.title, 'step.title'); text(step.description, 'step.description');
    const snapshot = snapshots.get(step.snapshot);
    if (!snapshot) fail(`snapshot "${step.snapshot}" does not exist.`);
    if (!Array.isArray(step.ranges) || step.ranges.length > 16) fail('step.ranges must contain 1–16 ranges.');
    try { validateAnnotations([step], snapshot.lines); }
    catch (error) { fail(error instanceof Error ? error.message : String(error)); }
    snapshot.uses++;
    budget += step.title.length + step.description.length;
  }
  for (const [id, snapshot] of snapshots) if (!snapshot.uses) fail(`snapshot "${id}" is not referenced by any step.`);
  if (budget > 1048576) fail('text/code exceeds 1048576 UTF-16 code units.');
}

/** Reuses the Annotated Example contract; call after validating the walkthrough. */
export function walkthroughExample(data: CodeWalkthroughData, snapshot: WalkthroughSnapshot): AnnotatedExampleData {
  const annotations: ExampleAnnotation[] = data.steps.filter((step) => step.snapshot === snapshot.id).map(({ snapshot: _snapshot, ...annotation }) => annotation);
  return {
    title: snapshot.title, code: snapshot.code, language: snapshot.language ?? data.language ?? 'text', annotations,
    ...(snapshot.tokens !== undefined ? { tokens: snapshot.tokens } : {}),
    ...(snapshot.source !== undefined ? { source: snapshot.source } : {}),
  };
}
