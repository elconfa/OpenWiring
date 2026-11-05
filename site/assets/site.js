// OpenWiring · pagina iniziale: lingua EN/IT, sistema del visitatore, ultima release e novità da GitHub
(() => {
  const REPO = 'elconfa/OpenWiring';
  const IT = {
    'nav.features': 'Funzioni', 'nav.download': 'Download', 'nav.manual': 'Manuale', 'nav.news': 'Novità', 'nav.community': 'Comunità',
    'hero.eyebrow': 'Prima versione pubblica · open source con licenza GPL-3.0',
    'hero.t1': 'Il CAD elettrico che', 'hero.t2': 'capisce i tuoi collegamenti.',
    'hero.lead': 'Disegni dispositivi collegati, non linee. OpenWiring ricava riferimenti incrociati, numeri filo, morsettiere, cavi, indirizzi PLC e di rete, e li trasforma nella documentazione completa del quadro.',
    'hero.download': 'Scarica', 'hero.manual': 'Leggi il manuale', 'hero.m2': '6 lingue', 'hero.m3': 'Nessun account, nessun cloud', 'hero.m4': 'Gratis, per sempre',
    'formats.title': 'Lavora con gli strumenti che usi già',
    'how.kicker': 'Come funziona', 'how.title': 'Un solo modello. Tutti i documenti.',
    'how.sub': 'Lo schema è una rete di dispositivi e conduttori reali. Tutto il resto si ricava da lì e resta allineato.',
    'how.s1': 'Disegna', 'how.h1': 'Metti dispositivi e fili', 'how.p1': 'I simboli si agganciano alla griglia, i fili si spezzano sui punti di collegamento, le sigle seguono la IEC 81346.',
    'how.s2': 'Ricava', 'how.h2': 'Ai conti pensa OpenWiring', 'how.p2': 'Riferimenti incrociati, immagini dei contatti, numeri filo, potenziali e indirizzi PLC si calcolano mentre disegni.',
    'how.s3': 'Consegna', 'how.h3': 'Documentazione completa', 'how.p3': "Schemi verificati, morsettiere e cavi, liste, etichette e variabili PLC, pronti per l'officina.",
    'feat.kicker': 'Funzioni', 'feat.title': 'Fatto per chi disegna quadri elettrici ogni giorno.',
    'f1.h': 'Schemi con riferimenti incrociati automatici', 'f1.p': 'Pagine A3 con cornice e cartiglio, libreria di simboli IEC 60617 e fili che si comportano come conduttori.',
    'f1.l1': 'Bobina e contatti collegati dalla sigla, con immagine dei contatti', 'f1.l2': 'Rimandi che si accoppiano per nome, partenze a stella',
    'f1.l3': 'Numeri filo con schema: <code>{pagina}.{n:2}</code>, per quadro, numeri di riserva', 'f1.l4': 'Schemi in due lingue insieme, da un dizionario',
    'f2.h': 'Morsettiere, cavi e connettori', 'f2.p': 'I morsetti si leggono dallo schema, si ordinano e si documentano senza riscrivere nulla.',
    'f2.l1': 'Morsetti a più piani, ponticelli, riserve e accessori', 'f2.l2': 'Cavi con conduttori, colori e schermi; liste dei cavi', 'f2.l3': 'Pagine automatiche delle morsettiere e dei cavi',
    'f3.h': 'PLC e reti industriali', 'f3.p': 'Schede, stazioni e punti I/O sullo schema, con gli indirizzi nel formato del tuo PLC.',
    'f3.l2': 'Tabelle delle variabili per TIA Portal, GVL e PLCopen XML per CODESYS e TwinCAT', 'f3.l3': 'Schemi Profinet, EtherCAT e Modbus; tabella degli IP e dei nomi Profinet',
    'f4.h': 'Layout del quadro e cablaggio', 'f4.p': "Disponi sulla piastra i dispositivi dello schema e ottieni i dati che servono all'officina.",
    'f4.l1': 'Guide DIN e canaline con grado di riempimento', 'f4.l2': 'Disposizione automatica, piano di foratura, lunghezze dei fili stimate', 'f4.l3': 'Sequenza di cablaggio ed etichette per le stampanti più diffuse',
    'f5.h': 'Un assistente IA che modifica il progetto', 'f5.p': 'Chiedi a parole: aggiungi una partenza motore, rinumera una pagina, spiega un controllo. Usi la tua chiave Claude, ChatGPT o Gemini; per il resto nulla esce dal tuo computer.',
    'f5.l1': "Ogni modifica si annulla come tutte le altre", 'f5.l2': 'Un formato testo del progetto pensato per gli agenti IA', 'f5.l3': 'Riga di comando per esportazioni e controlli in serie',
    'more.kicker': 'E molto altro', 'more.title': 'Tutto quello che serve a un progetto vero.',
    'g1.h': 'Liste e report', 'g1.p': 'Distinta, lista di acquisto, dispositivi, fili, morsetti, cavi e PLC come pagine o in Excel.',
    'g2.h': 'Controlli del progetto', 'g2.p': "Contatti aperti, sigle doppie, piedini scollegati, articoli mancanti: trovati prima che li trovi l'officina.",
    'g3.h': 'Articoli dei costruttori', 'g3.p': 'Importa i dati articolo da pacchetti EDZ, XML e CSV in una libreria SQLite locale.',
    'g4.h': 'Revisioni', 'g4.p': 'Archivia una revisione, confronta due versioni del progetto e segna le pagine cambiate.',
    'g5.h': 'Macro e cartigli', 'g5.p': 'Circuiti riutilizzabili, editor dei componenti, cartigli personalizzati e modelli di pagina.',
    'g6.h': 'Sei lingue', 'g6.p': 'Interfaccia e manuale in italiano, inglese, francese, tedesco, spagnolo e russo.',
    'dl.title': 'Scarica OpenWiring', 'dl.sub': 'Gratis per qualsiasi uso, anche commerciale. I progetti sono file sul tuo computer.',
    'dl.rec': 'Consigliato', 'dl.go': 'Scarica →',
    'dl.note': "Le app non sono ancora firmate digitalmente: al primo avvio macOS chiede conferma in Impostazioni di sistema ▸ Privacy e sicurezza, Windows in «Ulteriori informazioni ▸ Esegui comunque».",
    'dl.how': 'Come installare', 'dl.all': 'Tutte le versioni',
    'news.kicker': 'Novità', 'news.title': 'Ultime versioni',
    'news.fallback': 'Prima versione pubblica: nome nuovo, licenza GPL-3.0, rimandi che si accoppiano per nome, tabella degli indirizzi di rete, formati degli indirizzi PLC per stazione.',
    'com.kicker': 'Comunità', 'com.title': 'Sviluppato alla luce del sole, con chi lo usa.', 'com.sub': 'OpenWiring è giovane. I progetti veri e i riscontri sinceri decidono cosa viene dopo.',
    'com.c1': 'Segnala un errore', 'com.p1': 'Qualcosa non va? Un breve modulo chiede ciò che serve per riprodurlo.', 'com.g1': 'Apri una segnalazione →',
    'com.c2': 'Chiedi e condividi', 'com.p2': 'Domande, idee ed esempi dai tuoi quadri nelle Discussions.', 'com.g2': 'Partecipa →',
    'com.c3': 'Traduci', 'com.p3': "Migliora una traduzione dell'interfaccia o del manuale, o aggiungi una lingua.", 'com.g3': 'Proponi una correzione →',
    'com.c4': 'Contribuisci al codice', 'com.p4': 'Electron, React e TypeScript con più di 600 test. Le pull request sono benvenute.', 'com.g4': 'Guarda il codice →',
    'final.title': 'Il tuo prossimo quadro, documentato come si deve.', 'final.sub': "Apri il progetto d'esempio e guarda i riferimenti incrociati comporsi da soli.",
    'final.cta': 'Scarica OpenWiring', 'final.tut': 'Esercizio di 30 minuti',
    'foot.keys': 'Scorciatoie', 'foot.tm': 'I nomi di prodotti e aziende sono marchi dei rispettivi proprietari e sono citati solo per descrivere i formati compatibili.',
  };
  const EN = {};
  document.querySelectorAll('[data-i18n]').forEach(el => { EN[el.dataset.i18n] = el.innerHTML; });

  let lang = 'en';
  try { lang = localStorage.getItem('ow.lang') || ((navigator.language || '').startsWith('it') ? 'it' : 'en'); } catch { /* preferenza non disponibile */ }
  function setLang(l) {
    lang = l;
    document.documentElement.lang = l;
    document.querySelectorAll('[data-i18n]').forEach(el => { const k = el.dataset.i18n; el.innerHTML = (l === 'it' && IT[k]) || EN[k]; });
    document.querySelectorAll('.lang-switch button').forEach(b => b.classList.toggle('on', b.dataset.lang === l));
    document.querySelectorAll('a[href^="manual/"]').forEach(a => { a.href = a.getAttribute('href').replace(/^manual\/(en|it)?\/?/, `manual/${l}/`).replace(/\/$/, '/index.html'); });
    try { localStorage.setItem('ow.lang', l); } catch { /* solo comodità */ }
    osLabel();
  }
  document.querySelectorAll('.lang-switch button').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));

  // Sistema del visitatore: pulsante principale e scheda consigliata
  const ua = navigator.userAgent;
  let os = /Windows/.test(ua) ? 'win' : /Mac/.test(ua) ? 'mac-arm' : null;
  const card = () => os && document.querySelector(`.dl-card[data-os="${os}"]`);
  function osLabel() {
    const name = { win: 'Windows', 'mac-arm': 'macOS', 'mac-intel': 'macOS Intel' }[os];
    document.getElementById('cta-os').textContent = name ? (lang === 'it' ? `per ${name}` : `for ${name}`) : '';
  }
  // Mac Intel o Apple Silicon: lo dice la scheda grafica (Safari non lo dice mai)
  if (os === 'mac-arm') {
    try {
      const gl = document.createElement('canvas').getContext('webgl');
      const r = gl && gl.getExtension('WEBGL_debug_renderer_info') && gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
      if (r && /Intel/i.test(r)) os = 'mac-intel';
    } catch { /* resta Apple Silicon */ }
  }
  card()?.classList.add('rec');

  // Ultima release: link diretti ai file e versione
  const ctaHref = () => card()?.href || '#download';
  fetch(`https://api.github.com/repos/${REPO}/releases?per_page=6`).then(r => r.ok ? r.json() : Promise.reject()).then(list => {
    const rel = list.find(r => !r.draft && !r.prerelease) || list[0];
    if (rel) {
      const v = rel.tag_name.replace(/^v/, '');
      document.getElementById('dl-ver').textContent = v;
      document.querySelectorAll('.dl-card').forEach(c => {
        const f = c.querySelector('.file'), end = f.dataset.file.replace(/^[\d.]+\.dmg$/, `${v}.dmg`);
        const a = rel.assets.find(x => x.name.endsWith(end) && (end !== `${v}.dmg` || !x.name.includes('arm64')));
        if (a) { c.href = a.browser_download_url; f.textContent = `${a.name} · ${(a.size / 1048576).toFixed(0)} MB`; }
      });
      document.getElementById('cta-dl').href = ctaHref();
    }
    // Novità: le ultime versioni pubblicate
    const items = list.filter(r => !r.draft).slice(0, 4).map(r => {
      const first = (r.body || '').split('\n').map(s => s.trim()).find(s => s && !/^[#|>-]/.test(s)) || '';
      const text = first.replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
      const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
      return `<a class="news-item" href="${r.html_url}"><time>${(r.published_at || '').slice(0, 10)}</time><div><h4>${esc(r.name || r.tag_name)}</h4><p>${esc(text.slice(0, 220))}</p></div><span class="tag">${r.prerelease ? 'beta' : 'release'}</span></a>`;
    });
    if (items.length) document.getElementById('news-list').innerHTML = items.join('');
  }).catch(() => { document.getElementById('cta-dl').href = ctaHref(); });
  fetch(`https://api.github.com/repos/${REPO}`).then(r => r.ok ? r.json() : Promise.reject()).then(d => {
    document.getElementById('stars').textContent = `★ ${d.stargazers_count}`;
  }).catch(() => {});

  // Barra in alto e comparsa delle sezioni
  const nav = document.getElementById('nav');
  addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 8), { passive: true });
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
  document.querySelectorAll('.reveal, .shot-hero').forEach(el => io.observe(el));

  setLang(lang);
})();
