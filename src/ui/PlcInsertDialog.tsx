// Finestra «Inserisci gruppo PLC»: si apre prima di posare un gruppo I/O o un gruppo di prese M12
// (dalla libreria dei simboli, trascinandolo sul foglio o dalla vista PLC con la scheda già scelta).
// Scheda del progetto o nuova (sigla, tipo, stazione, rack, slot), canali e, per le prese, nome della
// prima presa, canale A e canale B, numeri dei pin e sigle dei comuni. OK: il gruppo si posa.
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../model/store';
import { cardType, newCard, PLC_CARD_TYPES, stationNames } from '../model/plc';
import { cardsFor, cardTypesFor, plcInsertDefaults, plcInsertProblems, proposeChannels, proposeNewCard, type PlcInsertCfg } from '../model/plcInsert';
import { socketName } from '../model/plcSocket';
import { tx } from '../i18n/ui';

export function PlcInsertHost() {
  const req = useStore(s => s.plcInsert);
  if (!req) return null;
  return <PlcInsertDialog key={`${req.symbolId}|${req.tag ?? ''}|${req.at?.x ?? ''}`} />;
}

function PlcInsertDialog() {
  const req = useStore(s => s.plcInsert)!;
  const project = useStore(s => s.project);
  const pageId = useStore(s => s.pageId);
  const page = project.pages.find(p => p.id === pageId);
  const finish = useStore(s => s.finishPlcInsert);
  const [cfg, setCfg] = useState<PlcInsertCfg | undefined>(() => plcInsertDefaults(project, req.symbolId, page, req.at?.x ?? 0, req.tag));
  useEffect(() => { if (!cfg) finish(null); }, [cfg, finish]);
  const problems = useMemo(() => (cfg ? plcInsertProblems(project, cfg) : []), [project, cfg]);
  if (!cfg) return null;
  const sock = cfg.socket;
  const cards = cardsFor(project, cfg.io);
  const types = cardTypesFor(cfg.io);
  const stations = stationNames(project);
  // Canali della scheda scelta (o del tipo della scheda nuova)
  const max = (cfg.newCard ? PLC_CARD_TYPES.find(t => t.id === cfg.newCard!.typeId)?.channels[cfg.io] : cards.find(c => c.tag === cfg.tag) && cardType(cards.find(c => c.tag === cfg.tag)!).channels[cfg.io]) ?? 0;
  const set = (patch: Partial<PlcInsertCfg>) => setCfg(c => ({ ...c!, ...patch }));
  const setSock = (patch: Partial<NonNullable<PlcInsertCfg['socket']>>) => setCfg(c => ({ ...c!, socket: { ...c!.socket!, ...patch } }));
  // Scheda cambiata: canali proposti di nuovo
  const reChannels = (next: PlcInsertCfg) => {
    const card = next.newCard ? newCard(project, next.newCard.typeId, next.newCard.tag || 'X') : project.plc.cards.find(c => c.tag === next.tag);
    if (!card) return next;
    const ch = proposeChannels(project, card, next, !!next.newCard);
    return { ...next, first: ch.first, ...(next.socket ? { socket: { ...next.socket, second: ch.second ?? ch.first + 8 } } : { count: Math.max(1, Math.min(next.count, (cardType(card).channels[next.io] ?? 0) - ch.first)) }) };
  };
  const pickCard = (v: string) => setCfg(c => reChannels(v === '' ? { ...c!, tag: '', newCard: c!.newCard ?? proposeNewCard(project, c!.io, page, req.at?.x ?? 0) } : { ...c!, tag: v, newCard: undefined }));
  const setNew = (patch: Partial<NonNullable<PlcInsertCfg['newCard']>>) => setCfg(c => {
    const next = { ...c!, newCard: { ...c!.newCard!, ...patch } };
    return patch.typeId ? reChannels(next) : next;
  });
  const chOpts = (n: number) => Array.from({ length: n }, (_, i) => <option key={i} value={i}>{cfg.io}{i}</option>);
  const num = (v: string) => (v.trim() === '' ? undefined : Math.max(0, parseInt(v, 10) || 0));
  // Riassunto di quello che si posa
  const last = (k: number) => `${cfg.io}${k + cfg.count - 1}`;
  const summary = sock
    ? tx('Prese {0}…{1}: canali A {2}…{3}, canali B {4}…{5}', sock.name, socketName(sock.name, cfg.count - 1), `${cfg.io}${cfg.first}`, last(cfg.first), `${cfg.io}${sock.second}`, last(sock.second))
    : tx('Canali {0}…{1}', `${cfg.io}${cfg.first}`, last(cfg.first));
  const ok = () => { if (!problems.length) finish(cfg); };
  return (
    <div className="modal-back ask-back" onMouseDown={e => { if (e.target === e.currentTarget) finish(null); }}>
      <form className="modal plc-insert" onSubmit={e => { e.preventDefault(); ok(); }}
        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); finish(null); } }}>
        <h3>{sock ? tx('Inserisci prese M12') : tx('Inserisci gruppo PLC')} · {cfg.io === 'DI' ? tx('ingressi') : tx('uscite')}</h3>
        <fieldset>
          <legend>{tx('Scheda')}</legend>
          <label>{tx('Scheda')}
            <select value={cfg.newCard ? '' : cfg.tag} onChange={e => pickCard(e.target.value)} autoFocus>
              {cards.map(c => <option key={c.id} value={c.tag}>-{c.tag} · {tx(cardType(c).name)} · {c.station}{c.slot !== undefined ? ` · ${tx('slot')} ${c.slot}` : ''}</option>)}
              <option value="">{tx('Scheda nuova…')}</option>
            </select>
          </label>
          {cfg.newCard && <>
            <label>{tx('Sigla')}<input type="text" value={cfg.newCard.tag} onChange={e => setNew({ tag: e.target.value })} /></label>
            <label>{tx('Tipo')}
              <select value={cfg.newCard.typeId} onChange={e => setNew({ typeId: e.target.value })}>
                {types.map(t => <option key={t.id} value={t.id}>{tx(t.name)}</option>)}
              </select>
            </label>
            <label>{tx('Stazione')}<input type="text" list="plc-insert-stations" value={cfg.newCard.station} onChange={e => setNew({ station: e.target.value })} />
              <datalist id="plc-insert-stations">{stations.map(s => <option key={s} value={s} />)}</datalist></label>
            <label>{tx('Rack')}<input type="number" min={0} style={{ width: 70 }} value={cfg.newCard.rack ?? ''} onChange={e => setNew({ rack: num(e.target.value) })} />
              {tx('Slot')}<input type="number" min={0} style={{ width: 70 }} value={cfg.newCard.slot ?? ''} onChange={e => setNew({ slot: num(e.target.value) })} /></label>
          </>}
        </fieldset>
        {!sock && (
          <fieldset>
            <legend>{tx('Canali')}</legend>
            <label>{tx('Primo canale')}<select value={cfg.first} onChange={e => set({ first: parseInt(e.target.value, 10) })}>{chOpts(max)}</select></label>
            <label>{tx('Numero di canali')}<input type="number" min={1} max={Math.max(1, max - cfg.first)} style={{ width: 70 }} value={cfg.count} onChange={e => set({ count: Math.max(1, parseInt(e.target.value, 10) || 1) })} /></label>
            <label>{tx('Morsetti per canale')}
              <select value={cfg.terms ?? 1} onChange={e => set({ terms: e.target.value === '2' ? 2 : 1 })}>
                <option value={1}>1</option>
                <option value={2}>{tx('2 (es. schede safety, alimentazione del sensore)')}</option>
              </select>
            </label>
          </fieldset>
        )}
        {sock && <>
          <fieldset>
            <legend>{tx('Prese')}</legend>
            <label>{tx('Numero di prese')}<input type="number" min={1} max={8} style={{ width: 70 }} value={cfg.count} onChange={e => set({ count: Math.max(1, Math.min(8, parseInt(e.target.value, 10) || 1)) })} /></label>
            <label>{tx('Nome della prima presa')}<input type="text" value={sock.name} onChange={e => setSock({ name: e.target.value })} /></label>
            <label>{tx('Canale A (pin {0}) della prima presa', sock.pinNos[4] || '4')}<select value={cfg.first} onChange={e => set({ first: parseInt(e.target.value, 10) })}>{chOpts(max)}</select></label>
            <label>{tx('Canale B (pin {0}) della prima presa', sock.pinNos[2] || '2')}<select value={sock.second} onChange={e => setSock({ second: parseInt(e.target.value, 10) })}>{chOpts(max)}</select></label>
          </fieldset>
          <fieldset>
            <legend>{tx('Pin della presa')}</legend>
            <div className="plc-insert-pins">
              {([['4', tx('Canale A')], ['1', '+24 V'], ['5', 'FE'], ['3', '0 V'], ['2', tx('Canale B')]] as const).map(([id, lab]) => (
                <label key={id} className="plc-insert-pin">
                  <span>{lab}</span>
                  <input type="text" value={sock.pinNos[id] ?? id} onChange={e => setSock({ pinNos: { ...sock.pinNos, [id]: e.target.value.trim() } })} title={tx('Numero del pin sulla presa')} />
                  {id === '1' || id === '5' || id === '3'
                    ? <input type="text" value={sock.commons[id] ?? ''} onChange={e => setSock({ commons: { ...sock.commons, [id]: e.target.value } })} title={tx('Sigla del comune nello schema')} />
                    : <span />}
                </label>
              ))}
            </div>
            <span className="muted small">{tx('Prima riga: numero del pin. Seconda riga: sigla del comune nello schema.')}</span>
          </fieldset>
        </>}
        <p className="muted small">{summary}</p>
        {problems.map(p => <p key={p} className="warn small">{p}</p>)}
        <div className="modal-actions">
          <button type="button" onClick={() => finish(null)}>{tx('Annulla')}</button>
          <button type="submit" className="primary" disabled={problems.length > 0}>{req.at ? tx('Inserisci') : tx('Posa sul foglio')}</button>
        </div>
      </form>
    </div>
  );
}
