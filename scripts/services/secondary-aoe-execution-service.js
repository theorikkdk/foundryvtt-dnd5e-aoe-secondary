import { MODULE_ID } from "../constants.js";
import { getLastMidiSecondaryAoePlan } from "../integrations/midi-qol.js";

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

function applyUserTargetIds(tokenIds) {
  if (typeof game.user?.updateTokenTargets === "function") {
    game.user.updateTokenTargets(tokenIds);
    return;
  }

  const desired = new Set(tokenIds);
  for (const token of canvas?.tokens?.placeables ?? []) {
    token.setTarget(desired.has(token.id), {
      user: game.user,
      releaseOthers: false,
      groupSelection: true
    });
  }
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

async function tryExecuteActivity(activity, targetUuids) {
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
    attemptedMethods.push("activity.use(payload-with-midiOptions)");
    const result = await activity.use(payload, { configure: false }, messageConfig);
    return {
      result,
      attemptedMethods,
      consumptionSuppressed: true,
      usedActivityId: String(activity?.id ?? activity?._id ?? "")
    };
  } catch (firstError) {
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

async function executeSecondaryAoePlan({ plan } = {}) {
  const baseResult = {
    executed: false,
    reason: null,
    attemptedTargetCount: Number(plan?.secondaryTargetCount ?? 0),
    primaryActivityId: String(plan?.primaryActivityId ?? ""),
    secondaryActivityId: String(plan?.secondaryActivityId ?? ""),
    usedActivityId: "",
    consumptionSuppressed: false,
    targetNames: (plan?.secondaryTargets ?? []).map((target) => target?.name).filter(Boolean),
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
  if (targetTokens.length === 0) {
    return {
      ...baseResult,
      reason: "No executable secondary targets could be resolved from the plan.",
      attemptedTargetCount: 0
    };
  }

  const savedTargetIds = getCurrentUserTargetIds();
  const targetIds = targetTokens.map((token) => token?.id).filter(Boolean);
  const targetUuids = targetTokens.map((token) => token?.document?.uuid ?? token?.uuid).filter(Boolean);

  try {
    applyUserTargetIds(targetIds);

    const execution = await tryExecuteActivity(plan.secondaryActivity, targetUuids);
    return {
      ...baseResult,
      executed: true,
      reason: null,
      attemptedTargetCount: targetTokens.length,
      usedActivityId: execution.usedActivityId,
      consumptionSuppressed: execution.consumptionSuppressed,
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
    return {
      ...baseResult,
      executed: false,
      reason: error?.message ?? String(error),
      attemptedTargetCount: targetTokens.length,
      usedActivityId: String(plan.secondaryActivity?.id ?? plan.secondaryActivity?._id ?? ""),
      consumptionSuppressed: true,
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
    applyUserTargetIds(savedTargetIds);
  }
}

async function executeLastMidiSecondaryAoePlan() {
  return executeSecondaryAoePlan({ plan: getLastMidiSecondaryAoePlan() });
}

export {
  executeLastMidiSecondaryAoePlan,
  executeSecondaryAoePlan,
  getPlanTargetTokens
};
