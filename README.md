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
Un bouton discret dans le header de la fiche permet d'ouvrir la fenetre AoE secondaire separee.

## Mode debug

Le module propose un reglage simple : `Activer le mode debug AoE secondaire`.

Usage normal :
- seuls les warnings utiles et les erreurs importantes apparaissent en console
- les logs detailles restent silencieux

Mode debug active :
- les logs detailles du module sont affiches dans la console Foundry
- utile pour suivre le branchement Midi-QOL, les triggers ignores et les resolutions internes

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

## Profil automation AoE

Le module peut maintenant appliquer un profil de reglages prudent sur l'activite primaire et l'activite secondaire d'un item.
L'objectif est de reserver l'activite secondaire a l'automation AoE et de couper les chainages automatiques dangereux au niveau des activities.

Reglages vises :
- activite primaire : `Use Other Activity = off`, `Trigger Activity = none`, `Override action type = false`
- activite secondaire : `Automation Only = true`, `Use Other Activity = off`, `Trigger Activity = none`, `Override action type = false`, `Other Activity Compatible = false`

Depuis la fenetre AoE secondaire :
1. Ouvre la fenetre AoE sur un item.
2. Choisis l'activite secondaire et enregistre si besoin.
3. Clique sur `Appliquer reglages automation AoE`.
4. Le module sauvegarde d'abord la config AoE en cours, puis tente d'appliquer le profil sur les activities.
5. Une notification indique un resultat `succes`, `partiel` ou `echec`.

Depuis la console :

```js
const api = game.modules.get("foundryvtt-dnd5e-aoe-secondary").api;
const actor = game.actors.getName("Nom de l'acteur");
const item = actor.items.getName("Nom de l'objet");
api.previewSecondaryAoeAutomationProfile(item);
await api.applySecondaryAoeAutomationProfile(item);
```

Le patch est volontairement defensif :
- si une propriete n'existe pas sur un type d'activity, le module ne plante pas
- le resultat indique ce qui a ete applique ou non
- aucun rollback automatique n'est tente pour l'instant

## Verification rapide

1. Recharge Foundry.
2. Ouvre une fiche d'item `dnd5e` et verifie que les onglets natifs fonctionnent normalement.
3. Clique sur `AoE secondaire` dans le header de la fiche.
4. Verifie que la fenetre AoE s'ouvre.
5. Configure une activite secondaire, puis clique sur `Appliquer reglages automation AoE`.
6. Verifie la notification de resultat, puis controle l'item et ses activities.
7. Active ou desactive ensuite le mode debug dans les parametres du module si tu veux plus de details en console.
8. Teste un item sans activities pour verifier que la fenetre s'ouvre quand meme avec le message `Aucune activite disponible`.
