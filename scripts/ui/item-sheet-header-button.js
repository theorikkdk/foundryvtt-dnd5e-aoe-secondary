import { getItemSecondaryAoeConfig } from "../utils/flags.js";
import { openSecondaryAoeConfig } from "./secondary-aoe-config-app.js";

const HEADER_BUTTON_CLASS = "foundryvtt-dnd5e-aoe-secondary-open-button";

function registerItemSheetHeaderButton() {
  Hooks.on("renderItemSheet5e", onRenderItemSheet5e);
}

function getRootElement(app, html) {
  if (app?.element instanceof HTMLElement) {
    return app.element;
  }

  if (app?.element?.[0] instanceof HTMLElement) {
    return app.element[0];
  }

  if (html instanceof HTMLElement) {
    return html;
  }

  if (html?.[0] instanceof HTMLElement) {
    return html[0];
  }

  return null;
}

function findHeaderContainer(root) {
  if (!root) {
    return null;
  }

  const applicationRoot = root.matches?.(".application") ? root : root.closest?.(".application") ?? root;
  const header = applicationRoot.querySelector?.(".window-header");
  if (!header) {
    return null;
  }

  const closeControl = header.querySelector('[data-action="close"], .header-control.close, .window-control.close, .close');
  return {
    header,
    closeControl,
    insertionParent: closeControl?.parentElement ?? header
  };
}

async function onRenderItemSheet5e(app, html) {
  const item = app?.item ?? app?.document ?? app?.object;
  const root = getRootElement(app, html);
  const headerRefs = findHeaderContainer(root);
  if (!item || !headerRefs) {
    return;
  }

  headerRefs.insertionParent.querySelector(`.${HEADER_BUTTON_CLASS}`)?.remove();

  const config = getItemSecondaryAoeConfig(item);
  const isEnabled = config.enabled === true;
  const buttonTag = headerRefs.closeControl?.tagName?.toLowerCase?.() || "button";
  const button = document.createElement(buttonTag);
  button.classList.add("header-control", HEADER_BUTTON_CLASS, isEnabled ? "is-enabled" : "is-disabled");
  button.setAttribute("aria-label", game.i18n.localize("AOESECONDARY.UI.OpenButtonLabel"));
  button.title = game.i18n.localize(
    isEnabled ? "AOESECONDARY.UI.OpenButtonHintEnabled" : "AOESECONDARY.UI.OpenButtonHintDisabled"
  );

  if (buttonTag === "button") {
    button.type = "button";
  } else {
    button.href = "#";
  }

  button.innerHTML = '<i class="fas fa-bullseye" aria-hidden="true"></i>';
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await openSecondaryAoeConfig(item);
  });

  if (headerRefs.closeControl) {
    headerRefs.insertionParent.insertBefore(button, headerRefs.closeControl);
  } else {
    headerRefs.insertionParent.append(button);
  }
}

export { registerItemSheetHeaderButton };
