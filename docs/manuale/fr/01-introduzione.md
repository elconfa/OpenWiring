# 1. Introduction et installation

## Ce qu'est OpenWiring

OpenWiring est une CAO électrique : on ne dessine pas des traits, mais des **appareils reliés**. Le logiciel
sait que le contact `-2K1 13-14` appartient à la bobine `-2K1`, que deux fils réunis par un point sont le
même conducteur et que la borne `-X1:3` amène le fil `1.06` au moteur. À partir de ces informations il
déduit tout seul :

- les **renvois croisés** entre bobines et contacts, et entre pages différentes ;
- les **numéros de fil** et leur position sur le schéma ;
- les **listes** : nomenclature, liste d'achat, appareils, bornes, connexions, fils, câbles, E/S API ;
- la **vérification** du projet : courts-circuits, connexions manquantes, repères en double ;
- les **exports** : PDF avec liens cliquables, DXF, Excel pour TIA Portal, étiquettes pour les imprimantes
  de repérage.

Les notions sont celles du dessin électrique industriel : repères CEI 81346, grille de 4 mm, pages A3 à
10 colonnes, renvois `/page.colonne`, avec une interface simple.

## Installation

Le logiciel se télécharge depuis la page **Releases** du projet sur GitHub
(<https://github.com/elconfa/OpenWiring/releases>).

| Système | Fichier à télécharger |
|---|---|
| macOS avec processeur Apple (M1, M2, M3, M4) | `OpenWiring-x.y.z-arm64.dmg` |
| macOS avec processeur Intel | `OpenWiring-x.y.z.dmg` |
| Windows 10 et 11, avec installation | `OpenWiring.Setup.x.y.z.exe` |
| Windows, sans installation (un seul fichier, même depuis une clé USB) | `OpenWiring-x.y.z-portable.exe` |
| Windows, sans installation (dossier) | `OpenWiring-x.y.z-win.zip` |

### macOS

1. Ouvrez le fichier `.dmg` et faites glisser **OpenWiring** dans le dossier *Applications*.
2. Ouvrez l'application une fois : l'avertissement « Apple ne peut pas vérifier… » apparaît, car
   l'application n'est pas signée avec un certificat Apple payant. Fermez l'avertissement.
3. Ouvrez *Réglages Système ▸ Confidentialité et sécurité*, descendez en bas, appuyez sur **Ouvrir quand
   même** et confirmez. Sous macOS 14 et antérieur, un clic droit sur l'application ▸ *Ouvrir* ▸ *Ouvrir* suffit.

> **Si « OpenWiring est endommagé » apparaît** (versions jusqu'à 0.14.0) : ouvrez le Terminal et exécutez
> `xattr -cr /Applications/OpenWiring.app`, puis rouvrez l'application.

### Windows

Extrayez le zip dans un dossier (par exemple *Documents\\OpenWiring-app*) et lancez `OpenWiring.exe`. Dans la fenêtre bleue de SmartScreen, choisissez *Informations
complémentaires ▸ Exécuter quand même*.

### Langue de l'interface

Au premier démarrage, le logiciel utilise la langue du système si c'est l'italien, l'anglais, le français,
l'allemand, l'espagnol ou le russe. Elle se change à tout moment avec *Affichage ▸ Language · Lingua*. La langue des
schémas (cartouches, listes, PDF) est un réglage distinct : voir le [chapitre 16](16-lingue.md).

## Premier démarrage

Au premier démarrage s'ouvre le **projet d'exemple** « Avviamento motore pompa » (démarrage d'un moteur de
pompe), six pages prêtes à explorer :

| Page | Contenu |
|---|---|
| 1 | puissance : disjoncteur moteur, contacteur, bornier, câble et moteur ; alimentation 24 V |
| 2 | commande : arrêt d'urgence, marche avec auto-maintien, voyants |
| 3 | entrées et sorties de l'API |
| 4 | vue d'ensemble de la carte API, générée par le logiciel |
| 5 | schéma réseau Profinet et Modbus entre deux armoires |
| 6 | schéma unifilaire de la puissance |

On le rouvre à tout moment avec *Fichier ▸ Charger le projet d'exemple* ; *Fichier ▸ Nouveau projet* part
d'une page vide.

## Enregistrer le travail

- **Enregistrer** (⌘S) écrit le projet dans un fichier `.ecad`. *Enregistrer sous…* (⇧⌘S) en crée une copie.
- **Ouvrir** (⌘O) rouvre un fichier `.ecad`. Le fichier contient tout : pages, paramètres, symboles et
  articles utilisés.
- Le logiciel garde aussi une **copie automatique** du dernier projet ouvert et la propose au redémarrage :
  c'est une sécurité en cas de fermeture imprévue, elle ne remplace pas *Enregistrer*.
- La barre d'état en bas affiche le nom du fichier et un point `•` quand il y a des modifications non
  enregistrées.

## Annuler

Chaque modification s'annule avec **⌘Z** (*Édition ▸ Annuler*) et se rétablit avec **⇧⌘Z** (Ctrl+Y sous
Windows). On peut annuler jusqu'à 100 étapes, y compris les grosses opérations comme l'application de pages
écrites par l'assistant IA ou une modification en bloc de nombreux appareils.
