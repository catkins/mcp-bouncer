import { useIncomingClients, type IncomingClient } from '../hooks/useIncomingClients';
import { ClientCard } from './ClientCard';

export function ClientList({ clients: provided }: { clients?: IncomingClient[] }) {
  const { clients: liveClients } = useIncomingClients();
  const clients = provided ?? liveClients;

  if (!clients.length) {
    return (
      <div className="p-6 text-center text-gray-600 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
        No clients are currently connected.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      {clients.map(c => (
        <ClientCard key={c.id} client={c} />
      ))}
    </div>
  );
}
