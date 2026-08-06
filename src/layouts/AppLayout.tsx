import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/layout/Sidebar';
import type { User } from '../types';

export function AppLayout({ user, onLogout }: { user: User; onLogout: () => void }) {
  return (
    <div className="flex min-h-screen bg-bg text-text">
      <Sidebar user={user} onLogout={onLogout} />
      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
