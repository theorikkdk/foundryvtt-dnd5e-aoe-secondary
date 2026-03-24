import { MODULE_ID, MODULE_SETTINGS } from "./constants.js";

function registerSettings() {
  game.settings.register(MODULE_ID, MODULE_SETTINGS.DEBUG, {
    name: "AOESECONDARY.SETTINGS.DebugName",
    hint: "AOESECONDARY.SETTINGS.DebugHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });
}

export { registerSettings };
