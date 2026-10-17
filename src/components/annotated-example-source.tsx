'use client';

import { AnnotatedExample, type AnnotatedExampleProps } from './annotated-example.js';
import { SourceRef } from './source-explorer/provider.js';

/** Optional adapter: only source-linked examples import the Source Explorer provider. */
export function AnnotatedExampleWithSource(props: AnnotatedExampleProps) {
  return <AnnotatedExample {...props} sourceLink={props.sourceLink ?? (props.data.source
    ? <SourceRef {...props.data.source}>Mở source đầy đủ</SourceRef>
    : undefined)} />;
}

export type { AnnotatedExampleProps } from './annotated-example.js';
