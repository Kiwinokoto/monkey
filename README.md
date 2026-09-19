# Monkey

Petite collection de userscripts de confort pour la lecture sur le Web.

Compatibles avec **Violentmonkey** et **Tampermonkey**.

## Installation rapide

### Recommandé : un seul script pour lire dans les transports

- ⭐ [Installer RER Reader — Buffer + Comic Auto Scroll](https://raw.githubusercontent.com/Kiwinokoto/monkey/refs/heads/main/RER-Reader.user.js)

**RER Reader** active :

- le **buffer de 5 chapitres** sur les lecteurs de novels, mangas, manhua, manhwa, webtoons et comics ;
- l'**auto-scroll uniquement** sur les lecteurs manga/manhua/manhwa/webtoon/comics ;
- aucun auto-scroll sur les novels.

Il remplace donc, pour cet usage, l'installation simultanée de `RER Reading Buffer` + `Auto Scroll Comics`.

### Scripts séparés

- 📜 [Installer Auto Scroll — Manga / Manhua / Manhwa / Comics](https://raw.githubusercontent.com/Kiwinokoto/monkey/refs/heads/main/auto-scroll-comics.user.js)
- 📖 [Installer Auto Scroll — Novels](https://raw.githubusercontent.com/Kiwinokoto/monkey/refs/heads/main/auto-scroll-novels.user.js)
- 🚇 [Installer RER Reading Buffer](https://raw.githubusercontent.com/Kiwinokoto/monkey/refs/heads/main/RER-Reading-Buffer.user.js)

Avec Violentmonkey ou Tampermonkey installé, ouvre directement un lien ci-dessus puis clique sur **Installer** / **Mettre à jour**. Si le navigateur affiche seulement le code brut, utilise **Install from URL / Installer depuis une URL** dans le gestionnaire de userscripts.

## RER Reader

Fichier : `RER-Reader.user.js`

C'est le script tout-en-un destiné à la lecture mobile :

- buffer glissant jusqu'à **5 chapitres** ;
- réutilisation immédiate d'IndexedDB : après un changement de chapitre, il conserve les chapitres déjà prêts et ne télécharge que ce qui manque ;
- conservation du HTML et, lorsque le CDN l'autorise, des images ;
- arrêt propre sur `401`, `403` et `429` ;
- protection contre les liens « suivant » en boucle ;
- auto-scroll comics : **-1000 à 1000 px/s**, pas de **50 px/s** ;
- sur un novel, seul le buffer démarre ;
- interface minimale : petite pastille du buffer + bouton d'auto-scroll uniquement lorsqu'il est utile ;
- contrôles tactiles : tap = play/pause, swipe vertical sur le bouton = vitesse, appui long puis glisser = déplacement.

Le buffer possède également un garde anti-double-exécution : si le script standalone `RER Reading Buffer` est encore activé pendant une migration, un seul des deux buffers démarre.

## Auto Scroll — Manga / Manhua / Manhwa / Comics

Fichier : `auto-scroll-comics.user.js`

- vitesse : **-1000 à 1000 px/s** ;
- pas de réglage : **50 px/s** ;
- pause à `0 px/s` ;
- arrêt automatique en haut ou en bas de page ;
- bouton flottant déplaçable ;
- mémorisation de la vitesse et de la position ;
- raccourcis clavier et réglage à la molette.

Le ciblage public couvre notamment `manga`, `manhua`, `manhwa`, `webtoon`, `comic`, `webcomic` et `scantrad`.

## Auto Scroll — Novels

Fichier : `auto-scroll-novels.user.js`

Même moteur avec des réglages de lecture de texte plus fins :

- vitesse : **-300 à 100 px/s** ;
- pas : **10 px/s** ;
- vitesse initiale : **40 px/s**.

## RER Reading Buffer

Fichier : `RER-Reading-Buffer.user.js`

Version standalone du buffer. Utile si l'on ne veut **aucun auto-scroll**.

## Contrôles des Auto Scroll

| Action | Ordinateur | Mobile / tactile |
| --- | --- | --- |
| Activer / désactiver | Clic sur le bouton ou `Espace` | Tap sur le bouton |
| Accélérer | `Flèche haut` ou molette vers le haut sur le bouton | Swipe vers le haut en partant du bouton |
| Ralentir | `Flèche bas` ou molette vers le bas sur le bouton | Swipe vers le bas en partant du bouton |
| Déplacer le bouton | Glisser-déposer | Appui long (~450 ms), puis glisser |

Sur mobile, le geste doit **commencer sur le bouton**, mais le doigt peut ensuite sortir largement de sa surface : le script utilise le *pointer capture* jusqu'au relâchement. Le reste de la page conserve ses gestes habituels.

Pour la vitesse, un premier mouvement vertical d'environ **12 px** déclenche un cran, puis environ **32 px supplémentaires** ajoutent un cran. Un cran vaut **50 px/s** pour le scroller comics et **10 px/s** pour le scroller novels.

Les raccourcis clavier sont ignorés lorsqu'un champ de saisie ou un élément interactif est utilisé.

## Compatibilité

Les scripts utilisent le format standard `// ==UserScript==` et des API communes à Tampermonkey et Violentmonkey (`GM_getValue`, `GM_setValue` ou API Web standard).

Certains sites peuvent modifier fortement leur DOM, appliquer une CSP stricte, utiliser des CDN avec CORS restrictif ou changer leurs liens de navigation. Une adaptation ciblée peut alors être nécessaire.

## Licence

Projet personnel fourni en l'état. Vérifiez les conditions d'utilisation des sites sur lesquels vous employez ces scripts.
