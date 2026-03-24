import { MODULE_ID } from "../constants.js";
import {
  getItemSecondaryAoeConfig,
  getSecondaryAoeConfigOptions,
  setItemSecondaryAoeConfig
} from "../utils/flags.js";
import { listItemActivities } from "../services/secondary-activity-service.js";

const APP_TEMPLATE = `modules/${MODULE_ID}/templates/apps/secondary-aoe-config-app.hbs`;

let openConfigApp = null;

function isValidItemDocument(item) {
  return Boolean(item && typeof item.getFlag === "function" && typeof item.setFlag === "function");
}

function buildSelectChoices(values, prefix, selectedValue) {
  return values.map((value) => ({
    value,
    label: game.i18n.localize(`${prefix}.${value}`),
    selected: value === selectedValue
  }));
}

function localizeConfigValue(prefix, value) {
  const key = `${prefix}.${value}`;
  return game.i18n.has?.(key) ? game.i18n.localize(key) : value;
}

function buildActivityChoices(item, config) {
  const activities = listItemActivities({ item });

  if (!activities.length) {
    const options = [{
      value: "",
      label: game.i18n.localize("AOESECONDARY.UI.NoActivitiesAvailable"),
      selected: config.secondaryActivityId === ""
    }];

    if (config.secondaryActivityId) {
      options.push({
        value: config.secondaryActivityId,
        label: game.i18n.format("AOESECONDARY.UI.UnknownActivity", { id: config.secondaryActivityId }),
        selected: true
      });
    }

    return {
      hasActivities: false,
      options
    };
  }

  const options = [{
    value: "",
    label: game.i18n.localize("AOESECONDARY.UI.NoSecondaryActivity"),
    selected: config.secondaryActivityId === ""
  }];

  for (const activity of activities) {
    options.push({
      value: activity.id,
      label: activity.name || activity.id,
      selected: activity.id === config.secondaryActivityId
    });
  }

  if (config.secondaryActivityId && !activities.some((activity) => activity.id === config.secondaryActivityId)) {
    options.push({
      value: config.secondaryActivityId,
      label: game.i18n.format("AOESECONDARY.UI.UnknownActivity", { id: config.secondaryActivityId }),
      selected: true
    });
  }

  return { hasActivities: true, options };
}

class SecondaryAoeConfigApp extends FormApplication {
  constructor(item, options = {}) {
    if (!isValidItemDocument(item)) {
      throw new Error(`[${MODULE_ID}] A valid item is required to open the AoE secondary configuration.`);
    }

    super({}, options);
    this.item = item;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: `${MODULE_ID}-config-app`,
      classes: [MODULE_ID, "secondary-aoe-config-app"],
      template: APP_TEMPLATE,
      popOut: true,
      width: 460,
      height: "auto",
      resizable: true,
      closeOnSubmit: false,
      submitOnChange: false,
      submitOnClose: false
    });
  }

  get title() {
    return game.i18n.format("AOESECONDARY.APP.WindowTitle", {
      itemName: this.item?.name ?? ""
    });
  }

  getData(options = {}) {
    const context = super.getData(options);
    const config = getItemSecondaryAoeConfig(this.item);
    const configOptions = getSecondaryAoeConfigOptions();
    const activityChoices = buildActivityChoices(this.item, config);

    context.moduleId = MODULE_ID;
    context.itemName = String(this.item?.name ?? "");
    context.config = config;
    context.triggerChoices = buildSelectChoices(configOptions.trigger, "AOESECONDARY.Trigger", config.trigger);
    context.targetFilterChoices = buildSelectChoices(configOptions.targetFilter, "AOESECONDARY.TargetFilter", config.targetFilter);
    context.activityChoices = activityChoices.options;
    context.hasActivities = activityChoices.hasActivities;
    context.selectionModeLabel = localizeConfigValue("AOESECONDARY.SelectionMode", config.selectionMode);
    context.distanceModeLabel = localizeConfigValue("AOESECONDARY.DistanceMode", config.distanceMode);
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find('[data-action="close"]').on("click", (event) => {
      event.preventDefault();
      this.close();
    });
  }

  async _updateObject(event, formData) {
    const expanded = foundry.utils.expandObject(formData);
    const config = expanded.flags?.[MODULE_ID]?.secondaryAoe ?? {};
    await setItemSecondaryAoeConfig(this.item, config);
    ui.notifications?.info(game.i18n.localize("AOESECONDARY.APP.Saved"));
    await this.close();
  }

  async close(options = {}) {
    const result = await super.close(options);
    if (openConfigApp === this) {
      openConfigApp = null;
    }
    return result;
  }
}

async function openSecondaryAoeConfig(item) {
  if (!isValidItemDocument(item)) {
    throw new Error(`[${MODULE_ID}] openSecondaryAoeConfig requires a valid item document.`);
  }

  if (openConfigApp?.item?.id === item.id && openConfigApp?.item?.parent?.id === item.parent?.id) {
    openConfigApp.render(true);
    openConfigApp.bringToTop?.();
    return openConfigApp;
  }

  if (openConfigApp) {
    await openConfigApp.close();
  }

  openConfigApp = new SecondaryAoeConfigApp(item);
  await openConfigApp.render(true);
  openConfigApp.bringToTop?.();
  return openConfigApp;
}

async function closeSecondaryAoeConfig() {
  if (!openConfigApp) {
    return false;
  }

  await openConfigApp.close();
  return true;
}

function getOpenSecondaryAoeConfigItem() {
  return openConfigApp?.item ?? null;
}

export {
  SecondaryAoeConfigApp,
  closeSecondaryAoeConfig,
  getOpenSecondaryAoeConfigItem,
  openSecondaryAoeConfig
};
