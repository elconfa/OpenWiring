// Suggerimenti ricchi (come in Office): passando sopra un comando compare un riquadro con l'icona,
// il nome in grassetto, il tasto rapido e la spiegazione. Valgono per gli elementi con l'attributo
// data-tip (nome) e, se ci sono, data-tip-text (spiegazione), data-tip-key (tasto), data-tip-icon.
import { useEffect, useState } from 'react';
import { Icon } from './icons';

interface Tip { x: number; y: number; title: string; text?: string; keys?: string; icon?: string }

/** Attributi per un elemento con il suggerimento ricco */
export function tipProps(title: string, text?: string, keys?: string, icon?: string): Record<string, string | undefined> {
  return { 'data-tip': title, 'data-tip-text': text && text !== title ? text : undefined, 'data-tip-key': keys || undefined, 'data-tip-icon': icon, 'aria-label': title };
}

export function RichTooltip() {
  const [tip, setTip] = useState<Tip | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cur: Element | null = null;
    let watch: ReturnType<typeof setInterval> | undefined;
    const hide = () => { clearTimeout(timer); clearInterval(watch); cur = null; setTip(null); };
    /** Il comando è ancora visibile sotto il puntatore? Una finestra aperta sopra lo copre */
    const visible = (el: Element) => {
      if (!document.contains(el)) return false;
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && el.contains(hit);
    };
    const over = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-tip]') ?? null;
      if (el === cur) return;
      hide();
      if (!el) return;
      cur = el;
      timer = setTimeout(() => {
        if (!cur || !visible(cur)) return;
        const r = cur.getBoundingClientRect();
        const W = 300;
        setTip({
          x: Math.max(6, Math.min(window.innerWidth - W - 6, r.left)),
          y: r.bottom + 6 + 120 > window.innerHeight ? Math.max(6, r.top - 6 - 110) : r.bottom + 6,
          title: cur.getAttribute('data-tip') ?? '', text: cur.getAttribute('data-tip-text') ?? undefined,
          keys: cur.getAttribute('data-tip-key') ?? undefined, icon: cur.getAttribute('data-tip-icon') ?? undefined,
        });
        // Se nel frattempo si apre una finestra sopra il comando, il suggerimento sparisce
        watch = setInterval(() => { if (!cur || !visible(cur)) hide(); }, 250);
      }, 550);
    };
    window.addEventListener('mouseover', over);
    window.addEventListener('mousedown', hide, true);
    window.addEventListener('keydown', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      clearTimeout(timer);
      clearInterval(watch);
      window.removeEventListener('mouseover', over);
      window.removeEventListener('mousedown', hide, true);
      window.removeEventListener('keydown', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, []);
  if (!tip) return null;
  return (
    <div className="rich-tip" role="tooltip" style={{ left: tip.x, top: tip.y }}>
      {tip.icon && <div className="rt-icon"><Icon name={tip.icon} size={28} /></div>}
      <div className="rt-body">
        <div className="rt-head"><b>{tip.title}</b>{tip.keys && <kbd>{tip.keys}</kbd>}</div>
        {tip.text && <div className="rt-text">{tip.text}</div>}
      </div>
    </div>
  );
}
