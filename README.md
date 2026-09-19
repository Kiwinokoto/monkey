# Monkey

Petite collection de userscripts de confort pour la lecture sur le Web.

Compatibles avec **Violentmonkey** et **Tampermonkey**.

## Installation rapide

Avec Violentmonkey ou Tampermonkey installé, ouvre directement l'un de ces liens dans ton navigateur puis clique sur **Installer** / **Mettre à jour** :

- 📜 [Installer Auto Scroll — Manga / Manhua / Manhwa / Comics](https://raw.githubusercontent.com/Kiwinokoto/monkey/refs/heads/main/auto-scroll-comics.user.js)
- 📖 [Installer Auto Scroll — Novels](https://raw.githubusercontent.com/Kiwinokoto/monkey/refs/heads/main/auto-scroll-novels.user.js)
- 🚇 [Installer RER Reading Buffer](https://raw.githubusercontent.com/Kiwinokoto/monkey/refs/heads/main/RER-Reading-Buffer.user.js)

Si le navigateur affiche simplement le code brut, ouvre le tableau de bord du gestionnaire de userscripts, choisis **Install from URL / Installer depuis une URL**, puis colle le même lien.

## Scripts

### Auto Scroll — Manga / Manhua / Manhwa / Comics

Fichier : `auto-scroll-comics.user.js`

Ajoute un bouton flottant pour faire défiler automatiquement les pages de manga, manhua, manhwa, webtoon et comics.

- vitesse : **-1000 à 1000 px/s** ;
- pas de réglage : **50 px/s** ;
- pause à `0 px/s` ;
- arrêt automatique en haut ou en bas de page ;
- bouton flottant déplaçable ;
- mémorisation de la vitesse et de la position ;
- raccourcis clavier et réglage à la molette.

Le script cible les URL contenant notamment `manga`, `manhua`, `manhwa`, `webtoon`, `comic`, `webcomic`, `scantrad` ou `hentai`.

### Auto Scroll — Novels

Fichier : `auto-scroll-novels.user.js`

Même moteur d'auto-scroll, avec des réglages adaptés à une lecture de texte plus lente.

- vitesse : **-300 à 100 px/s** ;
- pas de réglage : **10 px/s** ;
- vitesse initiale : **40 px/s** ;
- ciblage séparé des sites de novels pour éviter d'afficher deux scrollers sur les lecteurs de comics.

### RER Reading Buffer

Fichier : `RER-Reading-Buffer.user.js`

Maintient un tampon glissant de lecture pour continuer à lire pendant une coupure réseau courte.

- jusqu'à **5 chapitres** en avance ;
- réutilise immédiatement les chapitres déjà présents dans IndexedDB ;
- ne télécharge que ce qui manque pour revenir à `5/5` ;
- conserve le HTML et tente aussi de conserver les images lorsque le CDN l'autorise ;
- respecte les réponses `401`, `403` et `429` ;
- protège contre les liens « suivant » en boucle ;
- seule la petite pastille `📚 x/5` reste visible ; les détails sont dans le panneau ouvrable au clic.

## Commandes des Auto Scroll

| Action | Commande |
| --- | --- |
| Activer / désactiver | Clic sur le bouton ou `Espace` |
| Augmenter la vitesse | `Flèche haut` |
| Diminuer la vitesse | `Flèche bas` |
| Modifier la vitesse | Molette sur le bouton |
| Déplacer le bouton | Glisser-déposer |

Les raccourcis clavier sont ignorés lorsqu'un champ de saisie ou un élément interactif est utilisé.

## Compatibilité

Les scripts utilisent le format standard `// ==UserScript==` et uniquement des API communes à Tampermonkey et Violentmonkey pour ces usages (`GM_getValue`, `GM_setValue` ou API Web standard).

Certains sites peuvent modifier fortement leur DOM, appliquer une CSP stricte, utiliser des CDN avec CORS restrictif ou changer leurs liens de navigation. Une adaptation ciblée peut alors être nécessaire.

## Licence

Projet personnel fourni en l'état. Vérifiez les conditions d'utilisation des sites sur lesquels vous employez ces scripts.
