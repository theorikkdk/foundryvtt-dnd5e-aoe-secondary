import {
  MODULE_FLAGS,
  MODULE_ID,
  SECONDARY_AOE_DEFAULTS,
  SECONDARY_AOE_DISTANCE_MODE_OPTIONS,
  SECONDARY_AOE_SELECTION_MODE_OPTIONS,
  SECONDARY_AOE_SHAPE_OPTIONS,
  SECONDARY_AOE_TARGET_FILTER_OPTIONS,
  SECONDARY_AOE_TRIGGER_OPTIONS
} from "../constants.js";

function isValidItemDocument(item) {
  return Boolean(item && typeof item.getFlag === "function");
}

function normalizeOption(value, allowedValues, fallback) {
  return allowedValues.includes(value) ? value : fallback;
}

function mergeSecondaryAoeConfig(config = {}) {
  const mergedConfig = foundry.utils.mergeObject(
    foundry.utils.deepClone(SECONDARY_AOE_DEFAULTS),
    config ?? {},
    {
      inplace: false,
      insertKeys: true,
      insertValues: true,
      overwrite: true
    }
  );

  mergedConfig.enabled = Boolean(mergedConfig.enabled);
  mergedConfig.radius = Number.isFinite(Number(mergedConfig.radius))
    ? Number(mergedConfig.radius)
    : SECONDARY_AOE_DEFAULTS.radius;
  mergedConfig.includePrimaryTarget = Boolean(mergedConfig.includePrimaryTarget);
  if (mergedConfig.trigger === "afterSave") {
    mergedConfig.trigger = "onFailedSave";
  }
  mergedConfig.trigger = normalizeOption(
    mergedConfig.trigger,
    SECONDARY_AOE_TRIGGER_OPTIONS,
    SECONDARY_AOE_DEFAULTS.trigger
  );
  mergedConfig.secondaryActivityId = String(mergedConfig.secondaryActivityId ?? "");
  mergedConfig.targetFilter = normalizeOption(
    mergedConfig.targetFilter,
    SECONDARY_AOE_TARGET_FILTER_OPTIONS,
    SECONDARY_AOE_DEFAULTS.targetFilter
  );
  mergedConfig.shape = normalizeOption(
    mergedConfig.shape,
    SECONDARY_AOE_SHAPE_OPTIONS,
    SECONDARY_AOE_DEFAULTS.shape
  );
  mergedConfig.showTemplate = Boolean(mergedConfig.showTemplate);
  mergedConfig.distanceMode = normalizeOption(
    mergedConfig.distanceMode,
    SECONDARY_AOE_DISTANCE_MODE_OPTIONS,
    SECONDARY_AOE_DEFAULTS.distanceMode
  );
  mergedConfig.selectionMode = normalizeOption(
    mergedConfig.selectionMode,
    SECONDARY_AOE_SELECTION_MODE_OPTIONS,
    SECONDARY_AOE_DEFAULTS.selectionMode
  );

  return mergedConfig;
}

function getItemSecondaryAoeConfig(item) {
  if (!isValidItemDocument(item)) {
    return mergeSecondaryAoeConfig();
  }

  const storedConfig = item.getFlag(MODULE_ID, MODULE_FLAGS.SECONDARY_AOE) ?? {};
  return mergeSecondaryAoeConfig(storedConfig);
}

async function setItemSecondaryAoeConfig(item, config = {}) {
  if (!isValidItemDocument(item) || typeof item.setFlag !== "function") {
    throw new Error(`[${MODULE_ID}] Unable to set AoE secondary config on an invalid item.`);
  }

  const mergedConfig = mergeSecondaryAoeConfig(config);
  await item.setFlag(MODULE_ID, MODULE_FLAGS.SECONDARY_AOE, mergedConfig);
  return mergedConfig;
}

async function clearItemSecondaryAoeConfig(item) {
  if (!isValidItemDocument(item) || typeof item.unsetFlag !== "function") {
    throw new Error(`[${MODULE_ID}] Unable to clear AoE secondary config on an invalid item.`);
  }

  await item.unsetFlag(MODULE_ID, MODULE_FLAGS.SECONDARY_AOE);
}

function isItemSecondaryAoeEnabled(item) {
  return Boolean(getItemSecondaryAoeConfig(item).enabled);
}

function getSecondaryAoeConfigOptions() {
  return {
    trigger: [...SECONDARY_AOE_TRIGGER_OPTIONS],
    targetFilter: [...SECONDARY_AOE_TARGET_FILTER_OPTIONS],
    shape: [...SECONDARY_AOE_SHAPE_OPTIONS],
    distanceMode: [...SECONDARY_AOE_DISTANCE_MODE_OPTIONS],
    selectionMode: [...SECONDARY_AOE_SELECTION_MODE_OPTIONS]
  };
}

export {
  clearItemSecondaryAoeConfig,
  getSecondaryAoeConfigOptions,
  getItemSecondaryAoeConfig,
  isItemSecondaryAoeEnabled,
  mergeSecondaryAoeConfig,
  setItemSecondaryAoeConfig
};
