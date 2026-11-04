// Editor dei testi liberi dello schema: si apre con «…» nelle Proprietà del testo, con il doppio clic
// sul testo o inserendo un testo nuovo. Righe a capo a mano, grassetto, corsivo, sottolineato,
// elenchi puntati e numerati, allineamento, altezza e larghezza del riquadro, con l'anteprima.
// La formattazione si scrive nel testo con segni semplici (vedi model/textRich.ts).
import { useEffect, useRef, useState } from 'react';
import type { TextItem } from '../model/types';
import { textBounds } from '../model/textFlow';
import { RichText } from './PageSvg';
import { tx } from '../i18n/ui';
import { K } from './keys';

export type RichValue = Pick<TextItem, 'text' | 'size' | 'w' | 'align'>;

let show: ((v: RichValue, resolve: (r: RichValue | null) => void) => void) | null = null;

/** Apre l'editor con il testo indicato; null se si annulla */
export function editRichText(v: RichValue): Promise<RichValue | null> {
  return new Promise(resolve => { if (show) show(v, resolve); else resolve(null); });
}

/** Righe toccate dalla selezione del campo: inizio della prima e fine dell'ultima */
function selectedLines(text: string, a: number, b: number) {
  const start = text.lastIndexOf('\n', a - 1) + 1;
  const e = text.indexOf('\n', b);
  return { start, end: e < 0 ? text.length : e };
}

export function RichTextHost() {
  const [state, setState] = useState<{ v: RichValue; resolve: (r: RichValue | null) => void } | null>(null);
  const [v, setV] = useState<RichValue>({ text: '', size: 3 });
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    show = (init, resolve) => { setV(init); setState({ v: init, resolve }); };
    return () => { show = null; };
  }, []);
  useEffect(() => { if (state) setTimeout(() => ta.current?.focus(), 0); }, [state]);
  if (!state) return null;
  const close = (r: RichValue | null) => { state.resolve(r); setState(null); };

  /** Cambia il testo e rimette la selezione */
  const replace = (text: string, s0: number, s1: number) => {
    setV(x => ({ ...x, text }));
    setTimeout(() => { const el = ta.current; if (el) { el.focus(); el.setSelectionRange(s0, s1); } }, 0);
  };
  /** Mette (o toglie) i segni attorno alla selezione */
  const wrap = (mark: string) => {
    const el = ta.current; if (!el) return;
    const { selectionStart: a, selectionEnd: b, value } = el;
    const before = value.slice(a - mark.length, a), after = value.slice(b, b + mark.length);
    if (before === mark && after === mark) replace(value.slice(0, a - mark.length) + value.slice(a, b) + value.slice(b + mark.length), a - mark.length, b - mark.length);
    else replace(value.slice(0, a) + mark + value.slice(a, b) + mark + value.slice(b), a + mark.length, b + mark.length);
  };
  /** Elenco puntato o numerato sulle righe selezionate (di nuovo = tolto) */
  const list = (kind: 'bullet' | 'number') => {
    const el = ta.current; if (!el) return;
    const { start, end } = selectedLines(el.value, el.selectionStart, el.selectionEnd);
    const lines = el.value.slice(start, end).split('\n');
    const re = kind === 'bullet' ? /^\s*[-•]\s+/ : /^\s*\d+[.)]\s+/;
    const all = lines.every(l => re.test(l));
    const out = lines.map((l, k) => {
      const bare = l.replace(/^\s*([-•]|\d+[.)])\s+/, '');
      return all ? bare : kind === 'bullet' ? `- ${bare}` : `${k + 1}. ${bare}`;
    }).join('\n');
    replace(el.value.slice(0, start) + out + el.value.slice(end), start, start + out.length);
  };
  const onKey = (e: React.KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); wrap('**'); }
    else if (mod && e.key.toLowerCase() === 'i') { e.preventDefault(); wrap('*'); }
    else if (mod && e.key.toLowerCase() === 'u') { e.preventDefault(); wrap('__'); }
    else if (mod && e.key === 'Enter') { e.preventDefault(); close(v); }
    else if (e.key === 'Escape') { e.preventDefault(); close(null); }
  };
  // Anteprima a grandezza leggibile
  const prev: TextItem = { kind: 'text', id: 'anteprima', x: 2, y: v.size + 2, ...v };
  const b = textBounds(prev);
  const vb = { w: Math.max(40, b.x1 + 4), h: Math.max(10, b.y1 + 3) };
  const btn = (label: React.ReactNode, title: string, f: () => void) => (
    <button type="button" title={title} onMouseDown={e => e.preventDefault()} onClick={f}>{label}</button>
  );
  return (
    <div className="modal-back" onMouseDown={() => close(null)}>
      <div className="modal wide rich-editor" onMouseDown={e => e.stopPropagation()} role="dialog" aria-label={tx('Testo')}>
        <h3>{tx('Testo')}</h3>
        <div className="rich-toolbar">
          {btn(<b>{tx('G##grassetto')}</b>, tx('Grassetto ({0})', K('B')), () => wrap('**'))}
          {btn(<i>{tx('C##corsivo')}</i>, tx('Corsivo ({0})', K('I')), () => wrap('*'))}
          {btn(<u>{tx('S##sottolineato')}</u>, tx('Sottolineato ({0})', K('U')), () => wrap('__'))}
          <span className="sep" />
          {btn('•', tx('Elenco puntato'), () => list('bullet'))}
          {btn('1.', tx('Elenco numerato'), () => list('number'))}
          <span className="sep" />
          {(['start', 'middle', 'end'] as const).map(a => (
            <button key={a} type="button" className={(v.align ?? 'start') === a ? 'active' : ''} onClick={() => setV(x => ({ ...x, align: a === 'start' ? undefined : a }))}
              title={a === 'start' ? tx('a sinistra') : a === 'middle' ? tx('al centro') : tx('a destra')}>{a === 'start' ? '⇤' : a === 'middle' ? '⇔' : '⇥'}</button>
          ))}
          <span className="sep" />
          <label>{tx('Altezza (mm)')} <input type="number" step={0.1} min={0.5} value={v.size} onChange={e => setV(x => ({ ...x, size: parseFloat(e.target.value) || x.size }))} /></label>
          <label>{tx('Larghezza riquadro (mm)')} <input type="number" step={1} min={0} value={v.w ?? ''} placeholder={tx('una riga')}
            onChange={e => { const n = parseFloat(e.target.value); setV(x => ({ ...x, w: n > 0 ? n : undefined })); }} /></label>
        </div>
        <textarea ref={ta} className="rich-text" value={v.text} spellCheck onKeyDown={onKey} onChange={e => setV(x => ({ ...x, text: e.target.value }))} />
        <div className="small muted">{tx('Invio va a capo. **grassetto**, *corsivo*, __sottolineato__; righe che iniziano con «- » o «1. » sono elenchi. {0} conferma.', K('Invio'))}</div>
        <div className="rich-preview">
          <svg viewBox={`0 0 ${vb.w} ${vb.h}`} style={{ width: '100%', height: Math.min(260, vb.h * 6) }}>
            {v.w && <rect x={2} y={1} width={v.w} height={b.y1 - b.y0 + 1.5} fill="none" stroke="var(--border)" strokeWidth={0.2} strokeDasharray="1 0.6" />}
            <RichText t={prev} fill="var(--text)" />
          </svg>
        </div>
        <div className="modal-actions">
          <button onClick={() => close(null)}>{tx('Annulla')}</button>
          <button className="primary" onClick={() => close(v)}>{tx('OK')}</button>
        </div>
      </div>
    </div>
  );
}
