export type TabKey = 'servers' | 'clients' | 'logs' | 'debugger';

export function TabSwitcher({
  value,
  onChange,
  serverCount,
  clientCount,
  logsCount = 0,
  debuggerCount = 0,
}: {
  value: TabKey;
  onChange: (v: TabKey) => void;
  serverCount: number;
  clientCount: number;
  logsCount?: number;
  debuggerCount?: number;
}) {
  const base =
    'inline-flex items-center px-3.5 py-1.5 rounded-full text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-300 dark:focus:ring-brand-500 focus:ring-offset-1 focus:ring-offset-surface-100 dark:focus:ring-offset-surface-900 shadow-sm';

  const active = 'bg-brand-500 text-white hover:bg-brand-400';

  const inactive =
    'bg-surface-200 text-surface-700 hover:bg-surface-300 dark:bg-surface-800 dark:text-surface-100 dark:hover:bg-surface-700';

  const badge = 'ml-2 px-2 py-0.5 rounded-full text-xs font-semibold';
  const activeBadge = 'bg-white/20 text-white';
  const inactiveBadge = 'bg-surface-300 text-surface-700 dark:bg-surface-700 dark:text-surface-200';

  return (
    <>
      <div className="fixed top-14 left-0 right-0 z-30 border-b border-surface-200/70 bg-surface-100/95 backdrop-blur-md transition-colors dark:border-surface-800/60 dark:bg-surface-900/70">
        <div className="mx-auto flex max-w-5xl flex-wrap gap-2 px-6 py-2.5">
          <button
            className={`${base} ${value === 'servers' ? active : inactive}`}
            onClick={() => onChange('servers')}
          >
            Servers
            <span className={`${badge} ${value === 'servers' ? activeBadge : inactiveBadge}`}>
              {serverCount}
            </span>
          </button>
          <button
            className={`${base} ${value === 'clients' ? active : inactive}`}
            onClick={() => onChange('clients')}
          >
            Clients
            <span className={`${badge} ${value === 'clients' ? activeBadge : inactiveBadge}`}>
              {clientCount}
            </span>
          </button>
          <button
            className={`${base} ${value === 'logs' ? active : inactive}`}
            onClick={() => onChange('logs')}
          >
            Logs
            <span className={`${badge} ${value === 'logs' ? activeBadge : inactiveBadge}`}>
              {logsCount}
            </span>
          </button>
          <button
            className={`${base} ${value === 'debugger' ? active : inactive}`}
            onClick={() => onChange('debugger')}
          >
            Debugger
            <span className={`${badge} ${value === 'debugger' ? activeBadge : inactiveBadge}`}>
              {debuggerCount}
            </span>
          </button>
        </div>
      </div>
      <div className="h-12" aria-hidden />
    </>
  );
}
