# Reader V3 — roadmap et décisions

Ce document est le cahier de route court du Reader. Il sert aussi de point de reprise aux passes automatisées : mettre à jour ce fichier plutôt que créer des journaux dispersés.

## Portée du produit

Le Reader est un outil général de confort de lecture Web, pas uniquement un outil pour le RER ni uniquement mobile.

Cibles :
- ordinateur et mobile ;
- Firefox ;
- navigateurs Chromium et dérivés : Chrome, Edge, Brave, Opera, etc. ;
- userscript via Tampermonkey / Violentmonkey lorsque l'environnement le permet ;
- WebExtension Firefox + Chrome/Chromium en parallèle.

Firefox Android reste aujourd'hui le chemin mobile le mieux testé du projet, mais il ne définit pas à lui seul la cible produit.

## Architecture

Principe : **un seul fichier à installer, plusieurs fichiers à développer**.

- `src/userscript.meta.js` : métadonnées userscript ;
- `src/reader-buffer.ts` : buffer, cache, restauration et UI principale ;
- `src/auto-scroll.ts` : moteur d'auto-scroll ;
- `scripts/build_userscript.py` : transpile les sources TypeScript avec esbuild et assemble le userscript ;
- `RER-Reader.user.js` : artefact généré et URL d'installation stable ;
- `extension/` : packaging WebExtension Firefox + Chromium ;
- `tests/` : régressions légères exécutées en CI ;
- `archive/legacy-userscripts/` : anciens scripts séparés, conservés uniquement pour référence.

La migration des sources vers **TypeScript est effectuée** : les deux modules de développement sont en `.ts`, vérifiés par `tsc --noEmit`, puis transpiles par esbuild avant assemblage. Aucun framework UI. Le userscript généré conserve son URL d’installation et les builds Firefox/Chromium restent dérivés du même artefact canonique.


## État de reprise

- TypeScript : migration structurelle terminée ; `npm run typecheck` doit rester vert avant tout ajout V3 substantiel.
- Build : `npm run build` régénère userscript + extensions ; ne pas éditer les artefacts générés à la main.
- Tests : les régressions statiques lisent désormais les sources TypeScript ; la CI vérifie séparément que les artefacts générés sont à jour.
- Prochaine priorité : **reprise de lecture robuste**, puis Screen Wake Lock.

## Décisions UX du panneau

- la croix de fermeture est supprimée : un clic hors du panneau, y compris sur le bouton Reader, ferme déjà le panneau ;
- première ligne compacte : **Buffer** à gauche, état du buffer/réseau à droite ;
- en développement, garder `Réseau OK` aide au diagnostic ; pour l'UI finale, candidat préféré : rester silencieux lorsque le réseau est normal et signaler explicitement seulement `Hors ligne · cache` ou un problème ;
- deuxième ligne : **Auto-scroll** à gauche, vitesse actuelle au centre, switch à droite ; ne pas afficher le profil novel/comics ni le pas de vitesse ;
- ordre Apparence : couleur, taille, opacité, repères latéraux ;
- **Taille** agit sur le bouton et sur l'enveloppe de largeur disponible pour les repères ;
- **Opacité** agit sur le bouton et sur les repères ;
- **Repères latéraux** règle essentiellement leur largeur (0 = désactivés), dans les bornes influencées par Taille.

## V3 validée

### Reprise de lecture robuste
Mémoriser par site la lecture courante : URL/chapitre + position. Ne pas dépendre uniquement d'un `scrollY` fragile ; conserver aussi un ancrage proche du contenu (paragraphe/élément pour le texte, image/élément pour les comics) et un ratio de secours.

Le cache et la progression sont deux responsabilités séparées :
- cache = contenu disponible hors ligne ;
- progression = endroit exact où reprendre.

IndexedDB est persistant entre fermetures normales du navigateur, mais le cache reste volontairement nettoyable et ne doit pas être la seule source de progression.

### Screen Wake Lock
Quand l'auto-scroll est réellement actif et la vitesse non nulle, demander un Wake Lock si l'API existe. Le relâcher sur pause, vitesse zéro, arrivée en haut/bas, page masquée et sortie. Réacquérir proprement au retour visible si le scroll est toujours actif.

Ajouter des tests de régression autour de l'arrêt automatique en limite de page et de la libération du Wake Lock.

### Focus Mode
Option désactivée par défaut. Atténuer/masquer temporairement les éléments qui gênent la lecture sans supprimer le DOM : headers/nav/aside, gros overlays, éléments fixed/sticky envahissants. Favoriser des heuristiques génériques et de petits adaptateurs de domaine seulement si nécessaire. Restauration immédiate à la désactivation.

### Contrôles canapé / télé
Prévoir clavier/télécommande Bluetooth et Gamepad API : play/pause, vitesse, chapitre précédent/suivant, Focus. La communication téléphone -> autre appareil est une étape séparée et ne doit pas gonfler le userscript de base.

## Buffer adaptatif : décision de conception

Ne **pas** utiliser la qualité du réseau à l'instant T comme prédiction du réseau dans dix minutes : en mobilité ce signal est peu pertinent.

Adapter plutôt avec :
- la taille réellement observée des chapitres et ressources ;
- un budget maximal en octets ;
- `navigator.storage.estimate()` comme garde-fou de quota quand disponible ;
- un maximum de chapitres pour empêcher toute croissance incontrôlée.

Point de départ à tester, pas encore contrat définitif :
- novels : cible ~10 chapitres, plafond ~20 si le contenu reste léger, budget indicatif ~50 Mo ;
- comics : cible ~4 chapitres, plafond ~8, budget indicatif ~300 Mo.

Ces valeurs doivent être ajustées à partir de mesures réelles. Le Reader ne doit jamais remplir le stockage simplement parce que le réseau est momentanément rapide.

## UX à étudier, non validée pour implémentation automatique

### Progression / temps restant
Idée : une information très discrète en bas du panneau, par exemple `62 % · ~8 min`, où le temps signifie **temps avant le bas du chapitre à la vitesse d'auto-scroll actuelle**.

Contraintes :
- ne pas ajouter de barre non interactive si cela surcharge le panneau ;
- éventuellement masquer cette information lorsqu'elle n'apporte rien ;
- sur comics/lazy-loading, l'estimation peut fluctuer ;
- ne pas implémenter sans validation visuelle.

### Night Dimmer
Idée de confort à garder pour plus tard : ajouter un voile local à la page, réglable et mémorisé par site, pour assombrir le contenu au-delà de la luminosité minimale proposée par l'écran ou le système.

Principes :
- ne pas essayer de piloter la luminosité matérielle du téléphone ou de l'ordinateur ;
- privilégier un overlay visuel simple et cross-platform ;
- désactivé par défaut ;
- éviter d'assombrir excessivement le bouton/panneau Reader afin de garder les contrôles lisibles ;
- intérêt surtout sur ordinateur ou pour les écrans encore trop lumineux au minimum ; utilité plus secondaire sur Android où le contrôle système de luminosité est généralement déjà fin.

### TTS / traduction
À garder comme piste expérimentale, pas dans le coeur de V3 pour l'instant. Examiner notamment les retours d'expérience des projets de Samuel Létang avant tout choix d'API ou de modèle.
