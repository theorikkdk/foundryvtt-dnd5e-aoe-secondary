import { MODULE_ID, MODULE_SETTINGS } from "../constants.js";

function isDebugEnabled() {
  try {
    return game.settings.get(MODULE_ID, MODULE_SETTINGS.DEBUG) === true;
  } catch (_error) {
    return false;
  }
}

function writeToConsole(method, message, args) {
  console[method](`[AoE Secondary] ${message}`, ...args);
}

const logger = {
  debug(message, ...args) {
    if (!isDebugEnabled()) {
      return;
    }

    writeToConsole("debug", message, args);
  },

  warn(message, ...args) {
    writeToConsole("warn", message, args);
  },

  error(message, ...args) {
    writeToConsole("error", message, args);
  }
};

export {
  isDebugEnabled,
  logger
};
