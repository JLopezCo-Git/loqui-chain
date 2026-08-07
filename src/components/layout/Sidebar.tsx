import { NavLink } from 'react-router-dom';
import { LogOut, X } from 'lucide-react';
import { NAV_ITEMS } from '../../constants/nav';
import type { User } from '../../types';

export function Sidebar({
  user,
  onLogout,
  open,
  onClose,
}: {
  user: User;
  onLogout: () => void;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30 bg-bg/70 md:hidden" onClick={onClose} aria-hidden="true" />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col border-r border-border bg-surface p-4 transition-transform md:static md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-display text-lg font-bold text-text">LoQui Chain</h1>
            <p className="mt-1 text-xs text-text-muted">{user.nombre}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar menú"
            className="rounded-md p-1 text-text-muted hover:bg-surface-2 md:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
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
          className="mt-4 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <LogOut size={16} />
          Salir
        </button>
      </aside>
    </>
  );
}
