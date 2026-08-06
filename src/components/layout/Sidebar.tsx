import { NavLink } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { NAV_ITEMS } from '../../constants/nav';
import type { User } from '../../types';

export function Sidebar({ user, onLogout }: { user: User; onLogout: () => void }) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface p-4">
      <div className="mb-6">
        <h1 className="font-display text-lg font-bold text-text">LoQui Chain</h1>
        <p className="mt-1 text-xs text-text-muted">{user.nombre}</p>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? 'bg-accent text-accent-ink' : 'text-text-muted hover:bg-surface-2 hover:text-text'
              }`
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      <button
        onClick={onLogout}
        className="mt-4 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-text-muted hover:bg-surface-2 hover:text-text"
      >
        <LogOut size={16} />
        Salir
      </button>
    </aside>
  );
}
