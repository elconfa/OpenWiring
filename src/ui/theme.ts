import { useEffect, useState } from 'react';
import { useStore } from '../model/store';

/** Tema effettivo: quello scelto o, con "Sistema", quello del sistema operativo */
export function useDarkTheme(): boolean {
  const theme = useStore(s => s.theme);
  const [sysDark, setSysDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const h = () => setSysDark(mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return theme === 'dark' || (theme === 'system' && sysDark);
}
