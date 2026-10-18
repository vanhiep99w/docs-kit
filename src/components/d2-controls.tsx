import type { ButtonHTMLAttributes, ReactNode } from 'react';

type IconName = 'fit' | 'zoom-in' | 'zoom-out' | 'fullscreen' | 'close' | 'source' | 'copy' | 'download' | 'motion';
const paths: Record<IconName, ReactNode> = {
  fit: <><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" /><rect x="7" y="7" width="10" height="10" rx="1" /></>,
  'zoom-in': <><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6M7 10h6m-3-3v6" /></>,
  'zoom-out': <><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6M7 10h6" /></>,
  fullscreen: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  source: <path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18" />,
  copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V3H3v13h5" /></>,
  download: <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />,
  motion: <><path d="m9 5 11 7-11 7Z" /><path d="M4 5v14" /></>,
};

export function D2Icon({ name }: { name: IconName }) {
  return <svg className="d2-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}

export function D2IconButton({ label, icon, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: IconName }) {
  return <button type="button" className="d2-icon-button" aria-label={label} title={label} {...props}><D2Icon name={icon} /></button>;
}

/** Native disclosure stays usable in SSR/no-JS and never adds a bottom row. */
export function D2SourceMenu({ source, children }: { source: string; children?: ReactNode }) {
  return <details className="d2-source-menu">
    <summary aria-label="D2 source" title="D2 source"><D2Icon name="source" /></summary>
    <div className="d2-source-panel">
      {children && <div className="d2-source-actions">{children}</div>}
      <pre tabIndex={0} aria-label="D2 source code"><code>{source}</code></pre>
    </div>
  </details>;
}
