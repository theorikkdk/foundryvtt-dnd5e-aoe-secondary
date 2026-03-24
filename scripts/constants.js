const MODULE_ID = "foundryvtt-dnd5e-aoe-secondary";

const MODULE_FLAGS = {
  SECONDARY_AOE: "secondaryAoe"
};

const MODULE_SETTINGS = {
  DEBUG: "debugMode"
};

const SECONDARY_AOE_TRIGGER_OPTIONS = [
  "always",
  "onHit",
  "onFailedSave",
  "onComplete"
];

const SECONDARY_AOE_TARGET_FILTER_OPTIONS = [
  "any",
  "ally",
  "enemy"
];

const SECONDARY_AOE_SHAPE_OPTIONS = [
  "burst"
];

const SECONDARY_AOE_DISTANCE_MODE_OPTIONS = [
  "center",
  "edge"
];

const SECONDARY_AOE_SELECTION_MODE_OPTIONS = [
  "creatureDistance",
  "gridAreaHalfSquare"
];

const SECONDARY_AOE_DEFAULTS = {
  enabled: false,
  radius: 1.5,
  includePrimaryTarget: false,
  trigger: "onHit",
  secondaryActivityId: "",
  targetFilter: "any",
  shape: "burst",
  showTemplate: false,
  distanceMode: "center",
  selectionMode: "creatureDistance"
};

export {
  MODULE_ID,
  MODULE_FLAGS,
  MODULE_SETTINGS,
  SECONDARY_AOE_DEFAULTS,
  SECONDARY_AOE_DISTANCE_MODE_OPTIONS,
  SECONDARY_AOE_SELECTION_MODE_OPTIONS,
  SECONDARY_AOE_SHAPE_OPTIONS,
  SECONDARY_AOE_TARGET_FILTER_OPTIONS,
  SECONDARY_AOE_TRIGGER_OPTIONS
};
