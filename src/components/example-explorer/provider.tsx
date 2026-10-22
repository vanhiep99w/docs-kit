'use client';

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { readExampleURL, resolveExample, validateExamples, validateExampleRequest, validateExampleURL, writeExampleURL, type ExampleDefinition, type ExampleRequest } from '../../example-explorer/index.js';
import ExampleDialog from './dialog.js';
import { ExampleIcon } from './icons.js';

type Context = {
  examples: readonly ExampleDefinition[];
  open: (request: ExampleRequest) => void;
  register: (id: string, request: ExampleRequest) => () => void;
};
const ExampleContext = createContext<Context | null>(null);

export type ExampleExplorerProviderProps = {
  children: ReactNode;
  examples: readonly ExampleDefinition[];
  /** Router pathname, not search params. */
  navigationKey?: string;
  /** Show a floating Example button for the references registered on this page. */
  launcher?: boolean;
};

export function ExampleExplorerProvider({ children, examples, navigationKey, launcher = true }: ExampleExplorerProviderProps) {
  useMemo(() => validateExamples(examples), [examples]);
  const [request, setRequest] = useState<ExampleRequest | null>(null);
  const [references, setReferences] = useState<Map<string, ExampleRequest>>(() => new Map());
  const lastRequest = useRef<ExampleRequest | null>(null);
  const ownsEntry = useRef(false);
  const closing = useRef(false);
  const dialogId = useId();

  useEffect(() => {
    lastRequest.current = null;
    const sync = () => {
      closing.current = false;
      ownsEntry.current = false;
      const next = readExampleURL(new URL(window.location.href));
      if (next) lastRequest.current = next;
      setRequest(next);
    };
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [navigationKey]);

  const open = useCallback((next: ExampleRequest) => {
    if (closing.current) return;
    const resolved = resolveExample(examples, next);
    const normalized = { example: resolved.example.id, version: resolved.version.id };
    const url = writeExampleURL(new URL(window.location.href), normalized);
    if (readExampleURL(new URL(window.location.href))) {
      window.history.replaceState(window.history.state, '', url);
    } else {
      window.history.pushState(window.history.state, '', url);
      ownsEntry.current = true;
    }
    lastRequest.current = normalized;
    setRequest(normalized);
  }, [examples]);

  const navigate = useCallback((next: ExampleRequest) => {
    const resolved = resolveExample(examples, next);
    const normalized = { example: resolved.example.id, version: resolved.version.id };
    window.history.replaceState(window.history.state, '', writeExampleURL(new URL(window.location.href), normalized));
    lastRequest.current = normalized;
    setRequest(normalized);
  }, [examples]);

  const close = useCallback(() => {
    setRequest(null); // Unmount the iframe immediately, not after an asynchronous history.back().
    if (ownsEntry.current) {
      closing.current = true;
      ownsEntry.current = false;
      window.history.back();
    } else {
      window.history.replaceState(window.history.state, '', writeExampleURL(new URL(window.location.href), null));
    }
  }, []);

  const register = useCallback((id: string, next: ExampleRequest) => {
    resolveExample(examples, next);
    setReferences(previous => new Map(previous).set(id, next));
    return () => setReferences(previous => {
      const copy = new Map(previous);
      copy.delete(id);
      return copy;
    });
  }, [examples]);
  const context = useMemo(() => ({ examples, open, register }), [examples, open, register]);
  const first = references.values().next().value as ExampleRequest | undefined;
  let knownLast: ExampleRequest | undefined;
  try { if (lastRequest.current) { resolveExample(examples, lastRequest.current); knownLast = lastRequest.current; } } catch { /* A bad deep link must not poison the launcher. */ }
  const available = request ?? knownLast ?? first;
  const registered = new Set([...references.values()].map(item => item.example));
  if (request) registered.add(request.example);
  const choices = examples.filter(item => registered.has(item.id));

  return <ExampleContext.Provider value={context}>
    {children}
    {launcher && available && <button type="button" className="example-launcher" aria-label="Mở example"
      aria-haspopup="dialog" aria-expanded={!!request} aria-controls={request ? dialogId : undefined}
      onClick={() => open(knownLast ?? first ?? available)}>
      <ExampleIcon /><span>Example</span><span aria-hidden="true">↗</span>
    </button>}
    {request && <ExampleDialog id={dialogId} examples={examples} choices={choices.length ? choices : examples}
      request={request} onNavigate={navigate} onClose={close} />}
  </ExampleContext.Provider>;
}

export function useExampleExplorer() { return useContext(ExampleContext); }

export type ExampleRefProps = ExampleRequest & {
  children?: ReactNode;
  variant?: 'inline' | 'button';
  /** Required only outside a provider; also serves as a no-JavaScript fallback. */
  href?: string;
};
export function ExampleRef({ example, version, children, variant = 'button', href }: ExampleRefProps) {
  const context = useContext(ExampleContext);
  const id = useId();
  validateExampleRequest({ example, version });
  const resolved = context ? resolveExample(context.examples, { example, version }) : undefined;
  const fallback = href ?? resolved?.version.src;
  if (!fallback) throw new TypeError('ExampleRef requires an ExampleExplorerProvider or an explicit href');
  validateExampleURL(fallback, 'href');
  const register = context?.register;
  useEffect(() => register?.(id, { example, version }), [register, id, example, version]);
  function click(event: MouseEvent<HTMLAnchorElement>) {
    if (!context || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    context.open({ example, version });
  }
  return <a className={`example-ref example-ref--${variant}`} href={fallback} onClick={click}
    aria-haspopup={context ? 'dialog' : undefined}>
    <ExampleIcon /><span>{children ?? 'Example'}</span><span className="example-ref-arrow" aria-hidden="true">↗</span>
  </a>;
}
