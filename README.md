Voici un README court, prêt à coller dans `README.md`, basé sur la version actuelle du script.

# Auto Scroll Manga / Manhua / Comics

Userscript Tampermonkey ajoutant un bouton flottant pour faire défiler automatiquement les pages de manga, manhua, manhwa, webtoon et comics.

## Fonctionnalités

* Défilement automatique vers le haut ou vers le bas
* Vitesse réglable de `-1000` à `1000 px/s`
* Pause temporaire à `0 px/s` sans désactiver l’auto-scroll
* Arrêt automatique en haut ou en bas de la page
* Bouton flottant déplaçable
* Mémorisation de la vitesse et de la position du bouton
* Tentative de passage en plein écran au démarrage
* Désactivation du `scroll-behavior: smooth` pendant le défilement
* Exécution uniquement dans la frame principale

## Commandes

| Action                              | Commande                       |
| ----------------------------------- | ------------------------------ |
| Activer ou désactiver l’auto-scroll | Clic sur le bouton ou `Espace` |
| Augmenter la vitesse                | `Flèche haut`                  |
| Diminuer la vitesse                 | `Flèche bas`                   |
| Modifier la vitesse à la souris     | Molette sur le bouton          |
| Déplacer le bouton                  | Glisser-déposer                |

Les raccourcis clavier sont ignorés lorsqu’un champ de saisie ou un élément interactif est utilisé.

## Installation

1. Installer une extension compatible avec les userscripts, par exemple Tampermonkey.
2. Créer un nouveau script.
3. Remplacer son contenu par celui du fichier JavaScript de ce dépôt.
4. Enregistrer le script.

## Ciblage des sites

Le script est activé lorsque l’URL contient l’un des termes suivants :

`manga`, `manhua`, `manhwa`, `webtoon`, `comic`, `comics`, `webcomic`, `scantrad` ou `hentai`.

Le filtrage utilise `@include`, car `@match` ne permet pas de rechercher librement un mot à l’intérieur de n’importe quel nom de domaine.

## Remarques

* Certains navigateurs ou sites peuvent refuser le passage en plein écran. L’auto-scroll continue alors de fonctionner normalement.
* Les pages qui modifient fortement leur hauteur pendant le chargement peuvent provoquer une légère resynchronisation de la position.
* Certains sites peuvent réagir à la présence de Tampermonkey indépendamment de ce userscript.

## Licence

Projet personnel fourni en l’état. Libre à vous de l’adapter à vos besoins.
