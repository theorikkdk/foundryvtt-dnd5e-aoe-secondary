import { MODULE_ID } from "../constants.js";
import { getItemSecondaryAoeConfig } from "../utils/flags.js";
import { buildSecondaryAoeExecutionPlan } from "../services/secondary-aoe-plan-service.js";
import { executeSecondaryAoePlan } from "../services/secondary-aoe-execution-service.js";

const MIDI_QOL_HOOKS = {
  ATTACK_COMPLETE: "midi-qol.AttackRollComplete",
  ROLL_COMPLETE: "midi-qol.RollComplete"
};

let lastMidiSecondaryAoePlan = null;
let lastMidiSecondaryAoeExecutionResult = null;
let midiQolHooksRegistered = false;

function getFirstEntry(value) {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.find(Boolean) ?? null;
  }

  if (typeof value.values === "function") {
    for (const entry of value.values()) {
      if (entry) {
        return entry;
      }
    }
  }

  if (typeof value[Symbol.iterator] === "function") {
    for (const entry of value) {
      if (entry) {
        return entry;
      }
    }
  }

  return null;
}

function normalizeWorkflowToken(token) {
  if (!token) {
    return null;
  }

  return token.object ?? token;
}

function getWorkflowItem(workflow) {
  return workflow?.item ?? workflow?.activity?.item ?? null;
}

function getWorkflowSourceToken(workflow) {
  return normalizeWorkflowToken(workflow?.token ?? workflow?.tokenDocument ?? null);
}

function getCollectionEntries(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (typeof value.values === "function") {
    return Array.from(value.values()).filter(Boolean);
  }

  if (typeof value[Symbol.iterator] === "function") {
    return Array.from(value).filter(Boolean);
  }

  return [];
}

function getTokenIdentity(token) {
  const normalized = normalizeWorkflowToken(token);
  return {
    id: String(normalized?.id ?? normalized?.document?.id ?? ""),
    uuid: String(normalized?.document?.uuid ?? normalized?.uuid ?? "")
  };
}

function collectionContainsToken(collection, token) {
  const tokenIdentity = getTokenIdentity(token);
  if (!tokenIdentity.id && !tokenIdentity.uuid) {
    return false;
  }

  return getCollectionEntries(collection).some((entry) => {
    const entryIdentity = getTokenIdentity(entry);
    return Boolean(
      (tokenIdentity.uuid && entryIdentity.uuid && tokenIdentity.uuid === entryIdentity.uuid) ||
      (tokenIdentity.id && entryIdentity.id && tokenIdentity.id === entryIdentity.id)
    );
  });
}

function getWorkflowPrimaryTargetToken(workflow, trigger) {
  const orderedCollections = trigger === "onFailedSave"
    ? [workflow?.targets, workflow?.failedSaves, workflow?.hitTargets]
    : trigger === "onHit"
      ? [workflow?.targets, workflow?.hitTargets]
      : [workflow?.targets, workflow?.hitTargets, workflow?.failedSaves];

  for (const collection of orderedCollections) {
    const token = normalizeWorkflowToken(getFirstEntry(collection));
    if (token) {
      return token;
    }
  }

  return null;
}

function isMidiQolActive() {
  return Boolean(game.modules.get("midi-qol")?.active);
}

function isSecondaryExecutionWorkflow(workflow) {
  return Boolean(
    workflow?.aoeSecondaryExecution ||
    workflow?.workflowOptions?.aoeSecondaryExecution ||
    workflow?.options?.aoeSecondaryExecution ||
    workflow?.midiOptions?.aoeSecondaryExecution ||
    workflow?.itemCard?.getFlag?.(MODULE_ID, "aoeSecondaryExecution")
  );
}

function getLastMidiSecondaryAoePlan() {
  return lastMidiSecondaryAoePlan;
}

function clearLastMidiSecondaryAoePlan() {
  lastMidiSecondaryAoePlan = null;
}

function storeLastMidiSecondaryAoePlan(plan) {
  lastMidiSecondaryAoePlan = plan;
}

function getLastMidiSecondaryAoeExecutionResult() {
  return lastMidiSecondaryAoeExecutionResult;
}

function clearLastMidiSecondaryAoeExecutionResult() {
  lastMidiSecondaryAoeExecutionResult = null;
}

function storeLastMidiSecondaryAoeExecutionResult(result) {
  lastMidiSecondaryAoeExecutionResult = result;
}

function shouldHandleTriggerOnHook(trigger, hookName) {
  if (hookName === MIDI_QOL_HOOKS.ATTACK_COMPLETE) {
    return trigger === "onHit";
  }

  if (hookName === MIDI_QOL_HOOKS.ROLL_COMPLETE) {
    return ["always", "onComplete", "onFailedSave"].includes(trigger);
  }

  return false;
}

function evaluateTriggerCondition({ workflow, trigger, primaryTargetToken }) {
  if (trigger === "always") {
    return { shouldExecute: true, reason: "Trigger always matched." };
  }

  if (trigger === "onComplete") {
    return { shouldExecute: true, reason: "Trigger onComplete matched." };
  }

  if (trigger === "onHit") {
    if (!workflow?.hitTargets) {
      return { shouldExecute: false, reason: "Hit information is not available on this workflow." };
    }

    if (!primaryTargetToken) {
      return { shouldExecute: false, reason: "No primary target was found for hit evaluation." };
    }

    return collectionContainsToken(workflow.hitTargets, primaryTargetToken)
      ? { shouldExecute: true, reason: "Primary target was hit." }
      : { shouldExecute: false, reason: "Primary target was not hit." };
  }

  if (trigger === "onFailedSave") {
    if (!workflow?.failedSaves) {
      return { shouldExecute: false, reason: "Failed save information is not available on this workflow." };
    }

    if (!primaryTargetToken) {
      return { shouldExecute: false, reason: "No primary target was found for failed save evaluation." };
    }

    return collectionContainsToken(workflow.failedSaves, primaryTargetToken)
      ? { shouldExecute: true, reason: "Primary target failed its save." }
      : { shouldExecute: false, reason: "Primary target did not fail its save." };
  }

  return { shouldExecute: false, reason: `Unsupported trigger \"${trigger}\".` };
}

async function processMidiWorkflow(workflow, hookName) {
  if (isSecondaryExecutionWorkflow(workflow)) {
    return true;
  }

  const item = getWorkflowItem(workflow);
  if (!item) {
    return true;
  }

  const config = getItemSecondaryAoeConfig(item);
  if (!config.enabled) {
    return true;
  }

  if (!shouldHandleTriggerOnHook(config.trigger, hookName)) {
    return true;
  }

  const sourceToken = getWorkflowSourceToken(workflow);
  const primaryTargetToken = getWorkflowPrimaryTargetToken(workflow, config.trigger);
  if (!primaryTargetToken) {
    const skippedPlan = {
      ready: false,
      reason: "No primary target was found in the Midi-QOL workflow.",
      config,
      primaryTarget: null,
      secondaryTargets: [],
      secondaryTargetCount: 0,
      primaryActivityId: String(workflow?.activity?.id ?? workflow?.activity?._id ?? ""),
      primaryActivity: workflow?.activity ?? null,
      primaryActivitySummary: null,
      secondaryActivityId: config.secondaryActivityId,
      secondaryActivity: null,
      secondaryActivitySummary: null,
      debug: {
        hook: hookName,
        itemName: item.name ?? "",
        itemUuid: item.uuid ?? ""
      }
    };

    storeLastMidiSecondaryAoePlan(skippedPlan);
    storeLastMidiSecondaryAoeExecutionResult({
      executed: false,
      reason: skippedPlan.reason,
      attemptedTargetCount: 0,
      primaryActivityId: skippedPlan.primaryActivityId,
      secondaryActivityId: skippedPlan.secondaryActivityId,
      usedActivityId: "",
      consumptionSuppressed: false,
      targetNames: [],
      resultSummary: {
        hook: hookName,
        trigger: config.trigger
      }
    });
    console.warn(`[AoE Secondary] Midi-QOL ignored: ${skippedPlan.reason}`, skippedPlan);
    return true;
  }

  const triggerEvaluation = evaluateTriggerCondition({ workflow, trigger: config.trigger, primaryTargetToken });
  if (!triggerEvaluation.shouldExecute) {
    console.log(`[AoE Secondary] Midi-QOL ignored: ${triggerEvaluation.reason}`);
    storeLastMidiSecondaryAoeExecutionResult({
      executed: false,
      reason: triggerEvaluation.reason,
      attemptedTargetCount: 0,
      primaryActivityId: String(workflow?.activity?.id ?? workflow?.activity?._id ?? ""),
      secondaryActivityId: config.secondaryActivityId,
      usedActivityId: "",
      consumptionSuppressed: false,
      targetNames: [],
      resultSummary: {
        hook: hookName,
        trigger: config.trigger
      }
    });
    return true;
  }

  const plan = buildSecondaryAoeExecutionPlan({
    sourceToken,
    primaryTargetToken,
    item,
    primaryActivity: workflow?.activity ?? null
  });
  const storedPlan = {
    ...plan,
    debug: {
      ...plan.debug,
      midi: {
        hook: hookName,
        trigger: config.trigger,
        reason: triggerEvaluation.reason,
        itemName: item.name ?? "",
        itemUuid: item.uuid ?? ""
      }
    }
  };

  storeLastMidiSecondaryAoePlan(storedPlan);

  if (!storedPlan.ready) {
    console.warn(`[AoE Secondary] Midi-QOL plan not ready: ${storedPlan.reason}`, storedPlan);
    storeLastMidiSecondaryAoeExecutionResult({
      executed: false,
      reason: storedPlan.reason,
      attemptedTargetCount: Number(storedPlan.secondaryTargetCount ?? 0),
      primaryActivityId: String(storedPlan.primaryActivityId ?? ""),
      secondaryActivityId: String(storedPlan.secondaryActivityId ?? ""),
      usedActivityId: "",
      consumptionSuppressed: false,
      targetNames: (storedPlan.secondaryTargets ?? []).map((target) => target?.name).filter(Boolean),
      resultSummary: {
        hook: hookName,
        trigger: config.trigger
      }
    });
    return true;
  }

  const executionResult = await executeSecondaryAoePlan({ plan: storedPlan });
  const storedExecutionResult = {
    ...executionResult,
    resultSummary: {
      ...executionResult.resultSummary,
      hook: hookName,
      trigger: config.trigger,
      triggerReason: triggerEvaluation.reason
    }
  };

  storeLastMidiSecondaryAoeExecutionResult(storedExecutionResult);

  if (storedExecutionResult.executed) {
    console.log(`[AoE Secondary] Midi-QOL secondary activity executed: ${triggerEvaluation.reason}`, storedExecutionResult);
  } else {
    console.warn(`[AoE Secondary] Midi-QOL secondary activity not executed: ${storedExecutionResult.reason}`, storedExecutionResult);
  }

  return true;
}

function handleMidiQolAttackRollComplete(workflow) {
  return processMidiWorkflow(workflow, MIDI_QOL_HOOKS.ATTACK_COMPLETE);
}

function handleMidiQolRollComplete(workflow) {
  return processMidiWorkflow(workflow, MIDI_QOL_HOOKS.ROLL_COMPLETE);
}

function registerMidiQolIntegration() {
  if (midiQolHooksRegistered || !isMidiQolActive()) {
    return;
  }

  Hooks.on(MIDI_QOL_HOOKS.ATTACK_COMPLETE, handleMidiQolAttackRollComplete);
  Hooks.on(MIDI_QOL_HOOKS.ROLL_COMPLETE, handleMidiQolRollComplete);
  midiQolHooksRegistered = true;
  console.log(`[AoE Secondary] Midi-QOL integration active on ${MIDI_QOL_HOOKS.ATTACK_COMPLETE} and ${MIDI_QOL_HOOKS.ROLL_COMPLETE}.`);
}

export {
  clearLastMidiSecondaryAoeExecutionResult,
  clearLastMidiSecondaryAoePlan,
  getLastMidiSecondaryAoeExecutionResult,
  getLastMidiSecondaryAoePlan,
  handleMidiQolAttackRollComplete,
  handleMidiQolRollComplete,
  registerMidiQolIntegration
};
