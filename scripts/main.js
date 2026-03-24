import {
  MODULE_ID,
  SECONDARY_AOE_DEFAULTS
} from "./constants.js";
import { registerSettings } from "./settings.js";
import {
  clearItemSecondaryAoeConfig,
  getItemSecondaryAoeConfig,
  getSecondaryAoeConfigOptions,
  isItemSecondaryAoeEnabled,
  mergeSecondaryAoeConfig,
  setItemSecondaryAoeConfig
} from "./utils/flags.js";
import {
  getSecondaryAoeTargetTokens,
  resolveSecondaryAoeConfig,
  getSecondaryAoeCandidatesForConfig
} from "./services/secondary-aoe-service.js";
import { resolveSecondaryAoeTargets } from "./services/secondary-aoe-debug.js";
import { buildSecondaryAoeExecutionPlan } from "./services/secondary-aoe-plan-service.js";
import {
  executeLastMidiSecondaryAoePlan,
  executeSecondaryAoePlan
} from "./services/secondary-aoe-execution-service.js";
import {
  clearLastMidiSecondaryAoeExecutionResult,
  clearLastMidiSecondaryAoePlan,
  getLastMidiSecondaryAoeExecutionResult,
  getLastMidiSecondaryAoePlan,
  registerMidiQolIntegration
} from "./integrations/midi-qol.js";
import {
  getCandidateGridSpacesAroundPoint,
  getTokenOccupiedGridSpaces
} from "./services/grid-utils.js";
import {
  inspectItemActivities,
  listItemActivities,
  resolveSecondaryActivity
} from "./services/secondary-activity-service.js";
import {
  applySecondaryAoeAutomationProfile,
  getSecondaryAoeAutomationProfileStatus,
  previewSecondaryAoeAutomationProfile
} from "./services/activity-automation-profile-service.js";
import {
  closeSecondaryAoeConfig,
  getOpenSecondaryAoeConfigItem,
  openSecondaryAoeConfig
} from "./ui/secondary-aoe-config-app.js";
import { registerItemSheetHeaderButton } from "./ui/item-sheet-header-button.js";
import { logger } from "./utils/log.js";

Hooks.once("init", () => {
  registerSettings();
  registerItemSheetHeaderButton();
  logger.debug("module charge");

  game.modules.get(MODULE_ID).api = {
    applySecondaryAoeAutomationProfile,
    buildSecondaryAoeExecutionPlan,
    clearItemSecondaryAoeConfig,
    clearLastMidiSecondaryAoeExecutionResult,
    clearLastMidiSecondaryAoePlan,
    closeSecondaryAoeConfig,
    defaults: SECONDARY_AOE_DEFAULTS,
    executeLastMidiSecondaryAoePlan,
    executeSecondaryAoePlan,
    getCandidateGridSpacesAroundPoint,
    getConfigOptions: getSecondaryAoeConfigOptions,
    getItemSecondaryAoeConfig,
    getLastMidiSecondaryAoeExecutionResult,
    getLastMidiSecondaryAoePlan,
    getOpenSecondaryAoeConfigItem,
    getSecondaryAoeAutomationProfileStatus,
    getSecondaryAoeCandidatesForConfig,
    getSecondaryAoeTargetTokens,
    getTokenOccupiedGridSpaces,
    inspectItemActivities,
    isItemSecondaryAoeEnabled,
    listItemActivities,
    normalizeSecondaryAoeConfig: mergeSecondaryAoeConfig,
    openSecondaryAoeConfig,
    previewSecondaryAoeAutomationProfile,
    resolveSecondaryActivity,
    resolveSecondaryAoeConfig,
    resolveSecondaryAoeTargets,
    setItemSecondaryAoeConfig
  };
});

Hooks.once("ready", () => {
  registerMidiQolIntegration();
});

export { MODULE_ID };
