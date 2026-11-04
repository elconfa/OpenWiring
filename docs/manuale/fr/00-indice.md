# Manuel d'OpenWiring

OpenWiring est un logiciel pour dessiner des schémas électriques industriels selon les normes CEI : repères des appareils, renvois croisés, numéros de fil, borniers, câbles, API, listes et
export en PDF, DXF et Excel. Ce manuel explique chaque fonction avec des exemples et des images.

Pour débuter, lisez les chapitres 1 à 3 et dessinez votre premier schéma en une demi-heure ; les autres
chapitres se consultent au besoin.

> Les images montrent le logiciel avec l'interface en italien. Choisissez votre langue avec
> *Affichage ▸ Language · Lingua* : menus et fenêtres ont la même disposition dans toutes les langues.

## Chapitres

| N° | Chapitre | Contenu |
|---|---|---|
| 1 | [Introduction et installation](01-introduzione.md) | ce qu'est OpenWiring, installation, premier démarrage, enregistrement |
| 2 | [L'interface](02-interfaccia.md) | menus, barre d'outils, arborescence, propriétés, bibliothèque, vues, navigation |
| 3 | [Le premier projet](03-primo-progetto.md) | exercice guidé : commande d'une pompe avec auto-maintien |
| 4 | [Projet et pages](04-progetto-e-pagine.md) | données du projet, pages et types de pages, emplacements, cartouche, propriétés définies par l'utilisateur, couverture, modèles |
| 5 | [Dessiner le schéma](05-disegnare.md) | symboles, fils, jonctions, potentiels, renvois, bus de conducteurs, textes, images, modification |
| 6 | [Repères, renvois croisés et numéros de fil](06-sigle-e-numerazione.md) | CEI 81346, contacts, image des contacts, numéros de fil, sections et couleurs |
| 7 | [Appareils et articles](07-dispositivi-e-articoli.md) | données des appareils, navigateur, structure =/+, copie des propriétés, articles, base de données des articles, EDZ et CSV |
| 8 | [Borniers](08-morsettiere.md) | bornes, étages, ponts, réserves, accessoires, schéma du bornier |
| 9 | [Câbles et connecteurs](09-cavi-e-connettori.md) | ligne de définition, conducteurs, listes de câbles, connecteurs et fiches, données des broches |
| 10 | [API](10-plc.md) | cartes, points E/S, adresses, vues d'ensemble, TIA Portal, CODESYS, PLCopen |
| 11 | [Réseaux, emplacements et schéma unifilaire](11-reti-luoghi-unifilare.md) | schéma réseau, bus, câbles réseau, plan IP, emplacements, unifilaire |
| 12 | [Implantation de l'armoire](12-layout-quadro.md) | plaque, rails DIN, goulottes, placement automatique, perçage, longueurs des fils |
| 13 | [Macros, symboles et cartouches](13-macro-simboli-cartigli.md) | macros, éditeur de composants, QElectroTech, cartouches inclus et personnalisés |
| 14 | [Listes et pages automatiques](14-liste-e-pagine-automatiche.md) | nomenclature, liste d'achat, listes, pages de liste, étiquettes |
| 15 | [Vérification, recherche et révisions](15-verifica-ricerca-revisioni.md) | contrôles du projet, rechercher et remplacer, révisions, comparaison |
| 16 | [Langues des schémas](16-lingue.md) | dictionnaire, schémas en anglais et en allemand, deux langues ensemble |
| 17 | [Assistant IA](17-assistente-ia.md) | Claude, ChatGPT et Gemini dans le logiciel, format texte |
| 18 | [Import et export](18-import-export.md) | PDF, impression, DXF, Excel, import depuis SEE Electrical, EPLAN, QElectroTech |
| 19 | [Ligne de commande et agents](19-riga-di-comando.md) | commandes `npm run cli`, guide pour agents IA |
| 20 | [Raccourcis, fichiers et problèmes](20-scorciatoie-e-problemi.md) | touches, formats de fichiers, questions fréquentes |

## Conventions du manuel

- *L'italique avec des flèches* indique un chemin dans les menus : *Projet ▸ Vérification*.
- **⌘** est la touche Commande du Mac ; sous Windows on utilise **Ctrl**.
- Les repères s'écrivent comme sur le schéma : `-2K1` (appareil), `-X1:3` (borne), `200.01` (numéro de fil).
- Les exemples utilisent le **projet d'exemple** « Avviamento motore pompa » (*Fichier ▸ Charger le projet
  d'exemple*), ainsi chaque image se retrouve dans le logiciel.

## Marques et données de tiers

OpenWiring est un logiciel indépendant, non affilié à EPLAN GmbH & Co. KG, Rittal, SDProget ou aux fabricants
cités, et non approuvé par eux. EPLAN, Eplan Data Portal, SPAC, AutoCAD, Excel, Siemens, Schneider Electric,
QElectroTech et les autres noms de produits et d'entreprises sont des marques de leurs titulaires, cités
uniquement pour indiquer des formats de fichiers et la compatibilité. OpenWiring n'inclut ni ne distribue de
macros, symboles ou catalogues des fabricants : vous n'importez que les fichiers que vous avez le droit
d'utiliser, dans le respect de leurs conditions d'utilisation. La lecture des formats EDZ, XML et CSV résulte de
l'analyse des fichiers de données, à des fins d'interopérabilité. Les mêmes informations se trouvent dans
*Aide ▸ À propos*.
