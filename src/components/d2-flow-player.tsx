'use client';

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useD2Disclosure } from './d2-disclosure.js';
import { D2Icon, D2IconButton } from './d2-controls.js';
import type { D2Flow } from './d2-types.js';

const svgNS = 'http://www.w3.org/2000/svg';
const arrivalDuration = 320;
const fadeDuration = 120;
type Phase = 'travel' | 'arrival';
type Marker = {
  path: SVGPathElement; circle: SVGCircleElement; halo: SVGCircleElement; length: number;
  edge: Element; source: Element; target: Element;
};
const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** Native D2 markers are shared by inactive edges. Clone only the current edge's references. */
function highlightMarkers(edge: Element, svg: Element, suffix: string): () => void {
  const restore: (() => void)[] = [];
  const clones = new Map<string, string>();
  for (const connection of Array.from(edge.querySelectorAll('[marker-start], [marker-end]'))) {
    for (const attribute of ['marker-start', 'marker-end']) {
      const reference = connection.getAttribute(attribute);
      const id = reference?.match(/^url\(#([^)]*)\)$/)?.[1];
      if (!id) continue;
      const original = Array.from(svg.querySelectorAll('marker')).find((marker) => marker.id === id);
      if (!original) continue;
      let cloneId = clones.get(id);
      if (!cloneId) {
        const clone = original.cloneNode(true) as SVGMarkerElement;
        cloneId = `${id}-flow-${suffix}`;
        clone.id = cloneId;
        const originals = Array.from(original.querySelectorAll<SVGElement>('path, polygon, polyline, circle, ellipse, rect, line'));
        const copies = Array.from(clone.querySelectorAll<SVGElement>('path, polygon, polyline, circle, ellipse, rect, line'));
        originals.forEach((shape, index) => {
          const style = getComputedStyle(shape);
          for (const property of ['fill', 'stroke'] as const) {
            if (!['none', 'transparent', 'rgba(0, 0, 0, 0)'].includes(style[property])) copies[index].style.setProperty(property, 'var(--d2-flow-accent)');
          }
        });
        original.parentElement!.append(clone);
        restore.push(() => clone.remove());
        clones.set(id, cloneId);
      }
      connection.setAttribute(attribute, `url(#${cloneId})`);
      restore.push(() => connection.setAttribute(attribute, reference!));
    }
  }
  return () => { restore.reverse().forEach((undo) => undo()); };
}
/** Each point stays on its connection. Fade between ports instead of drawing a route through a node. */
export function D2FlowPlayer({ flow, viewport, fullscreen, reducedMotion, interval, autoplay, loop, loopDelay, autoplayConsumed, children }: {
  flow: D2Flow;
  viewport: RefObject<HTMLDivElement | null>;
  fullscreen: boolean;
  reducedMotion: boolean;
  interval: number;
  autoplay: boolean;
  loop: boolean;
  loopDelay: number;
  autoplayConsumed: { current: boolean };
  children: (header: ReactNode, controls: ReactNode) => ReactNode;
}) {
  const stepsMenu = useD2Disclosure();
  const markerId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const replayTimer = useRef<number | undefined>(undefined);
  const replayDeadline = useRef<{ at: number; delay: number } | null>(null);
  const [speed, setSpeed] = useState(1);
  const [revision, setRevision] = useState(0);
  const [phase, setPhase] = useState<Phase>('travel');
  const [error, setError] = useState('');
  const elapsed = useRef(0);
  const phaseRef = useRef<Phase>('travel');
  const markers = useRef<Marker[]>([]);
  const scenario = flow.scenarios[Math.min(scenarioIndex, flow.scenarios.length - 1)];
  const step = scenario.steps[Math.min(index, scenario.steps.length - 1)];
  const duration = step.duration ?? interval;

  function position() {
    const progress = clamp(elapsed.current / duration);
    const nextPhase: Phase = progress < 1 ? 'travel' : 'arrival';
    if (phaseRef.current !== nextPhase) { phaseRef.current = nextPhase; setPhase(nextPhase); }
    for (const marker of markers.current) {
      const point = marker.path.getPointAtLength(marker.length * progress);
      marker.circle.setAttribute('cx', String(point.x));
      marker.circle.setAttribute('cy', String(point.y));
      marker.halo.setAttribute('cx', String(point.x));
      marker.halo.setAttribute('cy', String(point.y));
      marker.circle.setAttribute('data-flow-phase', nextPhase);
      marker.circle.setAttribute('data-flow-progress', String(progress));
      const manual = !Number.isFinite(elapsed.current) || !playing && elapsed.current === 0;
      const fadeIn = clamp(elapsed.current / fadeDuration);
      const fadeOut = index < scenario.steps.length - 1
        ? clamp((duration + arrivalDuration - elapsed.current) / fadeDuration) : 1;
      const opacity = manual ? 1 : Math.min(fadeIn, fadeOut);
      marker.circle.setAttribute('opacity', String(opacity));
      marker.halo.setAttribute('opacity', String(opacity * 0.16));
      for (const element of new Set([marker.edge, marker.source, marker.target])) {
        const active = element === marker.edge && nextPhase === 'travel' ||
          element === marker.source && nextPhase === 'travel' ||
          element === marker.target && nextPhase === 'arrival';
        if (active) element.setAttribute('data-d2-flow-active', 'true');
        else element.removeAttribute('data-d2-flow-active');
      }
    }
  }
  function pause() {
    setPlaying(false); setWaiting(false); replayDeadline.current = null;
    window.clearTimeout(replayTimer.current); replayTimer.current = undefined;
  }
  function resetPosition() { elapsed.current = 0; }
  function go(next: number, atEnd = true) {
    autoplayConsumed.current = true;
    pause();
    elapsed.current = atEnd ? Infinity : 0;
    setIndex(Math.max(0, Math.min(scenario.steps.length - 1, next)));
    setRevision((value) => value + 1);
  }
  useEffect(() => {
    setScenarioIndex(0); setIndex(0); pause(); resetPosition();
  }, [flow]);
  useEffect(() => { if (reducedMotion) pause(); }, [reducedMotion]);
  useEffect(() => {
    const visibility = () => { if (document.hidden) pause(); };
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);

  useEffect(() => {
    if (!waiting) return;
    const root = viewport.current;
    if (!loop || reducedMotion || error || !root || !('IntersectionObserver' in window)) { setWaiting(false); replayDeadline.current = null; return; }
    let visible = false;
    let cancelled = false;
    const cancelTimer = () => { window.clearTimeout(replayTimer.current); replayTimer.current = undefined; };
    const observer = new IntersectionObserver((entries) => {
      if (cancelled) return;
      const wasVisible = visible;
      visible = entries.some((entry) => entry.isIntersecting);
      cancelTimer();
      if (!visible || document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        // A newly mounted dialog may report an initial non-intersecting frame
        // before showModal(). Do not discard its saved replay deadline then.
        if (wasVisible || document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) replayDeadline.current = null;
        return;
      }
      if (!replayDeadline.current || replayDeadline.current.delay !== loopDelay) replayDeadline.current = { at: performance.now() + loopDelay, delay: loopDelay };
      replayTimer.current = window.setTimeout(() => {
        if (cancelled || !visible || document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        replayTimer.current = undefined; replayDeadline.current = null;
        resetPosition(); setIndex(0); setRevision((value) => value + 1);
        setWaiting(false); setPlaying(true);
      }, Math.max(0, replayDeadline.current.at - performance.now()));
    });
    observer.observe(root);
    return () => { cancelled = true; cancelTimer(); observer.disconnect(); };
  }, [waiting, loop, loopDelay, reducedMotion, error, viewport, fullscreen]);

  useEffect(() => {
    const root = viewport.current;
    if (!autoplay || reducedMotion || !root || autoplayConsumed.current || !('IntersectionObserver' in window)) return;
    let visible = false;
    const start = () => {
      if (!visible || document.hidden || autoplayConsumed.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      autoplayConsumed.current = true;
      setPlaying(true);
      observer.disconnect();
    };
    const observer = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      start();
    });
    observer.observe(root);
    document.addEventListener('visibilitychange', start);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', start); };
  }, [autoplay, reducedMotion, viewport, autoplayConsumed, flow, scenario, fullscreen]);

  useEffect(() => {
    const root = viewport.current;
    if (!root) return;
    const changed: Element[] = [];
    const edges = new Set(scenario.steps.map((item) => item.edgeToken));
    const endpointTokens = scenario.steps.flatMap((item) => [item.fromToken, item.toToken]);
    for (const svg of Array.from(root.querySelectorAll('.d2-zoom-content > div > svg'))) {
      const elements = Array.from(svg.querySelectorAll('[data-d2-flow-node], [data-d2-flow-edge]'));
      const nodes = new Map(elements.filter((element) => element.hasAttribute('data-d2-flow-node'))
        .map((element) => [element.getAttribute('data-d2-flow-node')!, element]));
      const used = new Set(endpointTokens);
      for (const token of endpointTokens) {
        let parent = nodes.get(token)?.getAttribute('data-d2-flow-parent');
        while (parent && !used.has(parent)) {
          used.add(parent);
          parent = nodes.get(parent)?.getAttribute('data-d2-flow-parent');
        }
      }
      for (const element of elements) {
        const node = element.getAttribute('data-d2-flow-node');
        const participates = node ? used.has(node) : edges.has(element.getAttribute('data-d2-flow-edge')!);
        element.setAttribute('data-d2-flow-participates', String(participates));
        changed.push(element);
      }
    }
    return () => changed.forEach((element) => element.removeAttribute('data-d2-flow-participates'));
  }, [scenario, viewport, fullscreen]);

  useEffect(() => {
    const root = viewport.current;
    if (!root) return;
    const added: Element[] = [];
    const prepared: Marker[] = [];
    const restoreMarkers: (() => void)[] = [];
    try {
      const svgs = Array.from(root.querySelectorAll('.d2-zoom-content > div > svg'));
      if (svgs.length !== 2) throw new Error('Missing themed SVGs.');
      for (const svg of svgs) {
        const edge = svg.querySelector(`[data-d2-flow-edge="${step.edgeToken}"]`);
        const source = svg.querySelector(`[data-d2-flow-node="${step.fromToken}"]`);
        const target = svg.querySelector(`[data-d2-flow-node="${step.toToken}"]`);
        const d = edge?.getAttribute('data-d2-flow-path');
        if (!edge || !source || !target || !d) throw new Error(`Missing continuous SVG path for ${step.edge}.`);
        edge.setAttribute('data-d2-flow-current', 'true');
        restoreMarkers.push(() => edge.removeAttribute('data-d2-flow-current'));
        restoreMarkers.push(highlightMarkers(edge, svg, `${markerId}-${step.edgeToken}`));
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', d);
        path.setAttribute('class', 'd2-flow-track');
        path.setAttribute('aria-hidden', 'true');
        const mask = edge.querySelector('path.connection[mask]')?.getAttribute('mask');
        if (mask) path.setAttribute('mask', mask);
        edge.append(path); added.push(path);
        const length = path.getTotalLength();
        if (!Number.isFinite(length) || length <= 0) throw new Error(`Empty SVG path for ${step.edge}.`);
        const halo = document.createElementNS(svgNS, 'circle');
        halo.setAttribute('r', '12');
        halo.setAttribute('class', 'd2-flow-halo');
        halo.setAttribute('aria-hidden', 'true');
        edge.append(halo); added.push(halo);
        const circle = document.createElementNS(svgNS, 'circle');
        circle.setAttribute('r', '7.5');
        circle.setAttribute('class', 'd2-flow-token');
        circle.setAttribute('aria-hidden', 'true');
        edge.append(circle); added.push(circle);
        const marker: Marker = { path, circle, halo, length, edge, source, target };
        prepared.push(marker);
      }
      markers.current = prepared;
      position(); setError('');
    } catch (cause) {
      setError(`Could not animate this path. Read the steps below. ${cause instanceof Error ? cause.message : ''}`);
      pause();
    }
    return () => {
      markers.current = [];
      added.forEach((element) => element.remove());
      restoreMarkers.forEach((restore) => restore());
      for (const marker of prepared) for (const element of [marker.edge, marker.source, marker.target]) element.removeAttribute('data-d2-flow-active');
    };
  }, [step, viewport, revision, duration, markerId, fullscreen]);

  useEffect(() => {
    if (!playing || reducedMotion || error) return;
    const total = duration + arrivalDuration;
    if (elapsed.current >= total) elapsed.current = 0;
    let frame = 0;
    let previous: number | undefined;
    const tick = (time: number) => {
      if (previous !== undefined) elapsed.current = Math.min(total, elapsed.current + (time - previous) * speed);
      previous = time;
      position();
      if (elapsed.current >= total) {
        if (index < scenario.steps.length - 1) {
          elapsed.current = 0; setIndex((value) => value + 1);
        } else { replayDeadline.current = null; setPlaying(false); setWaiting(loop); }
      } else frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [playing, reducedMotion, error, speed, step, index, scenario.steps.length, duration, loop, fullscreen]);

  const actions = <div className="d2-flow-actions" role="group" aria-label="Request flow controls">
    <D2IconButton label="Previous" icon="previous" onClick={() => go(index - 1)} disabled={index === 0} />
    <D2IconButton label={playing || waiting ? 'Pause' : 'Play'} icon={playing || waiting ? 'pause' : 'play'}
      disabled={reducedMotion || !!error} aria-pressed={playing || waiting} onClick={() => {
        autoplayConsumed.current = true;
        if (playing || waiting) { pause(); return; }
        if (!playing && index === scenario.steps.length - 1 && elapsed.current >= duration + arrivalDuration) { resetPosition(); setIndex(0); setRevision((value) => value + 1); }
        setPlaying(true);
      }} />
    <D2IconButton label="Next" icon="next" onClick={() => go(index + 1)} disabled={index === scenario.steps.length - 1} />
    <D2IconButton label="Reset" icon="reset" onClick={() => go(0, false)} />
    <details className="d2-flow-transcript d2-source-menu" ref={stepsMenu}>
      <summary aria-label={`All steps (${scenario.steps.length})`} title={`All steps (${scenario.steps.length})`}><D2Icon name="list" /></summary>
      <div className="d2-source-panel">
        <p className="d2-flow-list-title">{scenario.label} · {scenario.steps.length} steps</p>
        <ol>{scenario.steps.map((item, current) => <li key={current} aria-current={current === index ? 'step' : undefined}>
          <button type="button" onClick={() => {
            go(current);
            if (stepsMenu.current) { stepsMenu.current.open = false; stepsMenu.current.querySelector('summary')?.focus(); }
          }}><strong>{item.from} → {item.to}</strong>: {item.description}</button>
        </li>)}</ol>
      </div>
    </details>
    <label className="d2-flow-speed" title="Playback speed">
      <span className="d2-sr-only">Speed</span>
      <select aria-label="Speed" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
        {[0.5, 1, 2].map((value) => <option key={value} value={value}>{value}×</option>)}
      </select>
    </label>
  </div>;
  const header = <div className="d2-flow-player">
    <div className="d2-flow-controls" role="group" aria-label="Flow scenarios">
      <label><span className="d2-sr-only">Scenario</span><select aria-label="Scenario" aria-description="Illustrative playback, not live traffic. Greyed-out components are not used in this scenario." title="Scenario · greyed-out components are not used in this scenario" value={scenario.id} onChange={(event) => {
        // Selecting a new scenario is an explicit request for fresh playback.
        // Rearm the visibility/reduced-motion guarded autoplay, not the old loop timer.
        autoplayConsumed.current = !autoplay;
        pause(); resetPosition(); setIndex(0);
        setScenarioIndex(flow.scenarios.findIndex((item) => item.id === event.target.value));
        setRevision((value) => value + 1);
        if (stepsMenu.current) stepsMenu.current.open = false;
      }}>{flow.scenarios.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <p className="d2-flow-current" aria-live="polite" aria-atomic="true">
      <span className="d2-flow-count">{index + 1} / {scenario.steps.length}</span>
      <strong>{step.from} → {step.to}</strong><span>{step.description}</span>
      <span className="d2-flow-phase d2-sr-only">{waiting ? `Replay after ${loopDelay / 1000} s` : phase === 'arrival' ? `Arrived at ${step.to}` : 'Travelling'}</span>
      </p>
    </div>
    {reducedMotion && <p className="d2-flow-note">Motion reduced. Use Previous and Next to explore each step.</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
  return children(header, actions);
}
