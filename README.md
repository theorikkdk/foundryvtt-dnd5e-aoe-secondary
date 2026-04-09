# D&D5e Secondary AoE

Configurable secondary AoE for D&D5e items with Midi-QOL.

AoE secondaire configurable pour les items D&D5e avec Midi-QOL.

## English

Adds a configurable secondary AoE activity to D&D5e items. The module integrates with complete Midi-QOL workflows to automatically apply a secondary activity around the primary target.

### General Principle

- The primary `dnd5e` item flow stays in place.
- A separate Secondary AoE configuration defines the radius, trigger, target filter, and linked secondary activity.
- Automatic execution is designed for complete Midi-QOL workflows rather than chat-card-only usage.

### Midi-QOL Prerequisites

- `socketlib` is required by the module.
- `midi-qol` is strongly recommended for automatic triggering.
- Player-side Midi-QOL must run a complete workflow that reaches the supported completion hooks.

### Open the AoE Configuration

1. Open a `dnd5e` item sheet.
2. Click `Secondary AoE` in the sheet header.
3. Edit the configuration in the dedicated window and save.

### Current MVP Limits

- The current MVP uses creature-based selection around the target.
- The current MVP uses center-to-center distance measurement.
- Automatic triggering depends on a complete Midi-QOL workflow.
- This publication-preparation pass does not change the AoE engine, triggers, GM/PJ support, functional UI, or current socket architecture.

### Before Foundry Publication

- Add the public `manifest` URL to `module.json`.
- Add the public `download` URL to `module.json`.
- Create the GitHub release archive that will be used by the `download` URL.

## Francais

Ajoute une activite d'AoE secondaire configurable aux items D&D5e. Le module s'integre aux workflows complets de Midi-QOL pour appliquer automatiquement une activite secondaire autour de la cible principale.

### Principe General

- Le flux principal de l'item `dnd5e` reste en place.
- Une configuration AoE secondaire separee definit le rayon, le declenchement, le filtre de cibles et l'activite secondaire liee.
- Le declenchement automatique est pense pour les workflows complets de Midi-QOL, pas pour une simple carte de chat.

### Prerequis Midi-QOL

- `socketlib` est requis par le module.
- `midi-qol` est fortement recommande pour le declenchement automatique.
- Cote joueur, Midi-QOL doit executer un workflow complet jusqu'aux hooks de fin supportes.

### Ouvrir La Configuration AoE

1. Ouvre une fiche d'item `dnd5e`.
2. Clique sur `AoE secondaire` dans le header de la fiche.
3. Modifie la configuration dans la fenetre dediee puis enregistre.

### Limites Actuelles Du MVP

- Le MVP actuel utilise une selection autour de la creature cible.
- Le MVP actuel utilise une mesure centre a centre.
- Le declenchement automatique depend d'un workflow Midi-QOL complet.
- Cette passe de preparation publication ne modifie ni le moteur AoE, ni les triggers, ni le support GM/PJ, ni l'UI fonctionnelle, ni l'architecture socket actuelle.

### Avant Publication Foundry

- Ajouter l'URL publique du `manifest` dans `module.json`.
- Ajouter l'URL publique du `download` dans `module.json`.
- Creer l'archive de release GitHub qui sera referencee par l'URL `download`.
