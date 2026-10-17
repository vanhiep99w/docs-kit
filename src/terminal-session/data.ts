import { codeLines, validateAnnotations, type ExampleAnnotation } from '../code/annotations.js';

export type { ExampleAnnotation, ExampleRange } from '../code/annotations.js';

export type TerminalContext = {
  kind: 'local' | 'container' | 'pod' | 'remote';
  /** Name of the host, container, pod or local environment. Display only. */
  label?: string;
  cwd?: string;
};

export type TerminalOutput = {
  stream: 'stdout' | 'stderr';
  text: string;
  /** Uses native details/summary; all text is present in SSR HTML. */
  collapsed?: boolean;
  annotations?: ExampleAnnotation[];
};

export type TerminalStep = {
  id: string;
  title?: string;
  /** Raw command only, without a prompt. Never executed or rewritten. */
  command: string;
  prompt?: string;
  /** Full context override, not a partial merge with session.context. */
  context?: TerminalContext;
  description?: string;
  warning?: string;
  expected?: string;
  /** Author-supplied observation; never calculated by the component. */
  exitCode?: number;
  /** Ordered transcript chunks; stream labels do not imply real-time capture. */
  outputs?: TerminalOutput[];
};

export type TerminalSessionData = {
  title: string;
  description?: string;
  context: TerminalContext;
  steps: TerminalStep[];
};

function fail(message: string): never {
  throw new Error(`Terminal Session: ${message}`);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function keys(value: Record<string, unknown>, allowed: string[], path: string) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`unknown property ${path}.${key}.`);
}

/** Plain text only: reject ANSI/terminal control sequences rather than hiding or interpreting them. */
function text(value: unknown, path: string, allowEmpty = false): asserts value is string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) fail(`${path} must be a ${allowEmpty ? '' : 'non-empty '}string.`);
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/.test(value)) fail(`${path} contains unsupported control characters/ANSI escapes; use plain text.`);
}

function optionalText(value: unknown, path: string) {
  if (value !== undefined) text(value, path);
}

function context(value: unknown, path: string): asserts value is TerminalContext {
  if (!record(value)) fail(`${path} must be an object.`);
  keys(value, ['kind', 'label', 'cwd'], path);
  if (!['local', 'container', 'pod', 'remote'].includes(value.kind as string)) fail(`${path}.kind must be local, container, pod or remote.`);
  optionalText(value.label, `${path}.label`);
  optionalText(value.cwd, `${path}.cwd`);
}

/** Shared by the MDX build plugin and direct React consumers. No browser or Node APIs. */
export function validateTerminalSession(value: unknown): asserts value is TerminalSessionData {
  if (!record(value)) fail('expected an object.');
  keys(value, ['title', 'description', 'context', 'steps'], 'session');
  text(value.title, 'title');
  optionalText(value.description, 'description');
  context(value.context, 'context');
  if (!Array.isArray(value.steps) || !value.steps.length) fail('steps must be a non-empty array.');
  const ids = new Set<string>();
  for (const [index, step] of value.steps.entries()) {
    const path = `steps[${index}]`;
    if (!record(step)) fail(`${path} must be an object.`);
    keys(step, ['id', 'title', 'command', 'prompt', 'context', 'description', 'warning', 'expected', 'exitCode', 'outputs'], path);
    if (typeof step.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(step.id)) fail(`${path}.id must use letters, digits, underscores or hyphens, starting with a letter or digit.`);
    if (ids.has(step.id)) fail(`duplicate step id "${step.id}".`);
    ids.add(step.id);
    text(step.command, `${path}.command`);
    for (const key of ['title', 'description', 'warning', 'expected']) optionalText(step[key], `${path}.${key}`);
    if (step.prompt !== undefined) {
      text(step.prompt, `${path}.prompt`, true);
      if (/[\r\n]/.test(step.prompt)) fail(`${path}.prompt must be a single line.`);
    }
    if (step.context !== undefined) context(step.context, `${path}.context`);
    if (step.exitCode !== undefined && (!Number.isSafeInteger(step.exitCode) || (step.exitCode as number) < 0)) fail(`${path}.exitCode must be a non-negative safe integer.`);
    if (step.outputs !== undefined) {
      if (!Array.isArray(step.outputs)) fail(`${path}.outputs must be an array.`);
      for (const [outputIndex, output] of step.outputs.entries()) {
        const outputPath = `${path}.outputs[${outputIndex}]`;
        if (!record(output)) fail(`${outputPath} must be an object.`);
        keys(output, ['stream', 'text', 'collapsed', 'annotations'], outputPath);
        if (output.stream !== 'stdout' && output.stream !== 'stderr') fail(`${outputPath}.stream must be stdout or stderr.`);
        text(output.text, `${outputPath}.text`, true);
        if (output.collapsed !== undefined && typeof output.collapsed !== 'boolean') fail(`${outputPath}.collapsed must be boolean.`);
        if (output.annotations !== undefined) {
          try { validateAnnotations(output.annotations, codeLines(output.text).length); }
          catch (error) { fail(`${outputPath}: ${error instanceof Error ? error.message : String(error)}`); }
          for (const annotation of output.annotations as ExampleAnnotation[]) {
            text(annotation.title, `${outputPath}.annotation.title`);
            text(annotation.description, `${outputPath}.annotation.description`);
          }
        }
      }
    }
  }
}

const contextNames: Record<TerminalContext['kind'], string> = {
  local: 'Local',
  container: 'Container',
  pod: 'Pod',
  remote: 'Remote host',
};

export function terminalContextLabel(value: TerminalContext): string {
  return [contextNames[value.kind], value.label, value.cwd].filter(Boolean).join(' · ');
}
