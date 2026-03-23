# foundryvtt-dnd5e-aoe-secondary

Module Foundry VTT v13 pour le systeme dnd5e, pense pour ajouter a terme une gestion d'AoE secondaire sur une arme, un sort ou une capacite.

L'objectif de cette premiere version est volontairement simple :
- fournir un squelette de module propre
- charger correctement dans Foundry VTT
- preparer une base claire pour les futures integrations
- garder le code lisible, testable et facile a faire evoluer

Ce module ne contient pas encore :
- d'interface de configuration sur les items
- de logique d'AoE secondaire
- d'automatisation Midi-QOL

## Etat actuel

Le module charge un script principal, une feuille de style et des traductions francaises.
Au chargement de Foundry, il ecrit le message suivant dans la console :

`[AoE Secondary] module charge`

## Cible technique

- Foundry VTT v13
- Systeme `dnd5e`
- Integration prevue avec `midi-qol`

## Roadmap

- AoE secondaire sur arme / sort / capacite
- rayon / distance
- inclure ou exclure la cible principale
- selection de l'activite secondaire
- integration Midi-QOL

## Structure

- `module.json` : manifest du module
- `scripts/main.js` : point d'entree principal
- `styles/module.css` : styles du module
- `lang/fr.json` : traductions francaises

