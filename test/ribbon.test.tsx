// @vitest-environment happy-dom
// Barra multifunzione, icone e «Cerca un comando»
import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Ribbon, ribbonTabs } from '../src/ui/Ribbon';
import { ICON_NAMES } from '../src/ui/icons';
import { score, menuEntries, fold } from '../src/ui/CommandPalette';
import { buildMenus } from '../src/ui/MenuBar';
import { useStore } from '../src/model/store';
import { exampleProject } from '../src/model/example';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('barra multifunzione', () => {
  it('ogni comando ha un\'icona esistente e un nome', () => {
    const tabs = ribbonTabs(useStore.getState());
    expect(tabs.map(t => t.id)).toEqual(['home', 'insert', 'pages', 'project', 'lists', 'revisions', 'view', 'help']);
    for (const t of tabs) for (const g of t.groups) for (const i of g.items) {
      if (!('icon' in i)) continue;
      expect(ICON_NAMES, `${t.id}/${i.label}`).toContain(i.icon);
      expect(i.label).toBeTruthy();
      expect(i.run || i.menu, i.label).toBeTruthy();
    }
  });

  it('la scheda Simbolo compare solo con un simbolo selezionato', () => {
    useStore.setState({ project: exampleProject() });
    const s = useStore.getState();
    const page = s.project.pages.find(p => p.elements.some(e => e.kind === 'symbol'));
    expect(page).toBeTruthy();
    const sym = page!.elements.find(e => e.kind === 'symbol')!;
    expect(ribbonTabs(s).some(t => t.id === 'symbol')).toBe(false);
    useStore.setState({ pageId: page!.id, view: 'schema', selection: [sym.id] });
    const tab = ribbonTabs(useStore.getState()).find(t => t.id === 'symbol');
    expect(tab?.ctx).toBeTruthy();
    useStore.setState({ selection: [] });
  });

  it('si disegna in forma completa, compatta e ridotta', async () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => { root.render(<Ribbon />); });
    expect(div.querySelectorAll('.rb-tab').length).toBeGreaterThanOrEqual(8);
    expect(div.querySelector('.rb-body')).toBeTruthy();
    await act(async () => { useStore.getState().setUiStyle('compact'); });
    expect(div.querySelector('.ribbon.compact')).toBeTruthy();
    expect(div.querySelector('.rb-glabel')).toBeNull();
    await act(async () => { useStore.getState().setRibbonCollapsed(true); });
    expect(div.querySelector('.rb-body')).toBeNull();
    await act(async () => { useStore.getState().setRibbonCollapsed(false); useStore.getState().setUiStyle('ribbon'); });
    root.unmount();
  });
});

describe('cerca un comando', () => {
  it('il punteggio preferisce l\'inizio del nome e richiede tutte le parole', () => {
    expect(score('Rinumera fili…', 'Progetto', 'rinum')).toBeGreaterThan(score('Allinea numeri filo', 'Modifica', 'num'));
    expect(score('Rinumera fili…', 'Progetto', 'rinumera fili')).toBeGreaterThan(0);
    expect(score('Rinumera fili…', 'Progetto', 'rinumera cavi')).toBe(0);
    expect(score('Proprietà del progetto', 'Progetto', 'proprieta')).toBeGreaterThan(0);
    expect(fold('Proprietà')).toBe('proprieta');
  });

  it('trova i comandi di tutti i menu, senza quelli disattivati', () => {
    const entries = menuEntries(buildMenus(useStore.getState()));
    const labels = entries.map(e => e.label);
    expect(labels).toContain('Rinumera fili…');
    expect(labels).toContain('Salva');
    // Senza selezione «Ruota» è disattivato
    expect(labels).not.toContain('Ruota');
    expect(entries.find(e => e.label === 'Salva')?.where).toBe('File');
  });
});

describe('barra di stato, strumenti sul disegno, schermate vuote (punto 92, parti 4–6)', () => {
  const mount = async (el: React.ReactElement) => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => { root.render(el); });
    return { div, root };
  };

  it('la schermata vuota prende il titolo dalla prima frase', async () => {
    const { EmptyState } = await import('../src/ui/EmptyState');
    const { div, root } = await mount(<EmptyState icon="cable" text="Nessun cavo. Disegna una linea di cavo." action="Disegna" onAction={() => {}} />);
    expect(div.querySelector('b')?.textContent).toBe('Nessun cavo');
    expect(div.querySelector('p')?.textContent).toBe('Disegna una linea di cavo.');
    expect(div.querySelector('button')?.textContent).toBe('Disegna');
    root.unmount();
  });

  it('griglia, aggancio e zoom nella barra di stato', async () => {
    const { SnapToggles, ZoomControl } = await import('../src/ui/StatusBar');
    useStore.setState({ zoom: 100 });
    const { div, root } = await mount(<><SnapToggles /><ZoomControl /></>);
    const [grid, snap] = [...div.querySelectorAll('.sb-toggles button')] as HTMLButtonElement[];
    await act(async () => { grid.click(); snap.click(); });
    expect(useStore.getState().gridMode).toBe('off');
    expect(useStore.getState().objectSnap).toBe(false);
    let asked = 0;
    window.addEventListener('elettrocad:setZoom', e => { asked = (e as CustomEvent<number>).detail; });
    await act(async () => { ([...div.querySelectorAll('.sb-zoom button')].find(b => b.textContent === '+') as HTMLButtonElement).click(); });
    expect(asked).toBe(125);
    await act(async () => { useStore.getState().setGridMode('auto'); useStore.getState().setObjectSnap(true); });
    root.unmount();
  });

  // (gli ultimi simboli stanno nella memoria del browser, che nei test non c'è: provati a mano)
  it('la barra sul disegno ha gli strumenti e il pulsante del simbolo', async () => {
    const { ActiveBar } = await import('../src/ui/ActiveBar');
    const { div, root } = await mount(<ActiveBar />);
    expect(div.querySelectorAll('.ab-btn').length).toBeGreaterThan(8);
    expect(div.querySelector('.ab-split [data-tip], .ab-split button')).toBeTruthy();
    root.unmount();
  });
});

describe('miniature e menu a raggiera (punto 92, parti 7–8)', () => {
  it('il menu a raggiera ha otto comandi, diversi con e senza selezione', async () => {
    const { radialItems } = await import('../src/ui/RadialMenu');
    const { derive } = await import('../src/model/derive');
    useStore.setState({ project: exampleProject(), selection: [] });
    const s = useStore.getState();
    useStore.setState({ pageId: s.project.pages[0].id });
    const d = derive(useStore.getState().project);
    const empty = radialItems(d, { x: 0, y: 0 });
    expect(empty).toHaveLength(8);
    expect(empty.map(i => i.label)).toContain('Filo');
    const sym = useStore.getState().project.pages[0].elements.find(e => e.kind === 'symbol')!;
    useStore.setState({ selection: [sym.id] });
    const sel = radialItems(d, { x: 0, y: 0 });
    expect(sel).toHaveLength(8);
    expect(sel.map(i => i.label)).toContain('Ruota');
    for (const i of [...empty, ...sel]) expect(ICON_NAMES).toContain(i.icon);
    useStore.setState({ selection: [] });
  });

  it('la striscia mostra una miniatura per pagina', async () => {
    const { PageStrip } = await import('../src/ui/PageStrip');
    const { derive } = await import('../src/model/derive');
    useStore.setState({ project: exampleProject() });
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => { root.render(<PageStrip derived={derive(useStore.getState().project)} />); });
    expect(div.querySelectorAll('.ps-item')).toHaveLength(useStore.getState().project.pages.length);
    root.unmount();
  });
});
