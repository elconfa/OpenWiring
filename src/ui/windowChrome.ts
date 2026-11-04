// Cornice della finestra: barra del titolo integrata di Windows 11 (pulsanti di sistema sopra la
// barra dei comandi, con i colori del tema), titolo della finestra con il nome del progetto e
// animazioni leggere dell'interfaccia (spegnibili; spente anche con «riduci movimento» del sistema).
import { useEffect } from 'react';
import { useStore } from '../model/store';

interface Wco { visible: boolean; addEventListener(t: 'geometrychange', f: () => void): void; removeEventListener(t: 'geometrychange', f: () => void): void }
const overlay = (): Wco | undefined => (navigator as Navigator & { windowControlsOverlay?: Wco }).windowControlsOverlay;

export function useWindowChrome() {
  const theme = useStore(s => s.theme);
  const name = useStore(s => s.project.info.name);
  const dirty = useStore(s => s.dirty);
  const animations = useStore(s => s.animations);

  // Barra del titolo integrata: la riga in alto si trascina come una barra del titolo
  useEffect(() => {
    const o = overlay();
    if (!o) return;
    const upd = () => document.documentElement.classList.toggle('wco', o.visible);
    upd();
    o.addEventListener('geometrychange', upd);
    return () => o.removeEventListener('geometrychange', upd);
  }, []);

  // Pulsanti di sistema con i colori del tema (anche quando il tema segue il sistema)
  useEffect(() => {
    const send = () => {
      const css = getComputedStyle(document.documentElement);
      window.elettro?.titleBar?.({ color: css.getPropertyValue('--panel').trim() || '#f8f9fb', symbol: css.getPropertyValue('--text').trim() || '#1b1f24', height: 32 });
    };
    // Dopo che il tema è stato applicato al documento
    const t = requestAnimationFrame(send);
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    mq?.addEventListener?.('change', send);
    return () => { cancelAnimationFrame(t); mq?.removeEventListener?.('change', send); };
  }, [theme]);

  useEffect(() => { document.title = `${name ? `${name}${dirty ? ' •' : ''} — ` : ''}OpenWiring`; }, [name, dirty]);

  useEffect(() => {
    if (animations) delete document.documentElement.dataset.anim;
    else document.documentElement.dataset.anim = 'off';
  }, [animations]);
}
