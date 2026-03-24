# foundryvtt-dnd5e-aoe-secondary

Module Foundry VTT v13 pour le systeme dnd5e, pense pour ajouter a terme une gestion d'AoE secondaire sur une arme, un sort ou une capacite.

L'objectif de cette premiere version est volontairement simple :
- fournir un squelette de module propre
- charger correctement dans Foundry VTT
- preparer une base claire pour les futures integrations
- garder le code lisible, testable et facile a faire evoluer

## Etat actuel

La logique metier AoE secondaire reste disponible et testable.
Les services, flags, triggers et l'integration Midi-QOL sont conserves.

L'UI dans la fiche d'item `dnd5e` reste retiree des onglets et panneaux natifs.
Un bouton discret dans le header de la fiche permet maintenant d'ouvrir la fenetre AoE secondaire separee.

## Ouvrir la configuration AoE depuis la fiche d'item

1. Ouvre une fiche d'item `dnd5e`.
2. Clique sur le bouton `AoE secondaire` dans le header de la fenetre.
3. La fenetre de configuration AoE secondaire s'ouvre sans modifier les onglets natifs.

## Ouvrir la configuration AoE depuis la console

Exemple minimal :

```js
const api = game.modules.get("foundryvtt-dnd5e-aoe-secondary").api;
const actor = game.actors.getName("Nom de l'acteur");
const item = actor.items.getName("Nom de l'objet");
api.openSecondaryAoeConfig(item);
```

Fermer la fenetre :

```js
game.modules.get("foundryvtt-dnd5e-aoe-secondary").api.closeSecondaryAoeConfig();
```

Recuperer l'item actuellement edite :

```js
game.modules.get("foundryvtt-dnd5e-aoe-secondary").api.getOpenSecondaryAoeConfigItem();
```

## Verification rapide

1. Recharge Foundry.
2. Ouvre une fiche d'item `dnd5e` et verifie que les onglets natifs fonctionnent normalement.
3. Clique sur `AoE secondaire` dans le header de la fiche.
4. Verifie que la fenetre AoE s'ouvre.
5. Clique de nouveau sur le bouton pour le meme item et verifie que la fenetre est reutilisee proprement.
6. Ouvre la configuration d'un autre item et verifie que la fenetre est remplacee proprement.
7. Teste un item sans activities pour verifier que la fenetre s'ouvre quand meme avec le message `Aucune activite disponible`.
