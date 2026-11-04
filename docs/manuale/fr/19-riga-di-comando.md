# 19. Ligne de commande et agents

Ce chapitre s'adresse à ceux qui automatisent : scripts, contrôles avant livraison, agents d'intelligence
artificielle ayant accès au terminal (Claude Code, Codex, Gemini CLI).

## Le guide pour agents

*Aide ▸ Guide pour agents IA (.md)…* enregistre un fichier Markdown qui explique à un agent comment lire,
écrire, contrôler et modifier les schémas d'OpenWiring : déroulement du travail, règles, conventions des
repères, schémas types, syntaxe complète du format texte, exemple, signification des contrôles, procédure
pour redessiner des schémas à partir de PDF (SEE Electrical, EPLAN, AutoCAD) et catalogue des symboles avec
les points de connexion. Une copie se trouve aussi dans le dépôt : `docs/AGENTE_IA.md`.

## Les commandes

Dans le dossier des sources d'OpenWiring, après `npm ci` :

```bash
npm run -s cli -- esporta progetto.ecad --pagine 2,3 --catalogo > pagine.txt
npm run -s cli -- controlla progetto.ecad pagine.txt     # erreurs avec le numéro de ligne, et vérification
npm run -s cli -- applica progetto.ecad pagine.txt       # crée le projet s'il n'existe pas
npm run -s cli -- verifica progetto.ecad [--json]
npm run -s cli -- importa-pdf schema.pdf [uscita.ecad]
npm run -s cli -- guida > AGENTE_IA.md
```

| Commande | Ce qu'elle fait |
|---|---|
| `esporta` | écrit les pages au format texte ; `--pagine` choisit les pages, `--catalogo` ajoute le catalogue des symboles |
| `controlla` | contrôle un texte sans modifier le projet : erreurs avec le numéro de ligne et problèmes de vérification sur les pages concernées |
| `applica` | applique le texte au projet (remplace ou ajoute des pages) ; crée le fichier s'il n'existe pas |
| `verifica` | les contrôles du projet, aussi en JSON pour les scripts |
| `importa-pdf` | reconstruit un projet à partir d'un schéma en PDF vectoriel |
| `guida` | le guide pour agents |

Les pages générées par le programme (vues d'ensemble API, schémas des borniers, listes, implantation,
couverture) ne s'exportent que sous forme d'en-tête.

## Le format texte

Une ligne par élément, avec des coordonnées en mm sur la feuille A3 et une grille de 4 mm :

| Ligne | Exemple |
|---|---|
| `progetto` | `progetto nome="Linea 3" cliente="Rossi Spa"` |
| `luogo` | `luogo +Q1 "Quadro master" tipo="Quadro elettrico"` |
| `cavo` | `cavo -1W1 tipo=FG16OR16 sezione=1,5 conduttori="BN BK GY GNYE" lunghezza=15` |
| `scheda` | `scheda -3A1 tipo=cpu-14di-10do-2ai stazione=PLC1` |
| `simbolodef` | un symbole boîte avec ses points de connexion, pour les composants absents du catalogue |
| `pagina` | `pagina 7 "Ventilazione" tipo=schema luogo=Q1` |
| `simbolo` | `simbolo coil -7K1 @100,140 descr="Contattore" dati="24 V DC"` |
| `filo` | `filo 100,24 100,60 sezione=1,5 colore=BU` |
| `collega` | `collega -7S1:14 -7K1:A1` (le programme calcule le parcours) |
| `testo` | `testo @40,250 h=3 "Nota"` |
| `riquadro`, `lineacavo` | cadres du schéma réseau et lignes des câbles |

Le texte exporté décrit en commentaires chaque point de connexion avec ses coordonnées et, pour chaque fil,
ce qu'il relie et le numéro de fil. Exporter et réimporter sans modifications donne le même projet.
