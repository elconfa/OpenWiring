// Pagina HTML del banco di prova EDZ: riepilogo, simboli della libreria EPLAN da ridisegnare e
// l'elenco degli articoli con l'anteprima del simbolo ottenuto, filtrabile per esito.
// Le anteprime si disegnano nel browser dai dati del rapporto, una pagina di articoli alla volta.
import { STATUS_LABEL, type BenchReport } from './edzBench';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function benchHtml(r: BenchReport): string {
  const total = r.items.length || 1;
  const pct = (n: number) => `${Math.round((n * 1000) / total) / 10}%`;
  const statusRows = (Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[])
    .map(k => `<tr><td><span class="st st-${k}">${k}</span></td><td>${esc(STATUS_LABEL[k])}</td><td class="n">${r.counts[k]}</td><td class="n">${pct(r.counts[k])}</td></tr>`).join('');
  const pkgRows = r.packages.map(p => `<tr><td>${esc(p.name)}</td><td class="n">${p.parts}</td><td class="n">${p.macros}</td><td class="n">${p.files}</td><td class="n">${p.warnings}</td></tr>`).join('');
  const libRow = (l: BenchReport['libraryRefs'][number]) => `<tr><td>${esc(l.lib)}</td><td class="n">${esc(l.num)}</td><td class="n">${l.refs}</td><td class="n">${l.macros}</td><td>${esc(l.variants.join(', '))}</td><td>${esc(l.pins.slice(0, 8).join(' '))}</td><td>${esc(l.category)}</td><td>${esc(l.kind ?? '—')}</td><td class="ex">${esc(l.example)}</td></tr>`;
  const libRows = r.libraryRefs.filter(l => l.lib !== 'SPECIAL').slice(0, 80).map(libRow).join('');
  const specialRows = r.libraryRefs.filter(l => l.lib === 'SPECIAL').slice(0, 40).map(libRow).join('');
  const types = Object.entries(r.variantTypes).sort((a, b) => +a[0] - +b[0]).map(([t, n]) => `${t}: ${n}`).join(' · ');
  // I dati vanno in JSON dentro la pagina: "</" non deve chiudere lo script
  const data = JSON.stringify({ items: r.items, symbols: r.symbols, labels: STATUS_LABEL }).replace(/<\//g, '<\\/');
  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Banco di prova EDZ</title>
<style>
:root{--bg:#f7f7f5;--fg:#1d1d1b;--muted:#6b6b66;--line:#d9d9d4;--card:#fff;--sym:#1d1d1b;--pin:#c2410c;
--ok:#15803d;--parziale:#b45309;--morsetto:#0e7490;--libreria:#7c3aed;--non-letta:#b91c1c;--macro-assente:#be185d;--senza-macro:#475569;--accessorio:#a8a29e}
@media (prefers-color-scheme:dark){:root{--bg:#18181b;--fg:#e7e7e4;--muted:#a1a19b;--line:#3a3a3f;--card:#222226;--sym:#e7e7e4;--pin:#fb923c}}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1280px;margin:0 auto;padding:16px}
h1{font-size:22px;margin:8px 0 4px}h2{font-size:17px;margin:28px 0 8px}
.muted{color:var(--muted)}
table{border-collapse:collapse;width:100%;background:var(--card)}
th,td{border-bottom:1px solid var(--line);padding:5px 8px;text-align:left;vertical-align:top}
th{font-weight:600;font-size:12px;color:var(--muted)}
td.n{text-align:right;font-variant-numeric:tabular-nums}td.ex{font-size:12px;color:var(--muted);word-break:break-all}
.wrap{overflow-x:auto}
.st{display:inline-block;padding:1px 7px;border-radius:9px;color:#fff;font-size:12px;white-space:nowrap}
${Object.keys(STATUS_LABEL).map(k => `.st-${k}{background:var(--${k})}`).join('')}
.bar{display:flex;height:14px;border-radius:7px;overflow:hidden;margin:10px 0}
.bar span{display:block;height:100%}
.filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0 12px}
.filters input,.filters select{font:inherit;padding:5px 8px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--fg)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}
.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:4px;min-width:0}
.card svg{width:100%;height:170px;background:var(--bg);border-radius:4px}
.card .pn{font-weight:600;word-break:break-all}.card .d{font-size:12px;color:var(--muted);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.card .w{font-size:12px;color:var(--parziale)}.card .r{font-size:12px;color:var(--muted);word-break:break-word}
.nosym{height:170px;display:flex;align-items:center;justify-content:center;color:var(--muted);background:var(--bg);border-radius:4px;font-size:12px;text-align:center;padding:8px}
.pager{display:flex;gap:8px;align-items:center;margin:14px 0}
button{font:inherit;padding:5px 12px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--fg);cursor:pointer}
button:disabled{opacity:.4;cursor:default}
.card svg{cursor:zoom-in}details{margin-top:10px}summary{cursor:pointer;margin-bottom:6px}
#big{position:fixed;inset:0;background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center;padding:16px;z-index:9}
#big.on{display:flex}#big>div{background:var(--card);border-radius:10px;padding:12px;width:min(1100px,100%);max-height:100%;display:flex;flex-direction:column;gap:8px}
#big svg{width:100%;height:min(78vh,900px);background:var(--bg);border-radius:6px;cursor:default}
</style></head><body><main>
<h1>Banco di prova EDZ</h1>
<p class="muted">${r.items.length} articoli da ${r.packages.length} pacchetti · ${esc(r.created.slice(0, 16).replace('T', ' '))}</p>
<div class="bar">${(Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map(k => `<span style="width:${pct(r.counts[k])};background:var(--${k})" title="${k}: ${r.counts[k]}"></span>`).join('')}</div>
<div class="wrap"><table><tr><th>Esito</th><th>Significato</th><th>Articoli</th><th>%</th></tr>${statusRows}</table></div>
<h2>Pacchetti</h2>
<div class="wrap"><table><tr><th>Pacchetto</th><th>Articoli</th><th>Macro</th><th>File</th><th>Avvisi</th></tr>${pkgRows}</table></div>
<h2>Simboli della libreria EPLAN richiamati dalle macro</h2>
<p class="muted">Non sono nei pacchetti: li ridisegniamo con un nostro equivalente scelto dalla funzione EPLAN (geometria da verificare in EPLAN). Varianti per tipo di rappresentazione (MacroFuncType): ${esc(types || '—')}</p>
<div class="wrap"><table><tr><th>Libreria</th><th>Numero</th><th>Richiami</th><th>Macro</th><th>Varianti</th><th>Morsetti (esempio)</th><th>Funzione EPLAN</th><th>Nostro equivalente</th><th>Esempio</th></tr>${libRows || '<tr><td colspan="9" class="muted">nessuno</td></tr>'}</table></div>
<details><summary class="muted">Simboli speciali di EPLAN (SPECIAL: punti di connessione, cornici, scatole nere), già interpretati in parte</summary>
<div class="wrap"><table><tr><th>Libreria</th><th>Numero</th><th>Richiami</th><th>Macro</th><th>Varianti</th><th>Morsetti (esempio)</th><th>Funzione EPLAN</th><th>Nostro equivalente</th><th>Esempio</th></tr>${specialRows || '<tr><td colspan="9" class="muted">nessuno</td></tr>'}</table></div></details>
<h2>Articoli</h2>
<div class="filters">
<select id="fs"><option value="">tutti gli esiti</option>${Object.keys(STATUS_LABEL).map(k => `<option value="${k}">${k}</option>`).join('')}<option value="!ok">tutto tranne ok</option></select>
<select id="fq"><option value="">tutti i controlli</option><option value="isolated">punti non collegati al disegno</option><option value="offGrid">punti fuori griglia</option><option value="overlapping">punti sovrapposti</option><option value="redrawn">con simboli EPLAN ridisegnati</option></select>
<select id="fp"><option value="">tutti i pacchetti</option>${r.packages.map(p => `<option>${esc(p.name)}</option>`).join('')}</select>
<input id="ft" type="search" placeholder="Cerca articolo, descrizione, macro…">
<span id="cnt" class="muted"></span></div>
<div id="grid" class="grid"></div>
<div class="pager"><button id="prev">‹ Precedenti</button><span id="pg" class="muted"></span><button id="next">Successivi ›</button></div>
</main>
<div id="big"><div><div style="display:flex;justify-content:space-between;gap:8px"><b id="bigt"></b><button id="bigx">Chiudi</button></div><div id="bigs"></div><div id="bigp" class="muted" style="font-size:12px"></div></div></div>
<script id="data" type="application/json">${data}</script>
<script>
const D=JSON.parse(document.getElementById('data').textContent);
const PER=96;let page=0,list=D.items;
const $=id=>document.getElementById(id);
const e=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
function svg(s){
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;const pt=(x,y)=>{x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y)};
  const out=[];
  for(const p of s.prims){
    const st=p.dash?' stroke-dasharray="1.5 1"':'';
    if(p.t==='line'){pt(p.x1,p.y1);pt(p.x2,p.y2);out.push('<line x1="'+p.x1+'" y1="'+p.y1+'" x2="'+p.x2+'" y2="'+p.y2+'"'+st+'/>')}
    else if(p.t==='rect'){pt(p.x,p.y);pt(p.x+p.w,p.y+p.h);out.push('<rect x="'+p.x+'" y="'+p.y+'" width="'+p.w+'" height="'+p.h+'"'+(p.fill?' class="f"':'')+'/>')}
    else if(p.t==='circle'){pt(p.cx-p.r,p.cy-p.r);pt(p.cx+p.r,p.cy+p.r);out.push('<circle cx="'+p.cx+'" cy="'+p.cy+'" r="'+p.r+'"'+(p.fill?' class="f"':'')+'/>')}
    else if(p.t==='ellipse'){pt(p.cx-p.rx,p.cy-p.ry);pt(p.cx+p.rx,p.cy+p.ry);out.push('<ellipse cx="'+p.cx+'" cy="'+p.cy+'" rx="'+p.rx+'" ry="'+p.ry+'"/>')}
    else if(p.t==='arc'){const r=p.r,a=p.a0*Math.PI/180,b=p.a1*Math.PI/180;const sx=p.cx+r*Math.cos(a),sy=p.cy+r*Math.sin(a),ex=p.cx+r*Math.cos(b),ey=p.cy+r*Math.sin(b);
      let sw=((p.a1-p.a0)%360+360)%360;pt(p.cx-r,p.cy-r);pt(p.cx+r,p.cy+r);out.push('<path d="M'+sx+' '+sy+'A'+r+' '+r+' 0 '+(sw>180?1:0)+' 1 '+ex+' '+ey+'"/>')}
    else if(p.t==='poly'&&p.pts.length){p.pts.forEach(q=>pt(q.x,q.y));out.push('<'+(p.closed?'polygon':'polyline')+' points="'+p.pts.map(q=>q.x+','+q.y).join(' ')+'"'+st+(p.fill?' class="f"':'')+'/>')}
    else if(p.t==='text'){pt(p.x,p.y);const z=p.size||2.5;out.push('<text x="'+p.x+'" y="'+p.y+'" font-size="'+z+'" text-anchor="'+(p.anchor||'start')+'"'+(p.rot?' transform="rotate('+p.rot+' '+p.x+' '+p.y+')"':'')+'>'+e(p.s)+'</text>')}
  }
  for(const q of s.pins){pt(q.x,q.y);out.push('<circle class="pin" cx="'+q.x+'" cy="'+q.y+'" r="0.7"/><text class="pl" x="'+(q.x+0.9)+'" y="'+(q.y-0.8)+'" font-size="1.8">'+e(q.label)+'</text>')}
  if(x0>x1){x0=y0=0;x1=y1=10}
  const m=3,w=x1-x0+2*m,h=y1-y0+2*m;
  return '<svg viewBox="'+(x0-m)+' '+(y0-m)+' '+w+' '+h+'" preserveAspectRatio="xMidYMid meet"><g fill="none" stroke="var(--sym)" stroke-width="0.25">'+out.join('')+'</g><style>.f{fill:var(--sym)}text{fill:var(--sym);stroke:none;font-family:system-ui}.pin{fill:var(--pin);stroke:none}.pl{fill:var(--pin)}</style></svg>';
}
function card(it){
  const s=it.symbolId&&D.symbols[it.symbolId];
  const checks=[];
  if(it.missing.length)checks.push('mancano: '+it.missing.slice(0,10).join(' ')+(it.missing.length>10?' …':''));
  if(it.isolated.length)checks.push('non collegati: '+it.isolated.slice(0,8).join(' '));
  if(it.offGrid.length)checks.push('fuori griglia: '+it.offGrid.slice(0,8).join(' '));
  if(it.overlapping.length)checks.push('sovrapposti: '+it.overlapping.slice(0,4).join(' '));
  if(it.redrawn&&it.redrawn.length)checks.push('ridisegnati: '+it.redrawn.slice(0,4).join(', '));
  return '<div class="card" data-id="'+e(it.symbolId||'')+'" data-pn="'+e(it.partNr)+'">'+(s?svg(s):'<div class="nosym">'+e(D.labels[it.status])+'</div>')+
   '<div><span class="st st-'+it.status+'">'+it.status+'</span> <span class="muted">'+it.connections+' morsetti'+(it.variants?' · '+(it.variants+1)+' varianti':'')+(it.size?' · '+it.size.w+'×'+it.size.h+' mm':'')+'</span></div>'+
   '<div class="pn">'+e(it.partNr)+'</div><div class="d" title="'+e(it.description)+'">'+e(it.description)+'</div>'+
   (checks.length?'<div class="w">'+e(checks.join(' · '))+'</div>':'')+
   (it.reason?'<div class="r">'+e(it.reason)+'</div>':'')+
   (it.macro?'<div class="r">'+e(it.macro.split(/[\\\\/]/).pop())+'</div>':'')+'</div>';
}
function apply(){
  const s=$('fs').value,q=$('fq').value,p=$('fp').value,t=$('ft').value.trim().toLowerCase();
  list=D.items.filter(it=>(!s||(s==='!ok'?it.status!=='ok':it.status===s))&&(!q||(it[q]||[]).length)&&(!p||it.pkg===p)&&
    (!t||(it.partNr+' '+it.description+' '+(it.macro||'')+' '+(it.reason||'')).toLowerCase().includes(t)));
  page=0;render();
}
function render(){
  const n=Math.max(1,Math.ceil(list.length/PER));page=Math.min(page,n-1);
  $('grid').innerHTML=list.slice(page*PER,(page+1)*PER).map(card).join('');
  $('cnt').textContent=list.length+' articoli';$('pg').textContent='pagina '+(page+1)+' di '+n;
  $('prev').disabled=page===0;$('next').disabled=page>=n-1;
}
$('grid').onclick=ev=>{const c=ev.target.closest('.card');const s=c&&ev.target.closest('svg')&&D.symbols[c.dataset.id];if(!s)return;
  $('bigt').textContent=c.dataset.pn;$('bigs').innerHTML=svg(s);$('bigp').textContent='Morsetti: '+s.pins.map(p=>p.label).join(' ');$('big').classList.add('on')};
$('bigx').onclick=()=>$('big').classList.remove('on');$('big').onclick=ev=>{if(ev.target.id==='big')$('big').classList.remove('on')};
addEventListener('keydown',ev=>{if(ev.key==='Escape')$('big').classList.remove('on')});
['fs','fq','fp'].forEach(id=>$(id).onchange=apply);$('ft').oninput=apply;
$('prev').onclick=()=>{page--;render();scrollTo(0,$('grid').offsetTop-80)};$('next').onclick=()=>{page++;render();scrollTo(0,$('grid').offsetTop-80)};
apply();
</script></body></html>`;
}
