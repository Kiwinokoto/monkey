# Monkey

Reader de confort pour la lecture sur le Web, distribué en userscript et en WebExtension expérimentale. Il est conçu pour la lecture sur ordinateur comme sur mobile, à la maison comme en déplacement.

Compatibles avec **Violentmonkey** et **Tampermonkey**.

## Installation rapide

### Recommandé : un seul script de lecture

- ⭐ [Installer RER Reader](https://raw.githubusercontent.com/Kiwinokoto/monkey/refs/heads/main/RER-Reader.user.js)

**RER Reader** active :

- le **buffer cache-first adaptatif** sur les lecteurs de novels, mangas, manhua, manhwa, webtoons et comics ;
- le vrai bouton **Next** du site sert directement le chapitre depuis le cache lorsqu'il est prêt, même si le téléphone pense encore être en ligne ;
- l'**auto-scroll sur comics et novels**, avec deux profils adaptés : rapide pour les lecteurs d'images, lent et fin pour le texte ;
- il est **activé par défaut sur les comics** et **désactivé par défaut sur les novels**, puis configurable site par site dans le panneau Reader.

Il remplace donc, pour cet usage, l'installation simultanée de `RER Reading Buffer` + `Auto Scroll Comics`.

### Anciennes versions séparées

Les anciens scripts buffer/comics/novels sont conservés sous `archive/legacy-userscripts/` uniquement pour référence historique. Le Reader unifié est le seul userscript recommandé.

Avec Violentmonkey ou Tampermonkey installé, ouvre le lien du Reader puis clique sur **Installer** / **Mettre à jour**. Si le navigateur affiche seulement le code brut, utilise **Install from URL / Installer depuis une URL** dans le gestionnaire de userscripts.

> **Anciennes versions de développement** — le Reader a été renommé pendant sa conception. Si ton gestionnaire contient encore un script nommé `RER Reader — Buffer + Comic Auto Scroll`, désactive-le ou supprime-le avant d'installer la version actuelle `RER Reader`. À partir de la v1.4.3, le nom et le namespace sont stabilisés et le script déclare explicitement ses URLs de téléchargement et de mise à jour.

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

- buffer glissant **adaptatif** selon la taille observée, le budget local et le quota disponible ;
- navigation **cache-first** : un clic sur le vrai `Next` ouvre d'abord la copie IndexedDB si elle existe, puis le Reader recharge seulement ce qui manque en arrière-plan ;
- conservation du HTML et, lorsque le CDN l'autorise, des images ;
- arrêt propre sur `401`, `403` et `429` ;
- protection contre les liens « suivant » en boucle ;
- **un seul contrôleur adaptatif** représente le Reader : `📚 0/8 → 8/8` (ou une autre cible calculée) pendant le travail du buffer, puis `▶ / ❚❚` lorsque l'auto-scroll est activé ;
- sur un novel, l'auto-scroll est désactivé par défaut : après le buffer, le contrôle se réduit à un petit `⚙` très discret pour garder un accès aux réglages ; en cas de problème il redevient clairement visible ;
- la vitesse n'est affichée que pendant son réglage, puis le contrôle redevient compact ;
- auto-scroll comics : **-1000 à 1000 px/s**, pas de **50 px/s** ;
- auto-scroll novels : **-300 à 300 px/s**, pas de **5 px/s entre -20 et +20**, puis **10 px/s** au-delà, vitesse initiale **40 px/s** ;
- les préférences du Reader sont mémorisées **par site** : activation, vitesse, couleur, opacité, taille, position et repères latéraux peuvent donc être différents d'un site à l'autre ;
- pendant l'auto-scroll, le contrôle devient presque transparent après un court délai ;
- des **repères latéraux fixes** optionnels peuvent encadrer la lecture : un unique curseur, désactivé par défaut et mémorisé par site, augmente progressivement leur présence, leur largeur et leur fondu ; une ondulation fixe très discrète et quelques points lumineux renforcent le repère périphérique, toujours dans la couleur du thème ;
- toucher ou cliquer ailleurs dans la page arrête l'auto-scroll sans bloquer l'action normale du site ;
- le contrôle est déplaçable et sa position est mémorisée **par site** ;
- l'apparence est générée à partir d'une seule couleur choisie : surface en verre translucide, reflet, bordure dérivée plus sombre et texte noir ou blanc sélectionné automatiquement selon le contraste ;
- l'opacité et la taille sont réglées par sliders ; la taille est continue de **36 à 68 px** plutôt que limitée à trois presets ;
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
| Démarrer / arrêter l'auto-scroll (s'il est activé) | Clic sur le contrôle ou `Espace` | Tap sur le contrôle |
| Accélérer | `Flèche haut` ou molette vers le haut | Swipe vers le haut en partant du contrôle |
| Ralentir | `Flèche bas` ou molette vers le bas | Swipe vers le bas en partant du contrôle |
| Déplacer le contrôle | Glisser-déposer | Appui long (~450 ms), puis glisser |
| Ouvrir les réglages | Clic droit sur le contrôle | Appui long immobile, puis relâcher |
| Activer / désactiver la fonction auto-scroll | Switch dans le panneau Reader | Switch dans le panneau Reader |
| Fermer les réglages | `×`, `Échap` ou clic ailleurs | `×` ou tap ailleurs |
| Reprendre la main pendant l'auto-scroll | Cliquer ailleurs dans la page | Toucher / swiper ailleurs dans la page |

Le geste tactile doit commencer sur le contrôle, mais le doigt peut ensuite sortir largement de sa surface grâce au *pointer capture*. La vitesse apparaît uniquement pendant le réglage.

Le contrôleur utilise un thème « verre » dérivé automatiquement de la couleur choisie. Le Reader calcule la bordure et la couleur du texte pour conserver un contraste lisible. Les préférences d'apparence, de position et d'auto-scroll sont enregistrées séparément pour chaque site.

Le panneau Reader contient aussi le switch d'auto-scroll. Le profil **comics** utilise de grands pas et une large plage de vitesses ; le profil **novels** utilise des pas fins de 5 px/s entre -20 et +20, puis 10 px/s au-delà.

La purge manuelle du cache n'est pas exposée dans l'interface normale : le buffer se gère automatiquement.

## Extension navigateur expérimentale

Le Reader existe aussi sous forme de **WebExtension Manifest V3** pour Firefox
et Chrome/Chromium dans le dossier `extension/`.

Le code fonctionnel est développé sous `src/`, puis assemblé en un unique
`RER-Reader.user.js` installable. L'extension réutilise ensuite cet artefact
pour produire Firefox et Chrome/Chromium. Pour reconstruire l'ensemble :

```bash
python scripts/build_userscript.py
python extension/build_extension.py
```

Firefox déclare explicitement le support Android et **aucune collecte de
données** pour une future soumission à Mozilla Add-ons (AMO). La CI reconstruit
les deux variantes, valide le JavaScript et les manifests, puis passe
`web-ext lint` sur le package Firefox.

Pour l’instant, la méthode **Firefox + Violentmonkey + userscript** reste la
plus simple sur Android tant que l’extension n’est pas signée/publiée.

Voir aussi : [politique de confidentialité](PRIVACY.md).

## Compatibilité

Le Reader cible **ordinateur et mobile**, sur **Firefox et navigateurs Chromium/dérivés** (Chrome, Edge, Brave, Opera, etc.) autant que les API et gestionnaires de userscripts du navigateur le permettent. Firefox Android est aujourd'hui le chemin mobile le mieux testé, mais le produit n'est ni mobile-only ni Firefox-only.

Le userscript utilise le format standard `// ==UserScript==` et des API communes à Tampermonkey et Violentmonkey (`GM_getValue`, `GM_setValue` ou API Web standard). La WebExtension est construite séparément pour Firefox et Chrome/Chromium.

Voir aussi : [roadmap V3](docs/ROADMAP.md).

Certains sites peuvent modifier fortement leur DOM, appliquer une CSP stricte, utiliser des CDN avec CORS restrictif ou changer leurs liens de navigation. Une adaptation ciblée peut alors être nécessaire.

## Licence

Projet personnel fourni en l'état. Vérifiez les conditions d'utilisation des sites sur lesquels vous employez ces scripts.
