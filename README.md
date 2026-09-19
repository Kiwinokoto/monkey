# Monkey

Petite collection de userscripts de confort pour la lecture sur le Web.

Compatibles avec **Violentmonkey** et **Tampermonkey**.

## Installation rapide

### Recommandé : un seul script pour lire dans le RER, le métro ou le train

- ⭐ [Installer RER Reader — Buffer + Comic Auto Scroll](https://raw.githubusercontent.com/Kiwinokoto/monkey/refs/heads/main/RER-Reader.user.js)

**RER Reader** active :

- le **buffer cache-first de 5 chapitres** sur les lecteurs de novels, mangas, manhua, manhwa, webtoons et comics ;
- le vrai bouton **Next** du site sert directement le chapitre depuis le cache lorsqu'il est prêt, même si le téléphone pense encore être en ligne ;
- l'**auto-scroll uniquement** sur les lecteurs manga/manhua/manhwa/webtoon/comics ;
- aucun auto-scroll sur les novels.

Il remplace donc, pour cet usage, l'installation simultanée de `RER Reading Buffer` + `Auto Scroll Comics`.

### Scripts séparés

- 📜 [Installer Auto Scroll — Manga / Manhua / Manhwa / Comics](https://raw.githubusercontent.com/Kiwinokoto/monkey/refs/heads/main/auto-scroll-comics.user.js)
- 📖 [Installer Auto Scroll — Novels](https://raw.githubusercontent.com/Kiwinokoto/monkey/refs/heads/main/auto-scroll-novels.user.js)
- 🚇 [Installer RER Reading Buffer](https://raw.githubusercontent.com/Kiwinokoto/monkey/refs/heads/main/RER-Reading-Buffer.user.js)

Avec Violentmonkey ou Tampermonkey installé, ouvre directement un lien ci-dessus puis clique sur **Installer** / **Mettre à jour**. Si le navigateur affiche seulement le code brut, utilise **Install from URL / Installer depuis une URL** dans le gestionnaire de userscripts.

## Installation sur Android

La voie **testée et recommandée pour ce projet** est Firefox pour Android. Firefox prend officiellement en charge les extensions sur Android, contrairement à Chrome Android. D'autres navigateurs Android capables de charger des extensions peuvent éventuellement fonctionner, mais ils ne sont pas testés ici.

1. Installer **Firefox pour Android** : https://www.mozilla.org/firefox/browsers/mobile/android/
2. Dans Firefox, installer un gestionnaire de userscripts :
   - **Violentmonkey** — recommandé ici, open source sous licence MIT : https://addons.mozilla.org/android/addon/violentmonkey/
   - ou **Tampermonkey** : https://addons.mozilla.org/android/addon/tampermonkey/
3. Ouvrir dans Firefox le lien direct du Reader :
   - https://raw.githubusercontent.com/Kiwinokoto/monkey/refs/heads/main/RER-Reader.user.js
4. Violentmonkey ou Tampermonkey reconnaît le fichier `.user.js` : appuyer sur **Installer** / **Mettre à jour**.

Une fois installé, le Reader s'exécute automatiquement sur les pages de lecture compatibles. Il n'est pas nécessaire de recopier le code à chaque utilisation.

## RER Reader

Fichier : `RER-Reader.user.js`

C'est le script tout-en-un destiné à la lecture mobile :

- buffer glissant jusqu'à **5 chapitres** ;
- navigation **cache-first** : un clic sur le vrai `Next` ouvre d'abord la copie IndexedDB si elle existe, puis le Reader recharge seulement ce qui manque en arrière-plan ;
- conservation du HTML et, lorsque le CDN l'autorise, des images ;
- arrêt propre sur `401`, `403` et `429` ;
- protection contre les liens « suivant » en boucle ;
- le badge `📚 x/5` est **éphémère** quand tout va bien et reste visible lorsqu'une intervention peut être utile ;
- auto-scroll comics : **-1000 à 1000 px/s**, pas de **50 px/s** ;
- pendant l'auto-scroll, le contrôle devient presque transparent après un court délai ;
- toucher ou cliquer ailleurs dans la page arrête l'auto-scroll sans bloquer l'action normale du site ;
- sur un novel, seul le buffer démarre ;
- contrôles tactiles : tap = play/pause, swipe vertical sur le bouton = vitesse, appui long puis glisser = déplacement ;
- le `⋮` du contrôle (ou clic droit sur ordinateur) ouvre le panneau Reader : couleur libre via le sélecteur natif, opacité au repos et taille du contrôle.

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
| Ouvrir les réglages Reader | `⋮` ou clic droit sur le contrôle | Tap sur `⋮` |
| Reprendre la main pendant l'auto-scroll | Cliquer ailleurs dans la page | Toucher / swiper ailleurs dans la page |

Sur mobile, le geste doit **commencer sur le bouton**, mais le doigt peut ensuite sortir largement de sa surface : le script utilise le *pointer capture* jusqu'au relâchement. Le reste de la page conserve ses gestes habituels.

Pour la vitesse, un premier mouvement vertical d'environ **12 px** déclenche un cran, puis environ **32 px supplémentaires** ajoutent un cran. Un cran vaut **50 px/s** pour le scroller comics et **10 px/s** pour le scroller novels.

Pendant l'auto-scroll, le contrôle s'estompe automatiquement. Une interaction ailleurs dans la page arrête le défilement automatique **sans intercepter** le clic, le lien ou le geste tactile.

Le panneau Reader propose un sélecteur de couleur natif, l'opacité au repos et trois tailles de contrôle. Les raccourcis clavier sont ignorés lorsqu'un champ de saisie ou un élément interactif est utilisé.

## Compatibilité

Les scripts utilisent le format standard `// ==UserScript==` et des API communes à Tampermonkey et Violentmonkey (`GM_getValue`, `GM_setValue` ou API Web standard).

Certains sites peuvent modifier fortement leur DOM, appliquer une CSP stricte, utiliser des CDN avec CORS restrictif ou changer leurs liens de navigation. Une adaptation ciblée peut alors être nécessaire.

## Licence

Projet personnel fourni en l'état. Vérifiez les conditions d'utilisation des sites sur lesquels vous employez ces scripts.
