import { LayoutDashboard, Link2, Users, Sparkles, Coins } from 'lucide-react';
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
  { to: '/monedas', label: 'Alcancía', icon: Coins },
  { to: '/ia', label: 'IA operativa', icon: Sparkles },
];
