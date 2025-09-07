import { useEffect } from 'react';

function getFocusable(container: HTMLElement): HTMLElement[] {
  const nodes = Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])',
    ),
  );
  return nodes.filter(el => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'));
}

export function useFocusTrap(ref: React.RefObject<HTMLElement>, active: boolean, opts?: { initialFocusSelector?: string }) {
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;

    const focusables = getFocusable(el);
    // focus initial element or first focusable
    const initial = opts?.initialFocusSelector
      ? (el.querySelector(opts.initialFocusSelector) as HTMLElement | null)
      : null;
    const target = initial || focusables[0];
    if (target && typeof target.focus === 'function') {
      target.focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const list = getFocusable(el);
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (!activeEl || activeEl === first) {
          last.focus();
          e.preventDefault();
        }
      } else {
        if (!activeEl || activeEl === last) {
          first.focus();
          e.preventDefault();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [ref, active, opts?.initialFocusSelector]);
}

