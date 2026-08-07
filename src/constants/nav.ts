import { LayoutDashboard, Link2, Users, Wallet, PackageCheck, Sparkles } from 'lucide-react';
import type { ComponentType } from 'react';

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number | string; className?: string }>;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/cadenas', label: 'Cadenas', icon: Link2 },
  { to: '/participantes', label: 'Participantes', icon: Users },
  { to: '/pagos', label: 'Pagos', icon: Wallet },
  { to: '/entregas', label: 'Entregas', icon: PackageCheck },
  { to: '/ia', label: 'IA operativa', icon: Sparkles },
];
