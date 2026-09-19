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

C'est le script tout-en-un destiné à la lecture sur ordinateur et mobile :

- buffer glissant jusqu'à **5 chapitres** ;
- navigation **cache-first** : un clic sur le vrai `Next` ouvre d'abord la copie IndexedDB si elle existe, puis le Reader recharge seulement ce qui manque en arrière-plan ;
- conservation du HTML et, lorsque le CDN l'autorise, des images ;
- arrêt propre sur `401`, `403` et `429` ;
- protection contre les liens « suivant » en boucle ;
- **un seul contrôleur adaptatif** représente le Reader : `📚 4/5 → 5/5` pendant le travail du buffer, puis `▶ / ❚❚` pour l'auto-scroll sur les comics ;
- sur un novel, le contrôleur disparaît quand le buffer n'a plus rien à signaler ; en cas de problème il reste visible ;
- la vitesse n'est affichée que pendant son réglage, puis le contrôle redevient compact ;
- auto-scroll comics : **-1000 à 1000 px/s**, pas de **50 px/s** ;
- pendant l'auto-scroll, le contrôle devient presque transparent après un court délai ;
- toucher ou cliquer ailleurs dans la page arrête l'auto-scroll sans bloquer l'action normale du site ;
- le contrôle est déplaçable et sa position est mémorisée **par site et par mode de lecture** : un comic et un novel peuvent donc avoir des positions différentes ;
- l'apparence est générée à partir d'une seule couleur choisie : surface en verre translucide, reflet, bordure dérivée plus sombre et texte noir ou blanc sélectionné automatiquement selon le contraste ;
- sur mobile : tap = play/pause sur comics, swipe vertical = vitesse, appui long puis glisser = déplacement, appui long immobile puis relâcher = réglages ;
- sur ordinateur : clic = play/pause, molette/flèches = vitesse, glisser = déplacement, clic droit = réglages ;
- le panneau se ferme aussi en cliquant ou touchant en dehors.

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

## Contrôles du Reader

| Action | Ordinateur | Mobile / tactile |
| --- | --- | --- |
| Activer / désactiver l'auto-scroll | Clic sur le contrôle ou `Espace` | Tap sur le contrôle |
| Accélérer | `Flèche haut` ou molette vers le haut | Swipe vers le haut en partant du contrôle |
| Ralentir | `Flèche bas` ou molette vers le bas | Swipe vers le bas en partant du contrôle |
| Déplacer le contrôle | Glisser-déposer | Appui long (~450 ms), puis glisser |
| Ouvrir les réglages | Clic droit sur le contrôle | Appui long immobile, puis relâcher |
| Fermer les réglages | `×`, `Échap` ou clic ailleurs | `×` ou tap ailleurs |
| Reprendre la main pendant l'auto-scroll | Cliquer ailleurs dans la page | Toucher / swiper ailleurs dans la page |

Le geste tactile doit commencer sur le contrôle, mais le doigt peut ensuite sortir largement de sa surface grâce au *pointer capture*. La vitesse apparaît uniquement pendant le réglage.

Le contrôleur utilise un thème « verre » dérivé automatiquement de la couleur choisie. Le Reader calcule la bordure et la couleur du texte pour conserver un contraste lisible. La position est enregistrée séparément par site et par mode de lecture.

La purge manuelle du cache n'est pas exposée dans l'interface normale : le buffer se gère automatiquement.

## Compatibilité

Les scripts utilisent le format standard `// ==UserScript==` et des API communes à Tampermonkey et Violentmonkey (`GM_getValue`, `GM_setValue` ou API Web standard).

Certains sites peuvent modifier fortement leur DOM, appliquer une CSP stricte, utiliser des CDN avec CORS restrictif ou changer leurs liens de navigation. Une adaptation ciblée peut alors être nécessaire.

## Licence

Projet personnel fourni en l'état. Vérifiez les conditions d'utilisation des sites sur lesquels vous employez ces scripts.
