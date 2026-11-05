// OpenWiring · manuale: ricerca nel testo della lingua corrente e capitolo in evidenza nell'indice
(() => {
  const q = document.getElementById('q'), box = document.getElementById('results');
  let index = null, sel = -1;
  const load = () => index || (index = fetch(window.SEARCH.index).then(r => r.json()).catch(() => []));
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  function mark(text, words) {
    let out = esc(text);
    for (const w of words) out = out.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>');
    return out;
  }
  async function search() {
    const raw = q.value.trim();
    if (raw.length < 2) { box.hidden = true; return; }
    const words = norm(raw).split(/\s+/).filter(Boolean);
    const list = await load();
    const hits = [];
    for (const e of list) {
      const h = norm(e.h), t = norm(e.t);
      if (!words.every(w => h.includes(w) || t.includes(w))) continue;
      const score = words.reduce((s, w) => s + (h.includes(w) ? 10 : 0) + (t.split(w).length - 1), 0);
      hits.push({ e, score });
    }
    hits.sort((a, b) => b.score - a.score);
    sel = -1;
    box.innerHTML = hits.slice(0, 12).map(({ e }) => {
      const t = norm(e.t), i = Math.max(0, t.indexOf(words[0]) - 60);
      const snip = (i ? '…' : '') + e.t.slice(i, i + 170) + '…';
      return `<a href="${e.u}"><small>${esc(e.c)}</small><b>${mark(e.h, raw.split(/\s+/))}</b><p>${mark(snip, raw.split(/\s+/))}</p></a>`;
    }).join('') || `<div class="none">${esc(window.SEARCH.none)}</div>`;
    box.hidden = false;
  }
  q.addEventListener('input', search);
  q.addEventListener('focus', () => { load(); if (q.value.trim().length > 1) search(); });
  q.addEventListener('keydown', e => {
    const items = [...box.querySelectorAll('a')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach((a, i) => a.classList.toggle('sel', i === sel));
      items[sel]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && items.length) { location.href = (items[sel] || items[0]).href; }
    else if (e.key === 'Escape') { box.hidden = true; q.blur(); }
  });
  document.addEventListener('click', e => { if (!e.target.closest('.search')) box.hidden = true; });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement !== q && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); }
  });
  box.addEventListener('click', () => { box.hidden = true; document.body.classList.remove('nav-open'); });

  // Indice della pagina: sezione visibile in evidenza
  const links = [...document.querySelectorAll('.toc a')];
  if (links.length) {
    const heads = links.map(a => document.getElementById(decodeURIComponent(a.hash.slice(1)))).filter(Boolean);
    const on = () => {
      let cur = heads[0];
      for (const h of heads) if (h.getBoundingClientRect().top < 120) cur = h;
      links.forEach(a => a.classList.toggle('on', decodeURIComponent(a.hash.slice(1)) === cur?.id));
    };
    addEventListener('scroll', on, { passive: true }); on();
  }
  document.querySelector('.side a.on')?.scrollIntoView({ block: 'center' });
})();
