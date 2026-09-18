# Monkey

Petite collection de userscripts de confort pour la lecture sur le Web.

Les scripts sont conçus pour fonctionner avec les gestionnaires de userscripts courants, notamment **Tampermonkey** et **Violentmonkey**.

## Scripts

### Auto Scroll Manga / Manhua / Comics

Fichier : `auto-scroll.js`

Ajoute un bouton flottant pour faire défiler automatiquement les pages de manga, manhua, manhwa, webtoon et comics.

Fonctions principales :

- défilement vers le haut ou vers le bas ;
- vitesse réglable de `-1000` à `1000 px/s` ;
- pause à `0 px/s` ;
- arrêt automatique en haut ou en bas de page ;
- bouton flottant déplaçable ;
- mémorisation de la vitesse et de la position ;
- raccourcis clavier et réglage à la molette.

Le script cible les URL contenant notamment `manga`, `manhua`, `manhwa`, `webtoon`, `comic`, `webcomic`, `scantrad` ou `hentai`.

### RER Reading Buffer

Fichier : `RER-Reading-Buffer.user.js`

Maintient un petit tampon de lecture pour continuer à lire pendant une coupure réseau courte, par exemple dans les transports.

Fonctions principales :

- précharge jusqu'à **5 chapitres** en avance ;
- suit le vrai lien « chapitre suivant » plutôt que de deviner les URL ;
- télécharge les chapitres séquentiellement avec une pause entre eux ;
- conserve le HTML dans **IndexedDB** ;
- tente aussi de conserver les images quand le site/CDN l'autorise ;
- permet de lire le chapitre suivant depuis le buffer hors ligne ;
- garde le chapitre courant et le précédent, puis nettoie les anciennes entrées ;
- s'arrête proprement sur les réponses `401`, `403` ou `429`.

Le cache des images est volontairement « best effort » : certains CDN bloquent les requêtes cross-origin. Le texte/HTML reste la partie la plus fiable.

## Installation

1. Installer Tampermonkey ou Violentmonkey.
2. Créer un nouveau userscript.
3. Copier le contenu du fichier souhaité.
4. Enregistrer et activer le script.

Les scripts ne nécessitent aucun service externe propre à ce dépôt.

## Commandes de l'Auto Scroll

| Action | Commande |
| --- | --- |
| Activer / désactiver | Clic sur le bouton ou `Espace` |
| Augmenter la vitesse | `Flèche haut` |
| Diminuer la vitesse | `Flèche bas` |
| Modifier la vitesse | Molette sur le bouton |
| Déplacer le bouton | Glisser-déposer |

Les raccourcis clavier sont ignorés lorsqu'un champ de saisie ou un élément interactif est utilisé.

## Compatibilité

Les scripts utilisent le format standard `// ==UserScript==`. Leur compatibilité exacte dépend du navigateur, du gestionnaire de userscripts et du site visité.

Certains sites peuvent modifier fortement leur DOM, appliquer une CSP stricte, utiliser des CDN avec CORS restrictif ou changer leurs liens de navigation. Dans ce cas, une adaptation ciblée peut être nécessaire.

## Licence

Projet personnel fourni en l'état. Vérifiez les conditions d'utilisation des sites sur lesquels vous employez ces scripts.
