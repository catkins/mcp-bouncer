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
          'relative flex-1 rounded border border-gray-200 bg-gray-50 text-xs dark:border-gray-700 dark:bg-gray-900',
          showFull ? 'no-scrollbar overflow-auto' : 'overflow-hidden'
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
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-gray-50 dark:to-gray-900" />
        )}
      </div>
      {tooLarge && (
        <button
          className="self-start rounded bg-gray-100 px-1.5 py-[1px] text-[11px] text-gray-700 dark:bg-gray-700 dark:text-gray-200"
          onClick={() => setExpanded(v => !v)}
        >
          {expanded ? 'Collapse large payload' : `Expand large payload (${Math.round(json.length / 1024)}KB)`}
        </button>
      )}
    </div>
  );
}
