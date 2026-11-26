// @vitest-environment happy-dom
// Finestra «Inserisci gruppo PLC»: si apre, propone una scheda nuova o quella scelta, OK posa il gruppo
import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useStore } from '../src/model/store';
import { emptyProject } from '../src/model/project';
import { PlcInsertHost } from '../src/ui/PlcInsertDialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('finestra inserisci gruppo PLC', () => {
  it('gruppo e prese: campi, riassunto e OK', async () => {
    const p = emptyProject(); p.plc.cards = [];
    useStore.getState().loadProject(p);
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => { root.render(<PlcInsertHost />); });
    expect(div.innerHTML).toBe('');
    await act(async () => { useStore.getState().setTool({ kind: 'place', symbolId: 'plc_grp_di2', rot: 0 }); });
    expect(div.textContent).toContain('Inserisci gruppo PLC');
    expect(div.textContent).toContain('Scheda nuova…');
    expect(div.textContent).toContain('Canali DI0…DI7');
    // Morsetti per canale: 2 (dal simbolo scelto)
    expect((div.querySelectorAll('select')[3] as HTMLSelectElement).value).toBe('2');
    await act(async () => { (div.querySelector('button[type=submit]') as HTMLButtonElement).click(); });
    expect(useStore.getState().plcInsert).toBeUndefined();
    expect(useStore.getState().tool).toMatchObject({ kind: 'place', plc: { terms: 2, count: 8 } });

    await act(async () => { useStore.getState().setTool({ kind: 'place', symbolId: 'plc_grp_m12_up', rot: 0 }); });
    expect(div.textContent).toContain('Inserisci prese M12');
    expect(div.textContent).toContain('Prese X10…X13: canali A DI0…DI3, canali B DI8…DI11');
    // Annulla: niente da posare
    await act(async () => { (div.querySelector('.modal-actions button') as HTMLButtonElement).click(); });
    expect(useStore.getState().plcInsert).toBeUndefined();
    expect(useStore.getState().tool.kind).toBe('select');
    await act(async () => { root.unmount(); });
  });
});
