import { useMemo, useState } from 'react';
import { HighlightedJson } from '../logs/HighlightedJson';
import { ClockIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import type { CallOutcome } from './types';
import { extractToolError } from './utils';
import { RichToolResult } from './RichToolResult';
import { ToggleSwitch } from '../ToggleSwitch';

interface ResponsePanelProps {
  callResult: CallOutcome | null;
  callError: string | null;
  selectedToolName: string | null;
}

export function ResponsePanel({ callResult, callError, selectedToolName }: ResponsePanelProps) {
  const [richViewEnabled, setRichViewEnabled] = useState(true);

  const toolErrorMessage = useMemo(() => {
    if (!callResult) return null;
    const message = extractToolError(callResult.result);
    if (!message) return null;
    if (!callResult.ok) return message;
    const lowered = message.toLowerCase();
    return lowered.includes('error') || lowered.includes('fail') ? message : null;
  }, [callResult]);

  const derivedErrorMessage = useMemo(() => {
    if (callError) return callError;
    if (callResult && !callResult.ok) {
      return toolErrorMessage ?? 'Tool returned an error response.';
    }
    return toolErrorMessage;
  }, [callError, callResult, toolErrorMessage]);

  const isFailure = Boolean(callError || (callResult && !callResult.ok));
  const errorStyle = isFailure
    ? 'rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-600 shadow-sm dark:border-red-800 dark:bg-red-900/30 dark:text-red-200'
    : 'rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 shadow-sm dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200';

  const showTopLevelError = !callResult && derivedErrorMessage;
  const inlineError = callResult ? derivedErrorMessage : null;

  return (
    <div className="flex min-h-0 min-w-0 flex-col rounded-xl border border-surface-200/80 bg-white/90 p-4 shadow-sm transition-colors dark:border-surface-800/60 dark:bg-surface-900/70">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClockIcon className="h-4 w-4 text-brand-500" />
          <h3 className="text-sm font-semibold text-surface-800 dark:text-white">Response</h3>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400">
          View Mode
          <ToggleSwitch
            checked={richViewEnabled}
            onChange={checked => setRichViewEnabled(checked)}
            size="sm"
            label={richViewEnabled ? 'Rich view' : 'Raw JSON'}
            description="Toggle rich response view"
            disabled={!callResult}
          />
        </div>
        {callResult && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              callResult.ok
                ? 'bg-brand-400/15 text-brand-600 dark:bg-brand-900/30 dark:text-brand-200'
                : 'bg-red-500/15 text-red-600 dark:bg-red-900/30 dark:text-red-300'
            }`}
          >
            {callResult.ok ? <CheckCircleIcon className="h-3 w-3" /> : <XCircleIcon className="h-3 w-3" />}
            {callResult.ok ? 'ok' : 'error'} · {callResult.durationMs} ms
          </span>
        )}
      </div>
      {showTopLevelError ? <div className={errorStyle}>{showTopLevelError}</div> : null}

      {callResult ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400">
              Request Arguments
            </div>
            <HighlightedJson value={callResult.request ?? {}} className="mt-1" collapsedByDefault />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400">
                TOOL RESULT
                {selectedToolName ? (
                  <code className="ml-2 rounded bg-surface-200 px-1 py-[2px] font-mono text-[11px] font-semibold normal-case text-surface-700 dark:bg-surface-800 dark:text-surface-100">
                    {selectedToolName}
                  </code>
                ) : null}
              </span>
            </div>
            {inlineError ? (
              <div className={errorStyle}>{inlineError}</div>
            ) : richViewEnabled ? (
              <RichToolResult result={callResult.result} />
            ) : (
              <HighlightedJson value={callResult.result} className="flex-1" collapsedByDefault />
            )}
          </div>
        </div>
      ) : !showTopLevelError ? (
        <div className="flex flex-1 items-center justify-center text-sm text-surface-500 dark:text-surface-400">
          Execute a tool call to see the response payload.
        </div>
      ) : null}
    </div>
  );
}
