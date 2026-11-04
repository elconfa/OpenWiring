# Manuale di OpenWiring — come è organizzato

Questa cartella contiene il manuale completo di OpenWiring, capitolo per capitolo, ed è la base
dell'help in linea del programma nelle sei lingue: italiano, inglese, francese, tedesco, spagnolo e russo.

```
docs/manuale/
  README.md            questo file
  it/                  testo italiano (lingua di riferimento)
    00-indice.md
    01-introduzione.md … 20-scorciatoie-e-problemi.md
  en/ fr/ de/ es/ ru/  traduzioni: stessi nomi di file e stessi titoli di sezione
  img/it/              foto delle finestre in italiano
  img/<lingua>/        foto con l'interfaccia in un'altra lingua (se manca, si usano quelle italiane)
```

## Regole per scrivere e tradurre

- **Un file per capitolo**, con lo stesso nome in tutte le lingue: i collegamenti tra capitoli
  (`[Morsettiere](08-morsettiere.md)`) restano validi in ogni lingua.
- **Le immagini** si richiamano con `../img/it/<nome>.png`. Nelle traduzioni si sostituisce `it` con la
  lingua quando esistono le foto con l'interfaccia tradotta; fino ad allora restano quelle italiane.
- **I nomi di menu, pulsanti e campi** si scrivono in corsivo esattamente come compaiono nel programma
  (*Progetto ▸ Verifica*). Nelle traduzioni vanno resi con le voci dell'interfaccia tradotta.
- **Sigle, codici, numeri filo e testi del formato testo** (`-2K1`, `200.01`, `simbolo coil …`) non si traducono.
- Ogni sezione segue lo schema: a cosa serve, come si fa (passi numerati), esempio, note e limiti.
- Le norme si citano con la sigla (IEC 81346, EN 50005, CEI EN 60204-1).

## Foto

Le foto si rigenerano dal programma, sempre uguali, con lo script `scripts/manual-shots.cjs`:

```bash
npm run build
npx electron scripts/manual-shots.cjs            # tutte le foto in docs/manuale/img/it
npx electron scripts/manual-shots.cjs it cavo    # solo alcune foto
```

Lo script apre l'app fuori schermo con un profilo temporaneo (non tocca i progetti né le librerie
dell'utente), carica il progetto di esempio e il tutorial del capitolo 3 (`scripts/manual-tutorial.cjs`)
e scatta le foto descritte in `scripts/manual-shots.list.cjs`: ogni foto ha un nome, il codice che porta
l'app nello stato giusto e il ritaglio (una zona dello schema in mm, un elemento dell'interfaccia o una
finestra). Per aggiungere una foto basta aggiungere una voce all'elenco e richiamarla nel capitolo.

## Help in linea

I capitoli sono Markdown semplice (titoli, elenchi, tabelle, immagini, blocchi di codice), così il
programma può mostrarli in una finestra di aiuto e collegare ogni comando alla sua sezione
(per esempio `08-morsettiere.md#ponticelli`).
