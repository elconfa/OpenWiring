# 2. L'interface

![La fenêtre d'OpenWiring avec ses parties numérotées](../img/it/interfaccia.png)

*La fenêtre d'OpenWiring avec le projet d'exemple (interface en italien).*

| N° | Partie | À quoi elle sert |
|---|---|---|
| 1 | Barre de menus | toutes les commandes : *Fichier, Édition, Affichage, Insertion, Projet, Listes, Aide* |
| 2 | Barre d'outils | les commandes de dessin les plus utilisées |
| 3 | Arborescence du modèle | pages, appareils, structure =/+, borniers, câbles, articles du projet |
| 4 | Propriétés | les données de l'élément sélectionné, de la page ou du projet |
| 5 | Zone de dessin | la page de schéma courante |
| 6 | Bibliothèque | symboles, macros et articles à insérer |
| 7 | Vue rapport | messages d'import, d'export et des opérations |
| 8 | Barre d'état | conseils sur la commande active, fichier, page, coordonnées du curseur |
| 9 | Onglets des vues | Schéma, Appareils, API, Borniers, Articles, Listes |

## Barre de menus

![Le menu Fichier](../img/it/menu-file.png)

*Le menu Fichier : projets, import et export.*

Chaque commande du logiciel se trouve dans un menu ; les raccourcis clavier apparaissent à côté des entrées.
Menu ouvert, les flèches ← → passent au menu voisin et Échap le ferme.

| Menu | Contient |
|---|---|
| *Fichier* | nouveau, ouvrir, enregistrer, projet d'exemple, pages en texte pour les assistants IA, **Importer** (articles EDZ/XML/CSV, symboles QElectroTech, schéma depuis PDF, macros, comparaison) et **Exporter** (PDF, impression, DXF, étiquettes, PLCopen, articles, dictionnaire) |
| *Édition* | annuler et rétablir, couper, copier, coller, dupliquer, supprimer, tout sélectionner, faire pivoter, miroir, rechercher et remplacer |
| *Affichage* | vues, ajuster la page, page précédente et suivante, thème clair ou sombre, feuille blanche ou sombre, langue des schémas, langue de l'interface, libellés sous les icônes |
| *Insertion* | fil, câble, cadre d'armoire, texte, image, bus de conducteurs, connexions réseau par protocole, pages de tous types, pages automatiques |
| *Projet* | propriétés, propriétés définies par l'utilisateur, vérification, assistant IA, renumérotations, cartouche, emplacements, réseaux IP, traductions, révisions, modèles |
| *Listes* | contrôles, traductions et toutes les listes du projet, PDF complet |
| *Aide* | manuel, raccourcis, guide pour agents IA, site du projet, à propos (version, auteur, marques et données de tiers) |

![Le menu Projet](../img/it/menu-progetto.png)

*Le menu Projet.*

## Barre d'outils

![La barre d'outils](../img/it/barra-strumenti.png)

| Bouton | Action |
|---|---|
| *Nouveau, Ouvrir, Enregistrer* | gestion du fichier de projet |
| *Annuler, Rétablir* | ⌘Z et ⇧⌘Z |
| *Sélectionner* | revenir à la sélection (aussi avec Échap) |
| *Fil* | dessiner des fils (touche **W**) |
| *Bus* et la liste des protocoles | dessiner une connexion réseau (Profinet, EtherCAT, Modbus…) |
| *Bus fils* | regrouper les fils en un bus de conducteurs ([chapitre 5](05-disegnare.md#bus-de-conducteurs)) |
| *Armoire* | cadre d'une armoire dans le schéma réseau |
| *Câble* | ligne de définition de câble |
| *Texte* | texte libre sur la page |
| *Faire pivoter, Supprimer* | sur la sélection (touches **R** et **Suppr**) |
| *Ajuster* | afficher toute la page (touche **F**) |
| *Rechercher* | rechercher et remplacer (⌘F) |
| *Vérification* | contrôles du projet |
| *EDZ* | importer des articles de fabricants |
| *PDF* | exporter le projet en PDF |

En désactivant *Affichage ▸ Libellés sous les icônes*, la barre devient une seule rangée d'icônes, plus basse.

## Arborescence du modèle

![L'arborescence du modèle](../img/it/albero.png)

L'arborescence montre le projet et s'ouvre ou se ferme avec les triangles ▸ ▾ :

- **Pages**, regroupées par emplacement (armoire, boîte à boutons…) : un clic ouvre la page.
- **Appareils**, regroupés par emplacement : un clic va à l'appareil et le sélectionne.
- **Structure =Installation +Emplacement** : les appareils par fonction et emplacement (voir le [chapitre 7](07-dispositivi-e-articoli.md#structure-installation-emplacement)).
- **Borniers** et **Câbles** : un clic ouvre le bornier ou sélectionne la ligne du câble.
- **Articles du projet** : les articles utilisés.

Sous l'arborescence se trouvent les boutons des pages : *+ Page*, *+ Couverture*, *+ Unifilaire*,
*+ Réseau*, *+ Implantation*, *⧉* (dupliquer la page), *↑ ↓* (déplacer) et *✕* (supprimer).

## Propriétés

Le panneau affiche les données de ce qui est sélectionné :

- **rien de sélectionné** : la page courante et, dessous, les données du projet ;
- **un symbole** : repère, données de l'appareil, commande, points de connexion, position ;
- **un fil** : numéro de fil, réseau, connexions, section, couleur ;
- **plusieurs éléments** : les champs communs.

On écrit dans le champ et on confirme avec Entrée ou en quittant le champ. Les valeurs en gris italique sont
des suggestions ou des valeurs reprises de l'article.

## Bibliothèque

![La bibliothèque des symboles](../img/it/libreria-simboli.png)

La colonne de droite a trois onglets :

- **Symboles** : les symboles CEI 60617 classés par catégorie (bobines et contacts, commandes, protections,
  récepteurs, bornes et connexions, API, réseaux et bus, unifilaire), plus ceux importés ou dessinés par vous.
  Le champ *Rechercher…* filtre par nom.
  En haut se trouvent les **★ Favoris** : l'étoile ☆ d'un symbole (ou le clic droit sur un composant ▸
  *Ajouter aux favoris*) l'y place. Les favoris valent pour tous les projets.
- **Macros** : les circuits enregistrés pour être réutilisés (voir le [chapitre 13](13-macro-simboli-cartigli.md)).
- **Articles** : la bibliothèque des articles des fabricants.

## Menu du clic droit

![Le menu du clic droit](../img/it/menu-contestuale.png)

Le clic droit sur un élément ouvre les commandes les plus utilisées : couper, copier, coller ici, dupliquer,
faire pivoter, miroir, supprimer, créer une macro à partir de la sélection, **copier les propriétés** et **coller les propriétés de -X** (toutes les données de l'appareil sauf le repère, [chapitre 7](07-dispositivi-e-articoli.md#copier-les-propriétés)), modifier le composant, ajouter aux favoris, mettre en
évidence le potentiel (sur les fils), aller à l'élément principal ou aux contacts, ajouter un étage (sur les
bornes), tout sélectionner, rechercher, dupliquer la page, ajuster à la fenêtre.

## Vues

Les onglets en haut à droite changent la partie centrale :

| Vue | Contenu |
|---|---|
| *Schéma* | la page de dessin |
| *Appareils* | le navigateur des appareils sous forme de tableau |
| *API* | cartes, adresses et liste des E/S |
| *Borniers* | le navigateur des borniers |
| *Articles* | la gestion des articles |
| *Listes* | contrôles, traductions et toutes les listes |

## Se déplacer dans le dessin

| Action | Comment |
|---|---|
| Zoomer et dézoomer | molette de la souris, autour du curseur (sur le pavé tactile : pincement) |
| Déplacer la vue | bouton central de la souris, ou **Alt** + glisser |
| Voir toute la page | **F** ou *Ajuster* |
| Page précédente ou suivante | **PgPréc** / **PgSuiv** |
| Aller à une référence | cliquer sur un renvoi comme `/2.4` |

## Thème, feuille et langue

*Affichage ▸ Thème* choisit une interface claire, sombre ou comme le système. *Affichage ▸ Feuille de
dessin* choisit une feuille blanche ou sombre (comme dans les CAO à fond noir). PDF, DXF et impression sont
toujours sur feuille blanche. *Affichage ▸ Language · Lingua* choisit la langue de l'interface : italien,
anglais, français, allemand ou espagnol.
