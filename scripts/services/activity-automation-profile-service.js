import { getItemSecondaryAoeConfig } from "../utils/flags.js";
import {
  resolvePrimaryActivity,
  resolveSecondaryActivity
} from "./secondary-activity-service.js";
import { logger } from "../utils/log.js";

const PRIMARY_ACTIVITY_PROFILE_FIELDS = [
  {
    key: "useOtherActivity",
    label: "Use Other Activity",
    pathCandidates: ["otherActivityId"],
    desiredValue: "none"
  },
  {
    key: "triggerActivity",
    label: "Trigger Activity",
    pathCandidates: ["midiProperties.triggeredActivityId"],
    desiredValue: "none"
  },
  {
    key: "overrideActionType",
    label: "Override action type",
    pathCandidates: ["otherActivityAsParentType", "midiProperties.otherActivityAsParentType"],
    desiredValue: false
  }
];

const SECONDARY_ACTIVITY_PROFILE_FIELDS = [
  {
    key: "automationOnly",
    label: "Automation Only",
    pathCandidates: ["midiProperties.automationOnly"],
    desiredValue: true
  },
  ...PRIMARY_ACTIVITY_PROFILE_FIELDS,
  {
    key: "otherActivityCompatible",
    label: "Other Activity Compatible",
    pathCandidates: ["midiProperties.otherActivityCompatible"],
    desiredValue: false
  }
];

function getActivitySnapshot(activity) {
  if (!activity) {
    return {};
  }

  if (typeof activity.toObject === "function") {
    return activity.toObject();
  }

  return foundry.utils.deepClone(activity);
}

function getPathValue(source, path) {
  if (!source || !path) {
    return undefined;
  }

  return foundry.utils.getProperty(source, path);
}

function hasSimpleProperty(source, path) {
  if (!source || !path || path.includes(".")) {
    return false;
  }

  return typeof source[path] !== "undefined";
}

function resolveWritablePath(activity, snapshot, pathCandidates = []) {
  for (const path of pathCandidates) {
    const snapshotValue = getPathValue(snapshot, path);
    if (typeof snapshotValue !== "undefined") {
      return path;
    }

    const activityValue = getPathValue(activity, path);
    if (typeof activityValue !== "undefined") {
      return path;
    }

    if (hasSimpleProperty(activity, path)) {
      return path;
    }
  }

  return null;
}

function getCurrentFieldValue(activity, snapshot, path) {
  const snapshotValue = getPathValue(snapshot, path);
  if (typeof snapshotValue !== "undefined") {
    return snapshotValue;
  }

  return getPathValue(activity, path);
}

function buildFieldPatch(activity, snapshot, fieldDefinition) {
  const path = resolveWritablePath(activity, snapshot, fieldDefinition.pathCandidates);
  if (!path) {
    return {
      key: fieldDefinition.key,
      label: fieldDefinition.label,
      path: null,
      available: false,
      changed: false,
      alreadyConfigured: false,
      currentValue: undefined,
      desiredValue: fieldDefinition.desiredValue,
      reason: "Property path not available on this activity."
    };
  }

  const currentValue = getCurrentFieldValue(activity, snapshot, path);
  const changed = currentValue !== fieldDefinition.desiredValue;

  return {
    key: fieldDefinition.key,
    label: fieldDefinition.label,
    path,
    available: true,
    changed,
    alreadyConfigured: !changed,
    currentValue,
    desiredValue: fieldDefinition.desiredValue,
    reason: changed ? "Will update field." : "Already configured."
  };
}

function buildActivityProfilePatch({ activity, activitySummary, role, fieldDefinitions }) {
  if (!activity) {
    return {
      role,
      activity: null,
      activitySummary: activitySummary ?? null,
      fieldResults: [],
      flatUpdateData: {},
      updateData: {},
      changedFieldCount: 0,
      applicableFieldCount: 0,
      unavailableFieldCount: 0,
      alreadyConfigured: false,
      canPatch: false
    };
  }

  const snapshot = getActivitySnapshot(activity);
  const fieldResults = fieldDefinitions.map((fieldDefinition) => buildFieldPatch(activity, snapshot, fieldDefinition));
  const flatUpdateData = {};

  for (const fieldResult of fieldResults) {
    if (fieldResult.available && fieldResult.changed && fieldResult.path) {
      flatUpdateData[fieldResult.path] = fieldResult.desiredValue;
    }
  }

  return {
    role,
    activity,
    activitySummary: activitySummary ?? null,
    fieldResults,
    flatUpdateData,
    updateData: foundry.utils.expandObject(flatUpdateData),
    changedFieldCount: fieldResults.filter((fieldResult) => fieldResult.changed).length,
    applicableFieldCount: fieldResults.filter((fieldResult) => fieldResult.available).length,
    unavailableFieldCount: fieldResults.filter((fieldResult) => !fieldResult.available).length,
    alreadyConfigured: fieldResults.every((fieldResult) => !fieldResult.available || fieldResult.alreadyConfigured),
    canPatch: fieldResults.some((fieldResult) => fieldResult.available)
  };
}

function previewSecondaryAoeAutomationProfile(item) {
  const config = getItemSecondaryAoeConfig(item);
  const warnings = [];
  const errors = [];

  if (!item) {
    return {
      ok: false,
      canApply: false,
      itemName: "",
      config,
      primaryActivityId: "",
      secondaryActivityId: "",
      primaryActivity: null,
      secondaryActivity: null,
      primaryActivitySummary: null,
      secondaryActivitySummary: null,
      primaryPatch: buildActivityProfilePatch({ role: "primary", fieldDefinitions: PRIMARY_ACTIVITY_PROFILE_FIELDS }),
      secondaryPatch: buildActivityProfilePatch({ role: "secondary", fieldDefinitions: SECONDARY_ACTIVITY_PROFILE_FIELDS }),
      warnings,
      errors: ["Item is required."],
      reason: "Item is required."
    };
  }

  const primaryResolution = resolvePrimaryActivity({ item });
  const secondaryResolution = resolveSecondaryActivity({ item, secondaryActivityId: config.secondaryActivityId });

  if (!primaryResolution.found) {
    errors.push(primaryResolution.error || "Primary activity could not be resolved.");
  }

  if (!config.secondaryActivityId) {
    errors.push("No secondaryActivityId is configured on this item.");
  }

  if (!secondaryResolution.found) {
    errors.push(secondaryResolution.error || "Secondary activity could not be resolved.");
  }

  if (
    primaryResolution.found
    && secondaryResolution.found
    && primaryResolution.primaryActivityId
    && secondaryResolution.secondaryActivityId
    && primaryResolution.primaryActivityId === secondaryResolution.secondaryActivityId
  ) {
    errors.push("Primary and secondary activities must be different.");
  }

  const primaryPatch = buildActivityProfilePatch({
    activity: primaryResolution.activity,
    activitySummary: primaryResolution.activitySummary,
    role: "primary",
    fieldDefinitions: PRIMARY_ACTIVITY_PROFILE_FIELDS
  });

  const secondaryPatch = buildActivityProfilePatch({
    activity: secondaryResolution.activity,
    activitySummary: secondaryResolution.activitySummary,
    role: "secondary",
    fieldDefinitions: SECONDARY_ACTIVITY_PROFILE_FIELDS
  });

  if (primaryPatch.unavailableFieldCount > 0) {
    warnings.push("Some primary activity fields are not available on this activity type.");
  }

  if (secondaryPatch.unavailableFieldCount > 0) {
    warnings.push("Some secondary activity fields are not available on this activity type.");
  }

  if (primaryResolution.found && !primaryPatch.canPatch) {
    warnings.push("No writable automation profile field was found on the primary activity.");
  }

  if (secondaryResolution.found && !secondaryPatch.canPatch) {
    warnings.push("No writable automation profile field was found on the secondary activity.");
  }

  const canApply = errors.length === 0 && primaryPatch.canPatch && secondaryPatch.canPatch;

  return {
    ok: errors.length === 0,
    canApply,
    itemName: String(item?.name ?? ""),
    config,
    primaryActivityId: String(primaryResolution.primaryActivityId ?? ""),
    secondaryActivityId: String(secondaryResolution.secondaryActivityId ?? config.secondaryActivityId ?? ""),
    primaryActivity: primaryResolution.activity ?? null,
    secondaryActivity: secondaryResolution.activity ?? null,
    primaryActivitySummary: primaryResolution.activitySummary ?? null,
    secondaryActivitySummary: secondaryResolution.activitySummary ?? null,
    primaryPatch,
    secondaryPatch,
    warnings,
    errors,
    reason: canApply ? null : errors[0] ?? "Automation profile preview is not ready."
  };
}

async function updateActivityDocument({ activity, flatUpdateData }) {
  if (!activity) {
    return {
      ok: false,
      method: null,
      error: "Activity is required."
    };
  }

  if (!flatUpdateData || Object.keys(flatUpdateData).length === 0) {
    return {
      ok: true,
      method: "noop",
      error: null
    };
  }

  const updateData = foundry.utils.expandObject(flatUpdateData);

  if (typeof activity.update === "function") {
    await activity.update(updateData);
    return {
      ok: true,
      method: "activity.update",
      error: null
    };
  }

  const parentItem = activity.item ?? activity.parent ?? null;
  if (parentItem && typeof parentItem.updateEmbeddedDocuments === "function" && activity.id) {
    const documentName = String(activity.documentName ?? "Activity");
    await parentItem.updateEmbeddedDocuments(documentName, [{ _id: activity.id, ...updateData }]);
    return {
      ok: true,
      method: `${documentName}.updateEmbeddedDocuments`,
      error: null
    };
  }

  return {
    ok: false,
    method: null,
    error: "No supported activity update method was found."
  };
}

async function applyPatchResult(patch) {
  const targetName = patch?.activitySummary?.name || patch?.activitySummary?.id || patch?.role || "activity";

  if (!patch?.activity) {
    return {
      role: String(patch?.role ?? "activity"),
      activityId: String(patch?.activitySummary?.id ?? ""),
      activitySummary: patch?.activitySummary ?? null,
      attempted: false,
      applied: false,
      updated: false,
      alreadyConfigured: false,
      method: null,
      updatedPaths: [],
      skippedFields: [],
      error: "Activity is missing."
    };
  }

  if (!patch.canPatch) {
    return {
      role: patch.role,
      activityId: String(patch.activitySummary?.id ?? ""),
      activitySummary: patch.activitySummary ?? null,
      attempted: false,
      applied: false,
      updated: false,
      alreadyConfigured: false,
      method: null,
      updatedPaths: [],
      skippedFields: patch.fieldResults.filter((fieldResult) => !fieldResult.available).map((fieldResult) => fieldResult.label),
      error: `No writable automation profile field was found on ${targetName}.`
    };
  }

  if (Object.keys(patch.flatUpdateData).length === 0) {
    return {
      role: patch.role,
      activityId: String(patch.activitySummary?.id ?? ""),
      activitySummary: patch.activitySummary ?? null,
      attempted: true,
      applied: true,
      updated: false,
      alreadyConfigured: true,
      method: "noop",
      updatedPaths: [],
      skippedFields: patch.fieldResults.filter((fieldResult) => !fieldResult.available).map((fieldResult) => fieldResult.label),
      error: null
    };
  }

  try {
    const updateResult = await updateActivityDocument({
      activity: patch.activity,
      flatUpdateData: patch.flatUpdateData
    });

    if (!updateResult.ok) {
      return {
        role: patch.role,
        activityId: String(patch.activitySummary?.id ?? ""),
        activitySummary: patch.activitySummary ?? null,
        attempted: true,
        applied: false,
        updated: false,
        alreadyConfigured: false,
        method: updateResult.method,
        updatedPaths: [],
        skippedFields: patch.fieldResults.filter((fieldResult) => !fieldResult.available).map((fieldResult) => fieldResult.label),
        error: updateResult.error
      };
    }

    return {
      role: patch.role,
      activityId: String(patch.activitySummary?.id ?? ""),
      activitySummary: patch.activitySummary ?? null,
      attempted: true,
      applied: true,
      updated: true,
      alreadyConfigured: false,
      method: updateResult.method,
      updatedPaths: Object.keys(patch.flatUpdateData),
      skippedFields: patch.fieldResults.filter((fieldResult) => !fieldResult.available).map((fieldResult) => fieldResult.label),
      error: null
    };
  } catch (error) {
    logger.warn(`Automation profile patch failed on ${targetName}.`, error);

    return {
      role: patch.role,
      activityId: String(patch.activitySummary?.id ?? ""),
      activitySummary: patch.activitySummary ?? null,
      attempted: true,
      applied: false,
      updated: false,
      alreadyConfigured: false,
      method: null,
      updatedPaths: [],
      skippedFields: patch.fieldResults.filter((fieldResult) => !fieldResult.available).map((fieldResult) => fieldResult.label),
      error: String(error?.message ?? error ?? "Unknown update error.")
    };
  }
}

async function applySecondaryAoeAutomationProfile(item) {
  const preview = previewSecondaryAoeAutomationProfile(item);

  if (!preview.canApply) {
    return {
      applied: false,
      status: "failed",
      reason: preview.reason ?? "Automation profile is not ready.",
      itemName: preview.itemName,
      primaryActivityId: preview.primaryActivityId,
      secondaryActivityId: preview.secondaryActivityId,
      primaryResult: null,
      secondaryResult: null,
      preview
    };
  }

  const primaryResult = await applyPatchResult(preview.primaryPatch);
  const secondaryResult = await applyPatchResult(preview.secondaryPatch);
  const resultEntries = [primaryResult, secondaryResult];
  const appliedCount = resultEntries.filter((entry) => entry?.applied).length;
  const updatedCount = resultEntries.filter((entry) => entry?.updated).length;
  const failedEntries = resultEntries.filter((entry) => !entry?.applied);

  let status = "success";
  let reason = null;

  if (failedEntries.length === resultEntries.length) {
    status = "failed";
    reason = failedEntries[0]?.error ?? "Automation profile could not be applied.";
  } else if (failedEntries.length > 0) {
    status = "partial";
    reason = failedEntries.map((entry) => entry.error).filter(Boolean).join(" ");
  }

  const applied = status !== "failed";

  logger.debug(`Automation profile ${status} for ${preview.itemName || "item"}.`, {
    primaryResult,
    secondaryResult
  });

  return {
    applied,
    status,
    reason,
    itemName: preview.itemName,
    primaryActivityId: preview.primaryActivityId,
    secondaryActivityId: preview.secondaryActivityId,
    primaryResult,
    secondaryResult,
    appliedCount,
    updatedCount,
    preview
  };
}

function getSecondaryAoeAutomationProfileStatus(item) {
  const preview = previewSecondaryAoeAutomationProfile(item);

  return {
    itemName: preview.itemName,
    enabled: Boolean(preview.config?.enabled),
    canApply: preview.canApply,
    primaryActivityId: preview.primaryActivityId,
    secondaryActivityId: preview.secondaryActivityId,
    primaryChangedFieldCount: preview.primaryPatch.changedFieldCount,
    secondaryChangedFieldCount: preview.secondaryPatch.changedFieldCount,
    primaryUnavailableFieldCount: preview.primaryPatch.unavailableFieldCount,
    secondaryUnavailableFieldCount: preview.secondaryPatch.unavailableFieldCount,
    warnings: preview.warnings,
    errors: preview.errors,
    preview
  };
}

export {
  applySecondaryAoeAutomationProfile,
  getSecondaryAoeAutomationProfileStatus,
  previewSecondaryAoeAutomationProfile
};
