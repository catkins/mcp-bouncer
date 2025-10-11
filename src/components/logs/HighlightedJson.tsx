import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { Highlight, themes, type Language } from 'prism-react-renderer';

export function HighlightedJson({ value, collapsedByDefault, className }: {
  value: unknown;
  collapsedByDefault?: boolean;
  className?: string;
}) {
  const json = useMemo(() => JSON.stringify(value, null, 2) ?? '', [value]);
  const [expanded, setExpanded] = useState(!collapsedByDefault);
  const tooLarge = json.length > 8_192;
  const lines = useMemo(() => json.split('\n'), [json]);
  const previewLineCount = 15;
  const preview = useMemo(() => lines.slice(0, previewLineCount).join('\n'), [lines]);
  const previewClipped = lines.length > previewLineCount;
  const showFull = !tooLarge || expanded;
  const theme = typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? themes.vsDark : themes.vsLight;
  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      <div
        className={clsx(
          'relative flex-1 overflow-x-auto overflow-y-auto rounded-lg border border-surface-200/80 bg-white/95 text-xs shadow-sm dark:border-surface-800/60 dark:bg-surface-900/70',
          showFull ? 'max-h-96' : 'max-h-60 overflow-hidden'
        )}
      >
        <Highlight
          theme={theme}
          code={showFull ? json : preview}
          language={'json' as Language}
        >
          {({ className: highlightClass, style, tokens, getLineProps, getTokenProps }) => (
            <pre className={`${highlightClass} m-0 bg-transparent p-1.5`} style={{ ...style, backgroundColor: 'transparent' }}>
              {tokens.map((line, i) => (
                <div key={i} {...getLineProps({ line })}>
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </div>
              ))}
            </pre>
          )}
        </Highlight>
        {!showFull && previewClipped && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-white dark:to-surface-900" />
        )}
      </div>
      {tooLarge && (
        <button
          className="self-start rounded-md bg-surface-200 px-1.5 py-[2px] text-[11px] text-surface-700 transition hover:bg-surface-300 dark:bg-surface-800 dark:text-surface-100 dark:hover:bg-surface-700"
          onClick={() => setExpanded(v => !v)}
        >
          {expanded ? 'Collapse large payload' : `Expand large payload (${Math.round(json.length / 1024)}KB)`}
        </button>
      )}
    </div>
  );
}
