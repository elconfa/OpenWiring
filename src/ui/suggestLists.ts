// Elenchi suggeriti dei campi (<input list="…"> con il suo <datalist>): al posto del menu del sistema,
// che resta bianco anche con il tema scuro e non mostra la barra di scorrimento, un elenco dell'app con
// i colori del tema. Vale per tutti i campi con un datalist, anche quelli aggiunti in futuro, e per le
// finestre dei pannelli staccati (installato su ogni documento).
//
// Il campo perde l'attributo list mentre è attivo (così il sistema non apre il suo menu) e lo ritrova
// uscendo; la scelta scrive il valore come se fosse stato digitato (evento input, che React riceve).

const MAX_ITEMS = 300;

interface Opt { value: string; label: string }

export function installSuggestLists(doc: Document) {
  const win = doc.defaultView!;
  let input: HTMLInputElement | null = null;
  let listId = '';
  let box: HTMLDivElement | null = null;
  let opts: Opt[] = [];
  let shown: Opt[] = [];
  let hi = -1;
  let typed = false;

  const options = (): Opt[] => {
    const dl = doc.getElementById(listId);
    if (!dl) return [];
    return [...dl.querySelectorAll('option')].map(o => ({ value: o.value, label: o.textContent && o.textContent !== o.value ? o.textContent : '' }))
      .filter(o => o.value !== '');
  };

  const place = () => {
    if (!input || !box) return;
    const r = input.getBoundingClientRect(), H = win.innerHeight;
    const below = H - r.bottom - 8, above = r.top - 8;
    const up = below < 160 && above > below;
    box.style.left = `${Math.max(4, Math.min(r.left, win.innerWidth - box.offsetWidth - 4))}px`;
    box.style.minWidth = `${Math.max(160, r.width)}px`;
    box.style.maxHeight = `${Math.min(320, up ? above : below)}px`;
    box.style.top = `${up ? r.top - 2 : r.bottom + 2}px`;
    box.style.transform = up ? 'translateY(-100%)' : '';
  };

  const render = () => {
    if (!input) return;
    const q = typed ? input.value.trim().toLowerCase() : '';
    shown = (q ? opts.filter(o => o.value.toLowerCase().includes(q) || o.label.toLowerCase().includes(q)) : opts).slice(0, MAX_ITEMS);
    // Una sola voce uguale a quanto scritto: niente da suggerire
    if (!shown.length || (shown.length === 1 && shown[0].value === input.value && typed)) { hide(); return; }
    if (!box) {
      box = doc.createElement('div');
      box.className = 'suggest-list';
      box.setAttribute('role', 'listbox');
      box.addEventListener('mousedown', e => e.preventDefault());
      box.addEventListener('click', e => {
        const el = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
        if (el) pick(+el.dataset.i!);
      });
      box.addEventListener('mousemove', e => {
        const el = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
        if (el && +el.dataset.i! !== hi) { hi = +el.dataset.i!; mark(false); }
      });
      doc.body.appendChild(box);
    }
    box.replaceChildren(...shown.map((o, i) => {
      const row = doc.createElement('div');
      row.className = 'suggest-item';
      row.dataset.i = String(i);
      row.setAttribute('role', 'option');
      const v = doc.createElement('span');
      v.className = 'suggest-value';
      v.textContent = o.value;
      row.appendChild(v);
      if (o.label) {
        const l = doc.createElement('span');
        l.className = 'suggest-label';
        l.textContent = o.label;
        row.appendChild(l);
      }
      if (input && o.value === input.value) row.classList.add('cur');
      return row;
    }));
    if (hi >= shown.length) hi = shown.length - 1;
    place();
    mark(true);
  };

  const mark = (scroll: boolean) => {
    if (!box) return;
    box.querySelectorAll('.sel').forEach(n => n.classList.remove('sel'));
    const el = hi >= 0 ? box.children[hi] as HTMLElement | undefined : undefined;
    el?.classList.add('sel');
    if (scroll) el?.scrollIntoView({ block: 'nearest' });
  };

  const hide = () => { box?.remove(); box = null; shown = []; };

  const release = () => {
    hide();
    if (input && listId && !input.hasAttribute('list')) input.setAttribute('list', listId);
    input = null; listId = ''; typed = false; hi = -1;
  };

  // Valore scritto come se l'utente l'avesse digitato: React vede l'evento input e aggiorna il campo
  const setValue = (el: HTMLInputElement, v: string) => {
    const set = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')?.set;
    if (set) set.call(el, v); else el.value = v;
    el.dispatchEvent(new win.Event('input', { bubbles: true }));
    el.dispatchEvent(new win.Event('change', { bubbles: true }));
  };

  const pick = (i: number) => {
    const o = shown[i];
    if (!o || !input) return;
    setValue(input, o.value);
    typed = false;
    hide();
  };

  const open = (el: HTMLInputElement) => {
    if (input !== el) { release(); input = el; listId = el.getAttribute('list') ?? ''; }
    if (!listId) return;
    el.removeAttribute('list');
    opts = options();
    hi = opts.findIndex(o => o.value === el.value);
    render();
  };

  const target = (e: Event) => {
    const el = e.target as HTMLElement | null;
    return el instanceof win.HTMLInputElement ? el : null;
  };

  doc.addEventListener('focusin', e => { const el = target(e); if (el?.hasAttribute('list') && !el.readOnly && !el.disabled) open(el); }, true);
  doc.addEventListener('mousedown', e => {
    const el = target(e);
    if (el && (el === input || el.hasAttribute('list'))) { if (el === input && !box) open(el); return; }
    if (box && box.contains(e.target as Node)) return;
    hide();
  }, true);
  doc.addEventListener('focusout', e => { if (target(e) === input) release(); }, true);
  doc.addEventListener('input', e => {
    if (target(e) !== input || !e.isTrusted) return;
    typed = true; hi = 0; opts = options(); render();
  }, true);
  doc.addEventListener('keydown', e => {
    if (target(e) !== input || !input) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!box) { open(input); e.preventDefault(); return; }
      e.preventDefault();
      hi = e.key === 'ArrowDown' ? Math.min(shown.length - 1, hi + 1) : Math.max(0, hi - 1);
      mark(true);
    } else if (e.key === 'Enter' && box && hi >= 0 && shown[hi] && shown[hi].value !== input.value) {
      // Prima scelta con Invio: si scrive la voce; un secondo Invio conferma il campo come sempre
      e.preventDefault(); e.stopPropagation();
      pick(hi);
    } else if (e.key === 'Escape' && box) {
      e.preventDefault(); e.stopPropagation();
      hide();
    }
  }, true);
  win.addEventListener('resize', () => place());
  doc.addEventListener('scroll', e => { if (box && !box.contains(e.target as Node)) place(); }, true);
}
