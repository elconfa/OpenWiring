# Contribuire a OpenWiring

Grazie per l'interesse! Ecco come lavorare sul codice.

## Preparare l'ambiente

Serve **Node.js 20 o successivo**.

```bash
git clone https://github.com/elconfa/OpenWiring.git
cd OpenWiring
npm install
npm run electron      # app desktop
npm run dev           # nel browser, http://localhost:5173
```

## Prima di proporre una modifica

```bash
npx tsc               # controllo dei tipi
npm test              # tutti i test (vitest)
```

- Una modifica, una pull request, con una descrizione di cosa cambia per chi disegna.
- Aggiungi un test in `test/` per ogni funzione nuova o errore corretto.
- I testi dell'interfaccia passano da `tx()` / `tn()` (`src/i18n/ui.ts`): dopo aver aggiunto testi lancia
  `node scripts/i18n-extract.mjs` e aggiungi le traduzioni in `src/i18n/ui.{en,fr,de,es,ru}.json`.
- Ogni campo nuovo dei simboli o del progetto va anche nel formato testo (`src/model/textFormat.ts`):
  `test/textRoundTrip.test.ts` lo controlla. `npm run guide` rigenera `docs/AGENTE_IA.md`.
- Non includere dati di clienti, cataloghi o macro dei costruttori: per le prove usa progetti inventati e
  il costruttore DEMO di `test/fixtures`.

## Licenza dei contributi

Inviando una pull request accetti che il tuo contributo sia distribuito con la licenza del progetto,
GNU GPL 3.0 o successiva.
