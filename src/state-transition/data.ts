export type ExplorerState = { id: string; label: string; description?: string; terminal?: boolean };
export type ExplorerTransition = {
  id: string;
  from: string;
  to: string;
  event: string;
  /** Optional branch name, useful when the same event has multiple authored outcomes. */
  label?: string;
  description: string;
  /** Explanatory text only. Selecting a branch assumes this condition, never evaluates it. */
  guard?: string;
  /** Described effects only; no callbacks, expressions, or actions are executed. */
  effects?: string[];
};
export type StateTransitionData = {
  title: string;
  description?: string;
  assumptions: string;
  initial: string;
  states: ExplorerState[];
  transitions: ExplorerTransition[];
};
export type TransitionTraceEntry = { step: number; transition: ExplorerTransition };
export type StateTransitionTrace = { current: string; entries: TransitionTraceEntry[] };
export const STATE_TRANSITION_HISTORY_LIMIT = 128;

function fail(message: string): never { throw new Error(`State Transition: ${message}`); }
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

/** Structural model checks, not guard evaluation, liveness analysis or runtime verification. */
export function validateStateTransition(value: unknown): asserts value is StateTransitionData {
  if (!record(value)) fail('expected an object.');
  keys(value, ['title', 'description', 'assumptions', 'initial', 'states', 'transitions'], 'model');
  text(value.title, 'title'); text(value.assumptions, 'assumptions'); identifier(value.initial, 'initial');
  if (value.description !== undefined) text(value.description, 'description');
  if (!Array.isArray(value.states) || !value.states.length || value.states.length > 32) fail('states must contain 1–32 entries.');
  if (!Array.isArray(value.transitions) || value.transitions.length > 128) fail('transitions must contain 0–128 entries.');
  let budget = value.title.length + value.assumptions.length + ((value.description as string | undefined)?.length ?? 0);
  const states = new Map<string, ExplorerState>();
  for (const state of value.states) {
    if (!record(state)) fail('each state must be an object.');
    keys(state, ['id', 'label', 'description', 'terminal'], 'state');
    identifier(state.id, 'state.id'); text(state.label, 'state.label');
    if (states.has(state.id)) fail(`duplicate state id "${state.id}".`);
    if (state.description !== undefined) text(state.description, 'state.description');
    if (state.terminal !== undefined && typeof state.terminal !== 'boolean') fail('state.terminal must be boolean.');
    states.set(state.id, state as ExplorerState);
    budget += state.label.length + ((state.description as string | undefined)?.length ?? 0);
  }
  if (!states.has(value.initial)) fail(`initial state "${value.initial}" does not exist.`);
  const ids = new Set<string>();
  for (const transition of value.transitions) {
    if (!record(transition)) fail('each transition must be an object.');
    keys(transition, ['id', 'from', 'to', 'event', 'label', 'description', 'guard', 'effects'], 'transition');
    identifier(transition.id, 'transition.id'); identifier(transition.from, 'transition.from'); identifier(transition.to, 'transition.to');
    if (ids.has(transition.id)) fail(`duplicate transition id "${transition.id}".`);
    ids.add(transition.id);
    if (!states.has(transition.from) || !states.has(transition.to)) fail('transition endpoints must reference existing states.');
    if (states.get(transition.from)!.terminal) fail(`terminal state "${transition.from}" cannot have outgoing transitions.`);
    text(transition.event, 'transition.event'); text(transition.description, 'transition.description');
    for (const key of ['label', 'guard']) if (transition[key] !== undefined) text(transition[key], `transition.${key}`);
    if (transition.effects !== undefined) {
      if (!Array.isArray(transition.effects) || !transition.effects.length || transition.effects.length > 16) fail('transition.effects must contain 1–16 text entries.');
      for (const effect of transition.effects) { text(effect, 'effect'); budget += effect.length; }
    }
    budget += transition.event.length + transition.description.length + ((transition.label as string | undefined)?.length ?? 0) + ((transition.guard as string | undefined)?.length ?? 0);
  }
  if (budget > 1048576) fail('model text exceeds 1048576 UTF-16 code units.');
}

/** Replays explicit branch IDs only. Same-event branches are never resolved automatically. */
export function traceStateTransitions(data: StateTransitionData, path: readonly string[]): StateTransitionTrace {
  validateStateTransition(data);
  if (!Array.isArray(path) || path.length > STATE_TRANSITION_HISTORY_LIMIT) fail(`path must be an array of at most ${STATE_TRANSITION_HISTORY_LIMIT} transition IDs.`);
  const transitions = new Map(data.transitions.map((transition) => [transition.id, transition]));
  let current = data.initial;
  const entries: TransitionTraceEntry[] = [];
  for (const id of path) {
    if (typeof id !== 'string') fail('path entries must be transition IDs.');
    const transition = transitions.get(id);
    if (!transition) fail(`transition "${id}" does not exist.`);
    if (transition.from !== current) fail(`transition "${id}" does not start from current state "${current}".`);
    entries.push({ step: entries.length + 1, transition });
    current = transition.to;
  }
  return { current, entries };
}
