'use client';

import { CodeWalkthrough, type CodeWalkthroughProps } from './code-walkthrough.js';
import { SourceRef } from './source-explorer/provider.js';

/** Optional adapter, preserving the source/snapshot of each code panel. */
export function CodeWalkthroughWithSource(props: CodeWalkthroughProps) {
  return <CodeWalkthrough {...props} renderSourceLink={props.renderSourceLink ?? ((snapshot) => snapshot.source
    ? <SourceRef {...snapshot.source}>Mở source đầy đủ</SourceRef>
    : undefined)} />;
}
export type { CodeWalkthroughProps } from './code-walkthrough.js';
