export type ExampleRange = [start: number, end: number];

export type ExampleAnnotation = {
  /** Unique within this example; stable when the prose changes. */
  id: string;
  title: string;
  description: string;
  /** Inclusive, one-based ranges in the displayed code. Overlap is allowed. */
  ranges: ExampleRange[];
};

export function codeLines(code: string): string[] {
  // Preserve the original string for copy; normalize line endings only for display.
  return code.split(/\r\n|\r|\n/);
}

/** Validate one-based inclusive ranges. Callers add their own error context. */
export function validateAnnotations(annotations: unknown, lineCount: number): asserts annotations is ExampleAnnotation[] {
  if (!Array.isArray(annotations) || !annotations.length) fail('annotations must be a non-empty array.');
  const ids = new Set<string>();
  for (const annotation of annotations) {
    if (!record(annotation) || !nonempty(annotation.id) || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(annotation.id)) {
      fail('annotation id must contain only letters, digits, underscores or hyphens, starting with a letter or digit.');
    }
    if (ids.has(annotation.id)) fail(`duplicate annotation id "${annotation.id}".`);
    ids.add(annotation.id);
    if (!nonempty(annotation.title) || !nonempty(annotation.description)) fail(`annotation "${annotation.id}" needs a title and description.`);
    if (!Array.isArray(annotation.ranges) || !annotation.ranges.length) fail(`annotation "${annotation.id}" needs at least one range.`);
    for (const range of annotation.ranges) {
      if (!Array.isArray(range) || range.length !== 2 || !Number.isSafeInteger(range[0]) || !Number.isSafeInteger(range[1]) ||
          range[0] < 1 || range[1] < range[0] || range[1] > lineCount) {
        fail(`annotation "${annotation.id}" has an invalid range; expected [start, end] within 1–${lineCount}.`);
      }
    }
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && !!value.trim();
}

function fail(message: string): never {
  throw new Error(message);
}
