'use client';

import { useEffect, useRef } from 'react';

/** Enhance native details without changing SSR/no-JS disclosure behavior. */
export function useD2Disclosure() {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const document = ref.current?.ownerDocument;
    if (!document) return;
    const outside = (event: Event) => {
      const menu = ref.current;
      if (menu?.open && !event.composedPath().includes(menu)) menu.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      const menu = ref.current;
      if (event.key !== 'Escape' || !menu?.open) return;
      const restoreFocus = menu.contains(document.activeElement);
      menu.open = false;
      event.preventDefault(); event.stopPropagation();
      if (restoreFocus) menu.querySelector('summary')?.focus();
    };
    // Capture sees outside clicks even when a canvas/host stops bubbling. Do not
    // prevent the event: links, controls and native diagram panning must still work.
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside, true);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside, true);
      document.removeEventListener('keydown', escape, true);
    };
  }, []);
  return ref;
}
