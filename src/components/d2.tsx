import type { D2DiagramProps } from './d2-types.js';
export type { D2DiagramProps, D2Board, D2Mode } from './d2-types.js';

// Only pass SVGs generated at build time from trusted, repository-authored MDX.
// Keep this a server component: no D2/WASM or theme JavaScript in the browser.
export function D2Diagram({ id, caption, lightSvg, darkSvg, className }: D2DiagramProps) {
  const captionId = `${id}-caption`;

  return (
    <figure className={['d2-diagram', 'not-prose', className].filter(Boolean).join(' ')} aria-labelledby={captionId}>
      <div
        className="d2-diagram-scroll"
        role="region"
        aria-labelledby={captionId}
        tabIndex={0}
      >
        <div
          className="d2-diagram-light"
          role="group"
          aria-label={caption}
          dangerouslySetInnerHTML={{ __html: lightSvg }}
        />
        <div
          className="d2-diagram-dark"
          role="group"
          aria-label={caption}
          dangerouslySetInnerHTML={{ __html: darkSvg }}
        />
      </div>
      <figcaption id={captionId}>{caption}</figcaption>
    </figure>
  );
}
