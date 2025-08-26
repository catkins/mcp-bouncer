import React from 'react';

export type TabKey = 'servers' | 'clients';

export function TabSwitcher({ value, onChange }: { value: TabKey; onChange: (v: TabKey) => void }) {
  const base =
    'px-3 py-1.5 rounded-md text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/40 shadow-sm transform hover:scale-105 active:scale-95';

  const active =
    'bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700';

  const inactive =
    'bg-gradient-to-r from-purple-600/15 to-purple-500/15 text-gray-700 dark:text-gray-200 hover:from-purple-600/25 hover:to-purple-500/25';

  return (
    <div className="inline-flex gap-2 mb-4">
      <button
        className={`${base} ${value === 'servers' ? active : inactive}`}
        onClick={() => onChange('servers')}
      >
        Servers
      </button>
      <button
        className={`${base} ${value === 'clients' ? active : inactive}`}
        onClick={() => onChange('clients')}
      >
        Clients
      </button>
    </div>
  );
}
