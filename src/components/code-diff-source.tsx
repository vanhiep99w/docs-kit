'use client';

import { CodeDiff, type CodeDiffProps } from './code-diff.js';
import { SourceRef } from './source-explorer/provider.js';

/** Optional adapter; ordinary diffs do not import the drawer/provider. */
export function CodeDiffWithSource(props: CodeDiffProps) {
  return <CodeDiff {...props} sourceLinks={{
    before: props.sourceLinks?.before ?? (props.data.before.source ? <SourceRef {...props.data.before.source}>Source trước</SourceRef> : undefined),
    after: props.sourceLinks?.after ?? (props.data.after.source ? <SourceRef {...props.data.after.source}>Source sau</SourceRef> : undefined),
  }} />;
}

export type { CodeDiffProps } from './code-diff.js';
