export type TabKey = 'servers' | 'clients' | 'logs';

export function TabSwitcher({
  value,
  onChange,
  serverCount,
  clientCount,
  logsCount = 0,
}: {
  value: TabKey;
  onChange: (v: TabKey) => void;
  serverCount: number;
  clientCount: number;
  logsCount?: number;
}) {
  const base =
    'inline-flex items-center px-3 py-1.5 rounded-md text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/40 shadow-sm transform hover:scale-105 active:scale-95';

  const active =
    'bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700';

  const inactive =
    'bg-gradient-to-r from-purple-600/15 to-purple-500/15 text-gray-700 dark:text-gray-200 hover:from-purple-600/25 hover:to-purple-500/25';

  const badge = 'ml-2 px-2 py-0.5 rounded-full text-xs font-semibold';
  const activeBadge = 'bg-white/20 text-white';
  const inactiveBadge = 'bg-purple-500/20 text-purple-700 dark:text-purple-200';

  return (
    <div className="inline-flex gap-2 mb-4">
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
    </div>
  );
}
