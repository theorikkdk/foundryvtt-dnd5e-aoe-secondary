import { MODULE_ID } from "../constants.js";
import { getLastMidiSecondaryAoePlan } from "../integrations/midi-qol.js";
import { logger } from "../utils/log.js";

function getTokenName(token) {
  return String(token?.name ?? token?.document?.name ?? "");
}

function getTokenUuid(token) {
  return String(token?.document?.uuid ?? token?.uuid ?? "");
}

function getPlanTargetNames(plan) {
  return (plan?.secondaryTargets ?? []).map((target) => String(target?.name ?? "")).filter(Boolean);
}

function getPlanTargetUuids(plan) {
  return (plan?.secondaryTargets ?? []).map((target) => String(target?.uuid ?? "")).filter(Boolean);
}

function getPlanTargetTokens(plan) {
  const targets = plan?.secondaryTargets ?? [];

  return targets.map((target) => {
    if (target?.uuid && typeof fromUuidSync === "function") {
      const resolved = fromUuidSync(target.uuid);
      return resolved?.object ?? resolved;
    }

    if (target?.id && canvas?.tokens?.get) {
      return canvas.tokens.get(target.id) ?? null;
    }

    return null;
  }).filter(Boolean);
}

function getCurrentUserTargetIds() {
  return Array.from(game.user?.targets ?? []).map((token) => token?.id).filter(Boolean);
}

function getCurrentUserTargetSnapshot() {
  const targets = Array.from(game.user?.targets ?? []).filter(Boolean);
  return {
    ids: targets.map((token) => String(token?.id ?? "")).filter(Boolean),
    uuids: targets.map((token) => getTokenUuid(token)).filter(Boolean),
    names: targets.map((token) => getTokenName(token)).filter(Boolean),
    count: targets.length
  };
}

function areStringArraysEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function applyUserTargetIds(tokenIds) {
  if (typeof game.user?.updateTokenTargets === "function") {
    game.user.updateTokenTargets(tokenIds);
    return {
      method: "game.user.updateTokenTargets",
      requestedIds: [...tokenIds]
    };
  }

  const desired = new Set(tokenIds);
  for (const token of canvas?.tokens?.placeables ?? []) {
    token.setTarget(desired.has(token.id), {
      user: game.user,
      releaseOthers: false,
      groupSelection: true
    });
  }

  return {
    method: "token.setTarget",
    requestedIds: [...tokenIds]
  };
}

function buildExecutionAttemptPayload(targetUuids) {
  return {
    legacy: false,
    aoeSecondaryExecution: true,
    workflowOptions: {
      aoeSecondaryExecution: true
    },
    flags: {
      [MODULE_ID]: {
        aoeSecondaryExecution: true
      }
    },
    consume: {
      activityUses: false,
      itemUses: false,
      resources: false,
      spellSlot: false
    },
    midiOptions: {
      aoeSecondaryExecution: true,
      ignoreUserTargets: true,
      targetUuids,
      triggeredActivity: true
    }
  };
}

async function tryExecuteActivity(activity, targetUuids, { executionMode = "direct" } = {}) {
  if (typeof activity?.use !== "function") {
    throw new Error("Resolved secondary activity does not expose a use() method.");
  }

  const attemptedMethods = [];
  const payload = buildExecutionAttemptPayload(targetUuids);
  const messageConfig = {
    flags: {
      [MODULE_ID]: {
        aoeSecondaryExecution: true
      }
    }
  };

  try {
    logger.debug("Secondary AoE execution attempting primary method explicit targetUuids.", {
      executionMode,
      activityId: String(activity?.id ?? activity?._id ?? ""),
      targetUuids,
      currentUserTargets: getCurrentUserTargetSnapshot(),
      method: "primary method explicit targetUuids"
    });
    attemptedMethods.push("activity.use(payload-with-midiOptions)");
    const result = await activity.use(payload, { configure: false }, messageConfig);
    return {
      result,
      attemptedMethods,
      consumptionSuppressed: true,
      usedActivityId: String(activity?.id ?? activity?._id ?? "")
    };
  } catch (firstError) {
    logger.debug("Secondary AoE execution primary method failed; attempting fallback method temporary user targets.", {
      executionMode,
      activityId: String(activity?.id ?? activity?._id ?? ""),
      targetUuids,
      currentUserTargets: getCurrentUserTargetSnapshot(),
      method: "fallback method temporary user targets",
      primaryErrorName: firstError?.name ?? "Error",
      primaryErrorMessage: firstError?.message ?? String(firstError)
    });
    attemptedMethods.push("activity.use(payload-with-user-targets-fallback)");
    const fallbackPayload = {
      ...payload,
      midiOptions: {
        ...payload.midiOptions,
        ignoreUserTargets: false
      }
    };

    try {
      const result = await activity.use(fallbackPayload, { configure: false }, messageConfig);
      return {
        result,
        attemptedMethods,
        consumptionSuppressed: true,
        usedActivityId: String(activity?.id ?? activity?._id ?? "")
      };
    } catch (secondError) {
      secondError.cause = firstError;
      secondError.attemptedMethods = attemptedMethods;
      throw secondError;
    }
  }
}

async function executeSecondaryAoePlan({ plan, executionMode = "direct" } = {}) {
  const baseResult = {
    executed: false,
    reason: null,
    executionMode: String(executionMode ?? "direct"),
    attemptedTargetCount: Number(plan?.secondaryTargetCount ?? 0),
    primaryActivityId: String(plan?.primaryActivityId ?? ""),
    secondaryActivityId: String(plan?.secondaryActivityId ?? ""),
    usedActivityId: "",
    consumptionSuppressed: false,
    targetNames: getPlanTargetNames(plan),
    targetUuids: getPlanTargetUuids(plan),
    primaryTargetName: String(plan?.primaryTarget?.name ?? ""),
    primaryTargetUuid: String(plan?.primaryTarget?.uuid ?? ""),
    resultSummary: null
  };

  if (!plan) {
    return {
      ...baseResult,
      reason: "No plan was provided."
    };
  }

  if (!plan.ready) {
    return {
      ...baseResult,
      reason: plan.reason ?? "Plan is not ready."
    };
  }

  if (!plan.primaryTarget) {
    return {
      ...baseResult,
      reason: "No primary target is available on the plan."
    };
  }

  if (!plan.secondaryActivityId) {
    return {
      ...baseResult,
      reason: "No secondary activity id is available on the plan."
    };
  }

  if (!plan.secondaryActivity) {
    return {
      ...baseResult,
      reason: "No resolved secondary activity is available on the plan."
    };
  }

  if (plan.secondaryActivityId === plan.primaryActivityId) {
    return {
      ...baseResult,
      reason: "Secondary activity must be different from the primary activity."
    };
  }

  const targetTokens = getPlanTargetTokens(plan);
  const resolvedTargetNames = targetTokens.map((token) => getTokenName(token)).filter(Boolean);
  const resolvedTargetUuids = targetTokens.map((token) => getTokenUuid(token)).filter(Boolean);
  if (targetTokens.length === 0) {
    return {
      ...baseResult,
      reason: "No executable secondary targets could be resolved from the plan.",
      attemptedTargetCount: 0,
      targetNames: resolvedTargetNames,
      targetUuids: resolvedTargetUuids
    };
  }

  const savedTargetIds = getCurrentUserTargetIds();
  const userTargetsBeforeApply = getCurrentUserTargetSnapshot();
  const targetIds = targetTokens.map((token) => token?.id).filter(Boolean);
  const targetUuids = targetTokens.map((token) => token?.document?.uuid ?? token?.uuid).filter(Boolean);

  try {
    logger.debug("Secondary AoE execution target state before apply.", {
      executionMode,
      primaryActivityId: String(plan?.primaryActivityId ?? ""),
      secondaryActivityId: String(plan?.secondaryActivityId ?? ""),
      requestedTargetIds: targetIds,
      requestedTargetUuids: targetUuids,
      userTargetsBeforeApply
    });

    const applyResult = applyUserTargetIds(targetIds);
    const userTargetsAfterApply = getCurrentUserTargetSnapshot();

    logger.debug("Secondary AoE execution target state after apply.", {
      executionMode,
      targetUpdateMethod: applyResult?.method ?? "unknown",
      requestedTargetIds: targetIds,
      requestedTargetUuids: targetUuids,
      userTargetsBeforeApply,
      userTargetsAfterApply,
      userTargetsChanged: !areStringArraysEqual(userTargetsBeforeApply.ids, userTargetsAfterApply.ids)
    });

    const execution = await tryExecuteActivity(plan.secondaryActivity, targetUuids, { executionMode });
    const userTargetsAfterExecution = getCurrentUserTargetSnapshot();
    logger.debug("Secondary AoE execution target state immediately after activity.use.", {
      executionMode,
      attemptedMethods: execution.attemptedMethods,
      userTargetsAfterExecution
    });
    return {
      ...baseResult,
      executed: true,
      reason: null,
      attemptedTargetCount: targetTokens.length,
      usedActivityId: execution.usedActivityId,
      consumptionSuppressed: execution.consumptionSuppressed,
      targetNames: resolvedTargetNames,
      targetUuids: resolvedTargetUuids,
      resultSummary: {
        attemptedMethods: execution.attemptedMethods,
        resultType: execution.result?.constructor?.name ?? typeof execution.result,
        hasResult: execution.result !== undefined && execution.result !== null,
        suppressionAttempted: [
          "consume.activityUses=false",
          "consume.itemUses=false",
          "consume.resources=false",
          "consume.spellSlot=false",
          "workflowOptions.aoeSecondaryExecution=true",
          "midiOptions.aoeSecondaryExecution=true"
        ]
      }
    };
  } catch (error) {
    const userTargetsAfterExecutionError = getCurrentUserTargetSnapshot();
    logger.debug("Secondary AoE execution target state after execution error and before restore.", {
      executionMode,
      attemptedMethods: error?.attemptedMethods ?? [],
      userTargetsAfterExecutionError,
      errorName: error?.name ?? "Error",
      errorMessage: error?.message ?? String(error)
    });
    return {
      ...baseResult,
      executed: false,
      reason: error?.message ?? String(error),
      attemptedTargetCount: targetTokens.length,
      usedActivityId: String(plan.secondaryActivity?.id ?? plan.secondaryActivity?._id ?? ""),
      consumptionSuppressed: true,
      targetNames: resolvedTargetNames,
      targetUuids: resolvedTargetUuids,
      resultSummary: {
        errorName: error?.name ?? "Error",
        attemptedMethods: error?.attemptedMethods ?? [],
        suppressionAttempted: [
          "consume.activityUses=false",
          "consume.itemUses=false",
          "consume.resources=false",
          "consume.spellSlot=false",
          "workflowOptions.aoeSecondaryExecution=true",
          "midiOptions.aoeSecondaryExecution=true"
        ]
      }
    };
  } finally {
    const restoreResult = applyUserTargetIds(savedTargetIds);
    const userTargetsAfterRestore = getCurrentUserTargetSnapshot();
    logger.debug("Secondary AoE execution target state after restore.", {
      executionMode,
      restoreMethod: restoreResult?.method ?? "unknown",
      savedTargetIds,
      userTargetsBeforeApply,
      userTargetsAfterRestore,
      targetsRestoredToOriginal: areStringArraysEqual(userTargetsBeforeApply.ids, userTargetsAfterRestore.ids)
    });
  }
}

async function executeLastMidiSecondaryAoePlan() {
  return executeSecondaryAoePlan({
    plan: getLastMidiSecondaryAoePlan(),
    executionMode: "last-midi-plan"
  });
}

export {
  executeLastMidiSecondaryAoePlan,
  executeSecondaryAoePlan,
  getPlanTargetTokens
};
