'use client';

import type { MouseEvent, ReactNode } from 'react';
import { readSourceURL } from '../../source-explorer/index.js';
import { useSourceExplorer } from './provider.js';

/** Same-page source deep links progressively enhance to an in-place source drawer. */
export function D2SourceLinks({ children }: { children: ReactNode }) {
  const context = useSourceExplorer();
  function click(event: MouseEvent<HTMLDivElement>) {
    if (!context || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest('a');
    if (!anchor || !anchor.closest('.d2-diagram') || anchor.hasAttribute('download') ||
      anchor.getAttribute('target') && anchor.getAttribute('target') !== '_self') return;
    const href = anchor.getAttribute('href') ?? anchor.getAttribute('xlink:href');
    if (!href) return;
    let url: URL;
    try { url = new URL(href, window.location.href); } catch { return; }
    if (url.origin !== window.location.origin || url.pathname !== window.location.pathname ||
      url.hash && url.hash !== window.location.hash) return;
    const request = readSourceURL(url);
    if (!request) return;
    event.preventDefault();
    context.open(request);
  }
  return <div className="d2-source-links" onClick={click}>{children}</div>;
}
