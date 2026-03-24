import {
  resolvePrimaryActivity,
  resolveSecondaryActivity
} from "./secondary-activity-service.js";
import {
  getSecondaryAoeTargetTokens,
  resolveSecondaryAoeConfig
} from "./secondary-aoe-service.js";
import { resolveSecondaryAoeTargets } from "./secondary-aoe-debug.js";

function summarizePlanToken(token) {
  if (!token) {
    return null;
  }

  return {
    id: String(token?.id ?? token?.document?.id ?? ""),
    name: String(token?.name ?? token?.document?.name ?? ""),
    uuid: String(token?.document?.uuid ?? token?.uuid ?? ""),
    disposition: Number(token?.document?.disposition ?? token?.disposition ?? 0)
  };
}

function buildSecondaryAoeExecutionPlan({ sourceToken, primaryTargetToken, item, primaryActivity } = {}) {
  if (!item) {
    return {
      ready: false,
      reason: "Item is required.",
      config: null,
      primaryTarget: summarizePlanToken(primaryTargetToken),
      secondaryTargets: [],
      secondaryTargetCount: 0,
      primaryActivityId: "",
      primaryActivity: null,
      primaryActivitySummary: null,
      secondaryActivityId: "",
      secondaryActivity: null,
      secondaryActivitySummary: null,
      debug: null
    };
  }

  if (!sourceToken) {
    return {
      ready: false,
      reason: "Source token is required.",
      config: resolveSecondaryAoeConfig({ item }),
      primaryTarget: summarizePlanToken(primaryTargetToken),
      secondaryTargets: [],
      secondaryTargetCount: 0,
      primaryActivityId: "",
      primaryActivity: null,
      primaryActivitySummary: null,
      secondaryActivityId: "",
      secondaryActivity: null,
      secondaryActivitySummary: null,
      debug: null
    };
  }

  if (!primaryTargetToken) {
    return {
      ready: false,
      reason: "Primary target token is required.",
      config: resolveSecondaryAoeConfig({ item }),
      primaryTarget: null,
      secondaryTargets: [],
      secondaryTargetCount: 0,
      primaryActivityId: "",
      primaryActivity: null,
      primaryActivitySummary: null,
      secondaryActivityId: "",
      secondaryActivity: null,
      secondaryActivitySummary: null,
      debug: null
    };
  }

  const config = resolveSecondaryAoeConfig({ item });
  const primaryActivityResolution = resolvePrimaryActivity({ item, primaryActivity });
  const targetDebug = resolveSecondaryAoeTargets({ sourceToken, primaryTargetToken, item, config });
  const secondaryTargetTokens = getSecondaryAoeTargetTokens({ sourceToken, primaryTargetToken, item, config });

  if (!config.secondaryActivityId) {
    return {
      ready: false,
      reason: "No secondaryActivityId is configured on this item.",
      config,
      primaryTarget: summarizePlanToken(primaryTargetToken),
      secondaryTargets: secondaryTargetTokens.map((token) => summarizePlanToken(token)),
      secondaryTargetCount: secondaryTargetTokens.length,
      primaryActivityId: primaryActivityResolution.primaryActivityId,
      primaryActivity: primaryActivityResolution.activity,
      primaryActivitySummary: primaryActivityResolution.activitySummary,
      secondaryActivityId: "",
      secondaryActivity: null,
      secondaryActivitySummary: null,
      debug: {
        primaryActivityResolution,
        targetResolution: targetDebug
      }
    };
  }

  if (config.secondaryActivityId === primaryActivityResolution.primaryActivityId) {
    return {
      ready: false,
      reason: "Secondary activity must be different from the primary activity.",
      config,
      primaryTarget: summarizePlanToken(primaryTargetToken),
      secondaryTargets: secondaryTargetTokens.map((token) => summarizePlanToken(token)),
      secondaryTargetCount: secondaryTargetTokens.length,
      primaryActivityId: primaryActivityResolution.primaryActivityId,
      primaryActivity: primaryActivityResolution.activity,
      primaryActivitySummary: primaryActivityResolution.activitySummary,
      secondaryActivityId: config.secondaryActivityId,
      secondaryActivity: null,
      secondaryActivitySummary: null,
      debug: {
        primaryActivityResolution,
        targetResolution: targetDebug
      }
    };
  }

  const secondaryActivityResolution = resolveSecondaryActivity({ item, secondaryActivityId: config.secondaryActivityId });
  if (!secondaryActivityResolution.found) {
    return {
      ready: false,
      reason: secondaryActivityResolution.error ?? "Secondary activity is not available.",
      config,
      primaryTarget: summarizePlanToken(primaryTargetToken),
      secondaryTargets: secondaryTargetTokens.map((token) => summarizePlanToken(token)),
      secondaryTargetCount: secondaryTargetTokens.length,
      primaryActivityId: primaryActivityResolution.primaryActivityId,
      primaryActivity: primaryActivityResolution.activity,
      primaryActivitySummary: primaryActivityResolution.activitySummary,
      secondaryActivityId: secondaryActivityResolution.secondaryActivityId,
      secondaryActivity: null,
      secondaryActivitySummary: null,
      debug: {
        primaryActivityResolution,
        secondaryActivityResolution,
        targetResolution: targetDebug
      }
    };
  }

  if (secondaryTargetTokens.length === 0) {
    return {
      ready: false,
      reason: "No secondary targets were found.",
      config,
      primaryTarget: summarizePlanToken(primaryTargetToken),
      secondaryTargets: [],
      secondaryTargetCount: 0,
      primaryActivityId: primaryActivityResolution.primaryActivityId,
      primaryActivity: primaryActivityResolution.activity,
      primaryActivitySummary: primaryActivityResolution.activitySummary,
      secondaryActivityId: secondaryActivityResolution.secondaryActivityId,
      secondaryActivity: secondaryActivityResolution.activity,
      secondaryActivitySummary: secondaryActivityResolution.activitySummary,
      debug: {
        primaryActivityResolution,
        secondaryActivityResolution,
        targetResolution: targetDebug
      }
    };
  }

  return {
    ready: true,
    reason: null,
    config,
    primaryTarget: summarizePlanToken(primaryTargetToken),
    secondaryTargets: secondaryTargetTokens.map((token) => summarizePlanToken(token)),
    secondaryTargetCount: secondaryTargetTokens.length,
    primaryActivityId: primaryActivityResolution.primaryActivityId,
    primaryActivity: primaryActivityResolution.activity,
    primaryActivitySummary: primaryActivityResolution.activitySummary,
    secondaryActivityId: secondaryActivityResolution.secondaryActivityId,
    secondaryActivity: secondaryActivityResolution.activity,
    secondaryActivitySummary: secondaryActivityResolution.activitySummary,
    debug: {
      primaryActivityResolution,
      secondaryActivityResolution,
      targetResolution: targetDebug
    }
  };
}

export {
  buildSecondaryAoeExecutionPlan,
  summarizePlanToken
};
