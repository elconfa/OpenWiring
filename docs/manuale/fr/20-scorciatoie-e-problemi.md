# 20. Raccourcis, fichiers et problèmes

## Raccourcis clavier

Sous Windows on utilise **Ctrl** à la place de **⌘**. *Aide ▸ Raccourcis et informations* les résume.

| Touche | Action |
|---|---|
| **W** | dessiner un fil |
| **R** | faire pivoter la sélection, ou le symbole à insérer |
| **F** | ajuster la page à la fenêtre |
| **Suppr**, Retour arrière | supprimer la sélection |
| **Échap** | terminer la commande en cours |
| **Flèches** | déplacer la sélection de 4 mm (avec ⇧ 16 mm) |
| **PgPréc**, **PgSuiv** | page précédente, suivante |
| ⌘Z, ⇧⌘Z (Ctrl+Y) | annuler, rétablir |
| ⌘C, ⌘X, ⌘V | copier, couper, coller (aussi dans un autre projet) |
| ⌘D | dupliquer la sélection |
| ⌘A | tout sélectionner dans la page |
| ⌘F | rechercher et remplacer |
| ⌘S, ⇧⌘S, ⌘O | enregistrer, enregistrer sous, ouvrir |
| ⌘P | imprimer |
| ⌘I | ouvrir ou fermer l'assistant IA |
| Molette | zoom autour du curseur |
| Bouton du milieu, **Alt** + glisser | déplacer la vue |
| **Maj** + clic | ajouter ou retirer un élément de la sélection |
| Bouton droit | menu contextuel ; pendant l'insertion, termine la commande |

## Fichiers

| Extension | Contenu |
|---|---|
| `.ecad` | projet OpenWiring : pages, éléments, réglages, articles et symboles utilisés, dans un fichier JSON lisible |
| `.ecmacro` | macro à échanger |
| `.edz`, `.xml`, `.csv` | articles des fabricants (paquets EDZ, XML au format EPLAN, CSV des données commerciales) |
| `.elmt`, `.qet` | composants de QElectroTech |
| `.pdf` | schémas et listes ; aussi comme source pour l'import depuis d'autres CAO |
| `.dxf` | pages, plaque de perçage, cartouches à importer |
| `.xlsx`, `.csv` | listes, appareils, variables API, étiquettes, dictionnaire |
| `.txt` | pages au format texte |

La **bibliothèque personnelle** (articles, symboles importés, macros, cartouches, modèles de projet) est
enregistrée dans le programme sur cet ordinateur. Les éléments utilisés dans un projet sont copiés dans le
fichier `.ecad` : le projet s'ouvre ainsi complet ailleurs aussi.

## Questions fréquentes

**Un fil semble relié mais la vérification dit qu'il ne l'est pas.**
Le fil passe sur le point de connexion sans s'y terminer. Faites glisser l'extrémité du fil sur le point, ou
supprimez le fil et redessinez-le en le terminant sur le point (le petit cercle vert).

**Deux fils se croisent : sont-ils reliés ?**
Non, sauf s'il y a le point de jonction. Pour les relier, faites aboutir un fil sur l'autre.

**Le contact ne montre pas le renvoi vers la bobine.**
Le contact doit avoir le même repère que la bobine. Vérifiez le repère dans les propriétés du contact.

**J'ai ajouté un composant et les numéros de fil ont changé.**
Cela arrive avec la numérotation *recalculée*. Avec la numérotation *bloquée* (par défaut), les numéros
existants ne changent pas.

**Le numéro de fil change après une borne.**
Dans les propriétés de la borne vérifiez *Numéro de fil ▸ Le numéro de fil traverse*.

**Un renvoi affiche `/?` en rouge.**
Il manque le renvoi correspondant de même nom sur une autre page.

**Le PDF ne contient pas les listes.**
Cochez *Listes à la fin* dans la fenêtre du PDF, ou créez les pages de liste.

**L'application ne s'ouvre pas sur macOS.**
Voir [Installation](01-introduzione.md#macos) : *Réglages Système ▸ Confidentialité et sécurité ▸ Ouvrir
quand même*.

**L'assistant IA répond que l'accès au compte a expiré.**
Exécutez dans le Terminal la commande indiquée (par exemple `codex login`), puis réessayez.

**Le composant QElectroTech importé ne fonctionne pas.**
Probablement la page web de GitHub a été enregistrée au lieu du fichier : téléchargez avec *Raw*.

**J'ai perdu mon travail après une fermeture brutale.**
À la réouverture le programme propose le dernier projet en cours. Enregistrez quand même souvent avec ⌘S.
