import { getItemSecondaryAoeConfig } from "../utils/flags.js";

function normalizeActivityContainer(container) {
  if (!container) {
    return [];
  }

  if (Array.isArray(container.contents) && container.contents.length > 0) {
    return container.contents.filter(Boolean);
  }

  if (typeof container.values === "function") {
    const values = Array.from(container.values()).filter(Boolean);
    if (values.length > 0) {
      return values;
    }
  }

  if (Array.isArray(container)) {
    return container.filter(Boolean);
  }

  if (typeof container === "object") {
    const values = Object.values(container).filter((value) => value && typeof value === "object");
    if (values.length > 0) {
      return values;
    }
  }

  return [];
}

function normalizeItemActivities(item) {
  if (!item) {
    return [];
  }

  const itemActivities = item.activities;
  if (itemActivities) {
    if (Array.isArray(itemActivities.contents) && itemActivities.contents.length > 0) {
      return itemActivities.contents.filter(Boolean);
    }

    if (typeof itemActivities.values === "function") {
      const values = Array.from(itemActivities.values()).filter(Boolean);
      if (values.length > 0) {
        return values;
      }
    }

    if (Array.isArray(itemActivities)) {
      return itemActivities.filter(Boolean);
    }
  }

  const systemActivities = item.system?.activities;
  if (systemActivities) {
    if (Array.isArray(systemActivities.contents) && systemActivities.contents.length > 0) {
      return systemActivities.contents.filter(Boolean);
    }

    if (typeof systemActivities.values === "function") {
      const values = Array.from(systemActivities.values()).filter(Boolean);
      if (values.length > 0) {
        return values;
      }
    }

    if (Array.isArray(systemActivities)) {
      return systemActivities.filter(Boolean);
    }
  }

  const itemFallback = normalizeActivityContainer(itemActivities);
  if (itemFallback.length > 0) {
    return itemFallback;
  }

  const systemFallback = normalizeActivityContainer(systemActivities);
  if (systemFallback.length > 0) {
    return systemFallback;
  }

  return [];
}

function inspectItemActivities({ item } = {}) {
  const itemActivities = item?.activities;
  const systemActivities = item?.system?.activities;
  const normalized = normalizeItemActivities(item);

  return {
    itemName: String(item?.name ?? ""),
    hasItemActivities: Boolean(itemActivities),
    itemActivitiesConstructor: String(itemActivities?.constructor?.name ?? ""),
    itemActivitiesHasContents: Array.isArray(itemActivities?.contents),
    itemActivitiesContentsLength: Array.isArray(itemActivities?.contents) ? itemActivities.contents.length : 0,
    hasSystemActivities: Boolean(systemActivities),
    systemActivitiesConstructor: String(systemActivities?.constructor?.name ?? ""),
    normalizedCount: normalized.length,
    normalizedNames: normalized.map((activity) => String(activity?.name ?? activity?.label ?? activity?.title ?? ""))
  };
}

function summarizeItemActivity(activity) {
  const id = String(activity?.id ?? activity?._id ?? activity?.activityId ?? "");
  const name = String(activity?.name ?? activity?.label ?? activity?.title ?? "");
  const type = String(
    activity?.type ??
    activity?.system?.type?.value ??
    activity?.system?.activation?.type ??
    activity?.activation?.type ??
    ""
  );
  const uuid = String(activity?.uuid ?? activity?.document?.uuid ?? "");

  return {
    id,
    name,
    type,
    uuid,
    reference: activity
  };
}

function listItemActivities({ item } = {}) {
  return normalizeItemActivities(item).map((activity) => summarizeItemActivity(activity));
}

/**
 * Resolve the primary activity for an item.
 * By default this is the first normalized activity, unless a specific activity is provided.
 *
 * @param {object} params
 * @param {Item|null|undefined} params.item
 * @param {object} [params.primaryActivity]
 * @returns {{found: boolean, primaryActivityId: string, activity: object|null, activitySummary: object|null, error: string|null}}
 */
function resolvePrimaryActivity({ item, primaryActivity } = {}) {
  if (!item) {
    return {
      found: false,
      primaryActivityId: "",
      activity: null,
      activitySummary: null,
      error: "Item is required."
    };
  }

  const activity = primaryActivity ?? normalizeItemActivities(item)[0] ?? null;
  if (!activity) {
    return {
      found: false,
      primaryActivityId: "",
      activity: null,
      activitySummary: null,
      error: "No primary activity could be resolved from this item."
    };
  }

  const activitySummary = summarizeItemActivity(activity);
  return {
    found: true,
    primaryActivityId: activitySummary.id,
    activity,
    activitySummary: {
      id: activitySummary.id,
      name: activitySummary.name,
      type: activitySummary.type,
      uuid: activitySummary.uuid
    },
    error: null
  };
}

function resolveSecondaryActivity({ item, secondaryActivityId } = {}) {
  if (!item) {
    return {
      found: false,
      secondaryActivityId: "",
      activity: null,
      activitySummary: null,
      error: "Item is required."
    };
  }

  const configuredId = String(
    secondaryActivityId ?? getItemSecondaryAoeConfig(item).secondaryActivityId ?? ""
  );

  if (!configuredId) {
    return {
      found: false,
      secondaryActivityId: "",
      activity: null,
      activitySummary: null,
      error: "No secondaryActivityId is configured on this item."
    };
  }

  const activities = normalizeItemActivities(item);
  const activity = activities.find((entry) => {
    const entryId = String(entry?.id ?? entry?._id ?? entry?.activityId ?? "");
    return entryId === configuredId;
  }) ?? null;

  if (!activity) {
    return {
      found: false,
      secondaryActivityId: configuredId,
      activity: null,
      activitySummary: null,
      error: `Secondary activity not found for id \"${configuredId}\".`
    };
  }

  const activitySummary = summarizeItemActivity(activity);

  return {
    found: true,
    secondaryActivityId: configuredId,
    activity,
    activitySummary: {
      id: activitySummary.id,
      name: activitySummary.name,
      type: activitySummary.type,
      uuid: activitySummary.uuid
    },
    error: null
  };
}

export {
  inspectItemActivities,
  listItemActivities,
  normalizeActivityContainer,
  normalizeItemActivities,
  resolvePrimaryActivity,
  resolveSecondaryActivity,
  summarizeItemActivity
};
