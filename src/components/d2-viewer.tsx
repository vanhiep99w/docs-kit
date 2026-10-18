'use client';

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import type { D2Board, D2InteractiveDiagramProps } from './d2-types.js';
import { normalizeD2BoardLink } from './d2-navigation.js';
import { D2Icon, D2IconButton, D2SourceMenu } from './d2-controls.js';

function svgSize(svg: string) {
  const tag = svg.slice(0, svg.indexOf('>') + 1);
  const width = Number(tag.match(/\bwidth="([\d.]+)"/)?.[1]);
  const height = Number(tag.match(/\bheight="([\d.]+)"/)?.[1]);
  return { width: width || 800, height: height || 500 };
}

export default function D2Viewer({ id, caption, source, lightSvg, darkSvg, boards, mode = 'static', interval = 1500, animation, className }: D2InteractiveDiagramProps) {
  const views: D2Board[] = boards?.length ? boards : [{ id: '', label: caption, kind: 'root', lightSvg, darkSvg }];
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState('');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [animationsPaused, setAnimationsPaused] = useState(true);
  const viewport = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const unique = useId().replace(/:/g, '');
  const prefix = `${id}-${unique}`;
  const board = views[Math.min(index, views.length - 1)];
  const size = svgSize(board.lightSvg);
  const sequential = mode === 'steps' || mode === 'animation';
  const go = useCallback((next: number) => {
    setPlaying(false);
    setIndex(Math.max(0, Math.min(views.length - 1, next)));
    if (viewport.current) { viewport.current.scrollTop = 0; viewport.current.scrollLeft = 0; }
  }, [views.length]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => { setReducedMotion(query.matches); if (query.matches) { setPlaying(false); setAnimationsPaused(true); } };
    sync(); query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  useEffect(() => {
    const pause = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', pause);
    return () => document.removeEventListener('visibilitychange', pause);
  }, []);
  useEffect(() => {
    if (!playing || reducedMotion) return;
    const timer = window.setInterval(() => {
      setIndex((current) => {
        if (current >= views.length - 1) return current;
        return current + 1;
      });
    }, interval);
    return () => window.clearInterval(timer);
  }, [playing, reducedMotion, interval, views.length]);
  useEffect(() => { if (index === views.length - 1) setPlaying(false); }, [index, views.length]);
  useEffect(() => {
    if (expanded) {
      dialog.current?.showModal();
      // Reading a diagram should not leave the page animating in the background.
      setPlaying(false);
    }
  }, [expanded]);
  useEffect(() => {
    setIndex(0); setZoom(1); setPlaying(false);
  }, [id, views.length]);
  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(''), 4000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const fit = useCallback(() => {
    const element = viewport.current;
    if (!element) return;
    const style = window.getComputedStyle(element);
    const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const verticalPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const maxHeight = parseFloat(style.maxHeight);
    // Use the CSS height budget, not the current content height (small boards
    // can shrink the viewport). Account for host resets using border-box.
    const height = Number.isFinite(maxHeight)
      ? maxHeight - (style.boxSizing === 'border-box'
        ? verticalPadding + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth) : 0)
      : element.clientHeight - verticalPadding;
    if (element.clientWidth <= horizontalPadding || height <= 0) return;
    setZoom(Math.min(1, (element.clientWidth - horizontalPadding) / size.width, height / size.height));
    element.scrollTop = 0; element.scrollLeft = 0;
  }, [size.width, size.height]);

  // Refit on mount, board/fullscreen changes and container/window resizing.
  // Observe width only: zooming changes canvas height and must not undo a user zoom.
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    fit();
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth !== width) { width = element.clientWidth; fit(); }
    });
    observer.observe(element);
    window.addEventListener('resize', fit);
    return () => { observer.disconnect(); window.removeEventListener('resize', fit); };
  }, [fit, id, board.id, expanded]);

  const zoomIn = () => setZoom((value) => Math.min(4, value * 1.25));
  const zoomOut = () => setZoom((value) => Math.max(Math.min(value, 0.01), value / 1.25));
  function closeExpanded() {
    setExpanded(false);
    window.requestAnimationFrame(() => expandButton.current?.focus());
  }
  function currentSvg(animated = false) {
    const dark = !!viewport.current?.closest('.dark, [data-theme="dark"]');
    const pair = animated ? animation ?? board : board;
    return dark ? pair.darkSvg : pair.lightSvg;
  }
  function download(animated = false) {
    const blob = new Blob([currentSvg(animated)], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${id}${animated ? '-animated' : index ? `-${index + 1}` : ''}.svg`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(source ?? '');
      setStatus('D2 source copied.');
    } catch { setStatus('Could not copy. Select the text in D2 source instead.'); }
  }
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomIn(); }
    if (event.key === '-') { event.preventDefault(); zoomOut(); }
    if (event.key === '0') { event.preventDefault(); setZoom(1); }
    if (sequential && ['ArrowRight', 'ArrowLeft'].includes(event.key)) { event.preventDefault(); go(index + (event.key === 'ArrowRight' ? 1 : -1)); }
  }
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    // Touch scroll/pinch stays native; do not steal links or text selection.
    if (event.pointerType !== 'mouse' || event.button !== 0 || (event.target as Element).closest('a')) return;
    drag.current = { x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) start.moved = true;
    if (start.moved) { event.currentTarget.scrollLeft = start.left - dx; event.currentTarget.scrollTop = start.top - dy; }
  }
  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    suppressClick.current = drag.current?.moved ?? false;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function boardLink(event: MouseEvent<HTMLDivElement>) {
    if (suppressClick.current) { event.preventDefault(); suppressClick.current = false; return; }
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element).closest('a');
    if (!anchor || anchor.hasAttribute('download') || anchor.getAttribute('target') === '_blank') return;
    const href = anchor.getAttribute('href') ?? anchor.getAttribute('xlink:href') ?? '';
    // D2 uses board paths as internal links; external URLs remain normal anchors.
    const target = normalizeD2BoardLink(href);
    const match = views.findIndex((view) => view.id === target);
    if (match >= 0) { event.preventDefault(); go(match); }
    else if (href === 'root' || href.startsWith('root.')) {
      event.preventDefault(); setStatus('This board is outside the selected views. Use explorer mode or a wider target.');
    }
  }
  function tabKey(event: KeyboardEvent<HTMLButtonElement>, current: number) {
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? views.length - 1 :
      event.key === 'ArrowRight' ? (current + 1) % views.length : event.key === 'ArrowLeft' ? (current - 1 + views.length) % views.length : -1;
    if (next < 0) return;
    event.preventDefault(); go(next); tabs.current[next]?.focus();
  }
  const ancestors: D2Board[] = [];
  let parent = board.parent;
  while (parent !== undefined) {
    const item = views.find((view) => view.id === parent);
    if (!item || ancestors.includes(item)) break;
    ancestors.unshift(item); parent = item.parent;
  }

  const controls = <div className="d2-toolbar" role="group" aria-label="Diagram controls">
      {source !== undefined ? <D2SourceMenu source={source}>
        <D2IconButton label="Copy D2" icon="copy" onClick={copy} />
        <D2IconButton label="Download SVG" icon="download" onClick={() => download()} />
        {animation && <D2IconButton label="Download animated SVG" icon="download" onClick={() => download(true)} />}
        <D2IconButton label={`Motion ${animationsPaused ? 'off' : 'on'}`} icon="motion" aria-pressed={!animationsPaused}
          onClick={() => setAnimationsPaused((paused) => !paused)} disabled={reducedMotion} />
      </D2SourceMenu> : <>
        <D2IconButton label="Download SVG" icon="download" onClick={() => download()} />
        {animation && <>
          <D2IconButton label="Download animated SVG" icon="download" onClick={() => download(true)} />
          <D2IconButton label={`Motion ${animationsPaused ? 'off' : 'on'}`} icon="motion" aria-pressed={!animationsPaused}
            onClick={() => setAnimationsPaused((paused) => !paused)} disabled={reducedMotion} />
        </>}
      </>}
      <D2IconButton label="Zoom out" icon="zoom-out" onClick={zoomOut} disabled={zoom <= 0.01} />
      <D2IconButton label="Zoom in" icon="zoom-in" onClick={zoomIn} disabled={zoom >= 4} />
      <D2IconButton label="Fit" icon="fit" onClick={fit} title={`Fit diagram (${Math.round(zoom * 100)}%)`} />
      <button type="button" className="d2-icon-button" ref={expandButton}
        aria-label={expanded ? 'Exit fullscreen' : 'Fullscreen'} title={expanded ? 'Exit fullscreen' : 'Fullscreen'}
        onClick={() => expanded ? closeExpanded() : setExpanded(true)} aria-expanded={expanded}>
        <D2Icon name={expanded ? 'close' : 'fullscreen'} />
      </button>
    </div>;

  const content = <figure className={['d2-diagram', 'd2-viewer', 'not-prose', className].filter(Boolean).join(' ')} aria-labelledby={`${prefix}-caption`}>
    {views.length > 1 && <>
      {sequential ? <div className="d2-stepper" role="group" aria-label="Diagram steps">
        <button type="button" onClick={() => go(index - 1)} disabled={index === 0}>← Previous</button>
        <span className="d2-step-label" aria-live="polite" aria-atomic="true"><span className="d2-step-count">{index + 1} / {views.length}</span> {board.label}</span>
        <button type="button" disabled={reducedMotion} onClick={() => { if (index === views.length - 1) setIndex(0); setPlaying(!playing); }} aria-pressed={playing}>{playing ? 'Pause' : 'Play'}</button>
        <button type="button" onClick={() => go(index + 1)} disabled={index === views.length - 1}>Next →</button>
      </div> : mode === 'explorer' ? <nav className="d2-breadcrumb" aria-label="Diagram layers">
        {ancestors.map((ancestor) => <span key={ancestor.id}><button type="button" onClick={() => go(views.indexOf(ancestor))}>{ancestor.label}</button><span aria-hidden="true"> / </span></span>)}
        <label>View <select value={board.id} onChange={(event) => go(views.findIndex((view) => view.id === event.target.value))}>
          {views.map((view) => <option key={view.id} value={view.id}>{view.kind === 'root' ? view.label : `${view.kind}: ${view.label}`}</option>)}
        </select></label>
      </nav> : <div className="d2-tabs" role="tablist" aria-label="Diagram scenarios">
        {views.map((view, current) => <button type="button" role="tab" key={view.id} ref={(node) => { tabs.current[current] = node; }}
          id={`${prefix}-tab-${current}`} aria-controls={`${prefix}-canvas`} aria-selected={current === index} tabIndex={current === index ? 0 : -1}
          onKeyDown={(event) => tabKey(event, current)} onClick={() => go(current)}>{view.label}</button>)}
      </div>}
    </>}
    {board.description && <p className="d2-view-description">{board.description}</p>}
    <div className="d2-canvas">
    {controls}
    <div id={`${prefix}-canvas`} className="d2-viewport" ref={viewport} tabIndex={0}
      role={!sequential && mode !== 'explorer' && views.length > 1 ? 'tabpanel' : 'region'}
      aria-labelledby={!sequential && mode !== 'explorer' && views.length > 1 ? `${prefix}-tab-${index}` : `${prefix}-caption`}
      aria-label={undefined} onKeyDown={keyDown} onPointerDown={pointerDown} onPointerMove={pointerMove}
      onPointerUp={pointerUp} onPointerCancel={() => { drag.current = null; }} onClick={boardLink}
      aria-description="Drag to pan. Use + and - to zoom, 0 for native size."
      data-motion={animationsPaused ? 'paused' : 'running'}>
      <div className="d2-zoom-space" style={{ width: size.width * zoom, height: size.height * zoom }}>
        <div className="d2-zoom-content" style={{ width: size.width, height: size.height, transform: `scale(${zoom})` }}>
          <div className="d2-diagram-light" role="group" aria-label={board.label} dangerouslySetInnerHTML={{ __html: board.lightSvg }} />
          <div className="d2-diagram-dark" role="group" aria-label={board.label} dangerouslySetInnerHTML={{ __html: board.darkSvg }} />
        </div>
      </div>
    </div>
    </div>
    <span className="d2-sr-only" role="status">{status}</span>
    <figcaption id={`${prefix}-caption`}>{caption}</figcaption>
  </figure>;
  return expanded ? <dialog ref={dialog} className="d2-fullscreen" aria-label={caption}
    onCancel={(event) => { event.preventDefault(); closeExpanded(); }} onClose={() => { if (expanded) closeExpanded(); }}>{content}</dialog> : content;
}
