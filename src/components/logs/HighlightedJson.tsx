import { useMemo, useState } from 'react';
import { Highlight, themes, type Language } from 'prism-react-renderer';

export function HighlightedJson({ value, collapsedByDefault }: { value: unknown; collapsedByDefault?: boolean }) {
  const json = useMemo(() => JSON.stringify(value, null, 2) ?? '', [value]);
  const [expanded, setExpanded] = useState(!collapsedByDefault);
  const tooLarge = json.length > 8_192;
  const show = expanded || !tooLarge;
  const theme = typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? themes.vsDark : themes.vsLight;
  return (
    <div>
      {tooLarge && (
        <button
          className="mb-1 text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
          onClick={() => setExpanded(v => !v)}
        >
          {expanded ? 'Collapse large payload' : `Expand large payload (${Math.round(json.length / 1024)}KB)`}
        </button>
      )}
      {show ? (
        <div className="text-xs rounded border border-gray-200 dark:border-gray-700 overflow-auto max-h-64">
          <Highlight theme={theme} code={json} language={'json' as Language}>
            {({ className, style, tokens, getLineProps, getTokenProps }) => (
              <pre className={`${className} bg-transparent m-0 p-2`} style={style}>
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
        </div>
      ) : (
        <div className="text-xs italic text-gray-500">Payload hidden</div>
      )}
    </div>
  );
}
