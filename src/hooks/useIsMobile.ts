import { useEffect, useState } from 'react';

// Breakpoint alineado a Tailwind `md` (768px) -- por debajo de eso la app
// usa el patrón "agenda por quincena" en vez de la matriz completa.
export function useIsMobile(breakpointPx = 768): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(`(max-width: ${breakpointPx - 1}px)`).matches);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [breakpointPx]);

  return isMobile;
}
