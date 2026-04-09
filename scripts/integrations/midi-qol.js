import { MODULE_ID } from "../constants.js";
import { logger } from "../utils/log.js";
import { getItemSecondaryAoeConfig } from "../utils/flags.js";
import { buildSecondaryAoeExecutionPlan } from "../services/secondary-aoe-plan-service.js";
import { executeSecondaryAoePlan } from "../services/secondary-aoe-execution-service.js";
import { getItemActivityById } from "../services/secondary-activity-service.js";

const MIDI_QOL_HOOKS = {
  ATTACK_COMPLETE: "midi-qol.AttackRollComplete",
  ROLL_COMPLETE: "midi-qol.RollComplete"
};

const SOCKET_HANDLERS = {
  EXECUTE_SECONDARY_AOE_RELAY: "executeSecondaryAoeRelay"
};

const MIDI_QOL_HOOK_DEBUG = {
  ATTACK_COMPLETE: {
    hookName: MIDI_QOL_HOOKS.ATTACK_COMPLETE,
    callbackName: "handleMidiQolAttackRollComplete",
    hookId: null
  },
  ROLL_COMPLETE: {
    hookName: MIDI_QOL_HOOKS.ROLL_COMPLETE,
    callbackName: "handleMidiQolRollComplete",
    hookId: null
  }
};

let lastMidiSecondaryAoePlan = null;
let lastMidiSecondaryAoeExecutionResult = null;
let midiQolHooksRegistered = false;
let socketlibIntegrationRegistered = false;
let moduleSocket = null;
let midiQolHooksRegisteredBy = null;

function getUserDebugSummary(user = game.user) {
  return {
    id: String(user?.id ?? ""),
    name: String(user?.name ?? ""),
    isGM: Boolean(user?.isGM)
  };
}

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

function getTokenName(token) {
  const normalized = normalizeWorkflowToken(token);
  return String(normalized?.name ?? normalized?.document?.name ?? "");
}

function getTokenUuid(token) {
  const normalized = normalizeWorkflowToken(token);
  return String(normalized?.document?.uuid ?? normalized?.uuid ?? "");
}

function getWorkflowItem(workflow) {
  return workflow?.item ?? workflow?.activity?.item ?? null;
}

function getWorkflowSourceToken(workflow) {
  return normalizeWorkflowToken(workflow?.token ?? workflow?.tokenDocument ?? null);
}

function getWorkflowActivityUuid(workflow) {
  return String(workflow?.activity?.uuid ?? workflow?.activity?.document?.uuid ?? "");
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

function getCollectionSize(value) {
  return getCollectionEntries(value).length;
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

function getWorkflowInitiatorUserId(workflow) {
  const itemCardMessage = workflow?.itemCardUuid && typeof fromUuidSync === "function"
    ? fromUuidSync(workflow.itemCardUuid)
    : null;

  return String(
    workflow?.speaker?.user ??
    workflow?.itemCard?.author?.id ??
    itemCardMessage?.author?.id ??
    ""
  );
}

function buildWorkflowClientDebugState({
  workflow,
  hookName,
  item = null,
  config = null,
  sourceToken = null,
  primaryTargetToken = null,
  initiatorUserId = "",
  shouldExecuteLocally = null,
  shouldRelayToGM = null,
  shouldHandleTrigger = null,
  socketAvailable = null,
  socketRegistered = null,
  relayRequestPrepared = false,
  relayRequestSent = false,
  triggerEvaluation = null,
  extra = null
} = {}) {
  return {
    hook: String(hookName ?? ""),
    currentUser: getUserDebugSummary(),
    initiatorUserId: String(initiatorUserId ?? ""),
    workflowSeenOnClient: true,
    workflowId: String(workflow?.id ?? ""),
    workflowUuid: String(workflow?.uuid ?? ""),
    workflowItemUuid: String(workflow?.item?.uuid ?? workflow?.activity?.item?.uuid ?? ""),
    workflowItemCardUuid: String(workflow?.itemCardUuid ?? workflow?.itemCard?.uuid ?? ""),
    workflowItemResolved: Boolean(item),
    workflowItemName: String(item?.name ?? workflow?.item?.name ?? ""),
    isSecondaryExecutionWorkflow: isSecondaryExecutionWorkflow(workflow),
    configEnabled: config ? Boolean(config.enabled) : null,
    trigger: String(config?.trigger ?? ""),
    shouldHandleTrigger: shouldHandleTrigger === null ? null : Boolean(shouldHandleTrigger),
    sourceTokenResolved: Boolean(sourceToken),
    sourceTokenUuid: getTokenUuid(sourceToken),
    sourceTokenName: getTokenName(sourceToken),
    primaryTargetResolved: Boolean(primaryTargetToken),
    primaryTargetUuid: getTokenUuid(primaryTargetToken),
    primaryTargetName: getTokenName(primaryTargetToken),
    workflowTargetsCount: getCollectionSize(workflow?.targets),
    workflowHitTargetsCount: getCollectionSize(workflow?.hitTargets),
    workflowFailedSavesCount: getCollectionSize(workflow?.failedSaves),
    shouldExecuteLocally: shouldExecuteLocally === null ? null : Boolean(shouldExecuteLocally),
    shouldRelayToGM: shouldRelayToGM === null ? null : Boolean(shouldRelayToGM),
    socketAvailable: socketAvailable === null ? null : Boolean(socketAvailable),
    socketRegistered: socketRegistered === null ? null : Boolean(socketRegistered),
    relayRequestPayloadPrepared: Boolean(relayRequestPrepared),
    relayRequestSent: Boolean(relayRequestSent),
    triggerShouldExecute: triggerEvaluation ? Boolean(triggerEvaluation.shouldExecute) : null,
    triggerReason: String(triggerEvaluation?.reason ?? ""),
    extra
  };
}

function buildRelayResolutionDebugState({
  relayRequest,
  item = null,
  sourceToken = null,
  primaryTargetToken = null,
  plan = null,
  executionResult = null,
  extra = null
} = {}) {
  return {
    currentUser: getUserDebugSummary(),
    relayRequest,
    itemResolved: Boolean(item),
    itemUuid: String(item?.uuid ?? relayRequest?.itemUuid ?? ""),
    itemName: String(item?.name ?? ""),
    sourceTokenResolved: Boolean(sourceToken),
    sourceTokenUuid: getTokenUuid(sourceToken),
    sourceTokenName: getTokenName(sourceToken),
    primaryTargetResolved: Boolean(primaryTargetToken),
    primaryTargetUuid: getTokenUuid(primaryTargetToken),
    primaryTargetName: getTokenName(primaryTargetToken),
    secondaryTargetUuidsReceived: Array.isArray(relayRequest?.secondaryTargetUuids)
      ? relayRequest.secondaryTargetUuids.map((uuid) => String(uuid))
      : [],
    secondaryActivityIdRequested: String(relayRequest?.secondaryActivityId ?? ""),
    secondaryActivityResolved: Boolean(plan?.secondaryActivity),
    secondaryActivityResolvedId: String(plan?.secondaryActivityId ?? ""),
    primaryActivityResolved: Boolean(plan?.primaryActivity),
    primaryActivityResolvedId: String(plan?.primaryActivityId ?? ""),
    planReady: plan ? Boolean(plan.ready) : null,
    planReason: String(plan?.reason ?? ""),
    secondaryTargetCountPlanned: Number(plan?.secondaryTargetCount ?? 0),
    executionMode: String(executionResult?.executionMode ?? ""),
    executionSucceeded: executionResult ? Boolean(executionResult.executed) : null,
    executionReason: String(executionResult?.reason ?? ""),
    extra
  };
}

function buildHookRegistrationDebugState(hookKey) {
  const hookState = MIDI_QOL_HOOK_DEBUG[hookKey];
  return {
    currentUser: getUserDebugSummary(),
    hookName: String(hookState?.hookName ?? ""),
    callbackName: String(hookState?.callbackName ?? ""),
    hookId: hookState?.hookId ?? null,
    midiQolActive: isMidiQolActive(),
    hooksRegistered: midiQolHooksRegistered
  };
}

function buildHookCallbackEntryDebugState({ hookKey, workflow } = {}) {
  const hookState = MIDI_QOL_HOOK_DEBUG[hookKey];
  const workflowItem = getWorkflowItem(workflow);
  const workflowToken = getWorkflowSourceToken(workflow);

  return {
    currentUser: getUserDebugSummary(),
    hookName: String(hookState?.hookName ?? ""),
    callbackName: String(hookState?.callbackName ?? ""),
    hookId: hookState?.hookId ?? null,
    workflowExists: Boolean(workflow),
    workflowId: String(workflow?.id ?? ""),
    workflowUuid: String(workflow?.uuid ?? ""),
    itemUuid: String(workflowItem?.uuid ?? ""),
    activityUuid: getWorkflowActivityUuid(workflow),
    workflowTokenUuid: getTokenUuid(workflowToken)
  };
}

function getMidiHookDebugStatus() {
  return {
    currentUser: getUserDebugSummary(),
    midiQolActive: isMidiQolActive(),
    socketlibActive: isSocketlibActive(),
    socketRelayRegistered: Boolean(socketlibIntegrationRegistered),
    socketRelayReady: Boolean(moduleSocket),
    hooksRegistered: Boolean(midiQolHooksRegistered),
    hooksRegisteredBy: midiQolHooksRegisteredBy,
    hooks: {
      attackRollComplete: {
        hookName: MIDI_QOL_HOOK_DEBUG.ATTACK_COMPLETE.hookName,
        callbackName: MIDI_QOL_HOOK_DEBUG.ATTACK_COMPLETE.callbackName,
        hookId: MIDI_QOL_HOOK_DEBUG.ATTACK_COMPLETE.hookId,
        registered: Boolean(MIDI_QOL_HOOK_DEBUG.ATTACK_COMPLETE.hookId)
      },
      rollComplete: {
        hookName: MIDI_QOL_HOOK_DEBUG.ROLL_COMPLETE.hookName,
        callbackName: MIDI_QOL_HOOK_DEBUG.ROLL_COMPLETE.callbackName,
        hookId: MIDI_QOL_HOOK_DEBUG.ROLL_COMPLETE.hookId,
        registered: Boolean(MIDI_QOL_HOOK_DEBUG.ROLL_COMPLETE.hookId)
      }
    }
  };
}

function userOwnsItem(item) {
  if (!item) {
    return false;
  }

  if (typeof item.testUserPermission === "function") {
    return item.testUserPermission(game.user, "OWNER");
  }

  const actor = item.actor ?? item.parent ?? null;
  if (typeof actor?.testUserPermission === "function") {
    return actor.testUserPermission(game.user, "OWNER");
  }

  return Boolean(item?.isOwner ?? actor?.isOwner ?? false);
}

function shouldPlayerRelayWorkflow({ workflow, item } = {}) {
  const initiatorUserId = getWorkflowInitiatorUserId(workflow);
  if (initiatorUserId) {
    return initiatorUserId === game.user?.id;
  }

  return userOwnsItem(item);
}

function shouldGmHandleWorkflowLocally(workflow) {
  const initiatorUserId = getWorkflowInitiatorUserId(workflow);
  if (!initiatorUserId) {
    return true;
  }

  const initiator = game.users?.get(initiatorUserId);
  return !initiator || initiator.isGM === true;
}

function isMidiQolActive() {
  return Boolean(game.modules.get("midi-qol")?.active);
}

function isSocketlibActive() {
  return Boolean(game.modules.get("socketlib")?.active && globalThis.socketlib?.registerModule);
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

  return { shouldExecute: false, reason: `Unsupported trigger "${trigger}".` };
}

function buildMidiExecutionResult({
  executed = false,
  reason = null,
  executionMode = "direct",
  attemptedTargetCount = 0,
  primaryActivityId = "",
  secondaryActivityId = "",
  usedActivityId = "",
  consumptionSuppressed = false,
  targetNames = [],
  targetUuids = [],
  primaryTargetName = "",
  primaryTargetUuid = "",
  resultSummary = null
} = {}) {
  return {
    executed: Boolean(executed),
    reason: reason ?? null,
    executionMode: String(executionMode ?? "direct"),
    attemptedTargetCount: Number(attemptedTargetCount ?? 0),
    primaryActivityId: String(primaryActivityId ?? ""),
    secondaryActivityId: String(secondaryActivityId ?? ""),
    usedActivityId: String(usedActivityId ?? ""),
    consumptionSuppressed: Boolean(consumptionSuppressed),
    targetNames: Array.isArray(targetNames) ? targetNames.filter(Boolean).map((name) => String(name)) : [],
    targetUuids: Array.isArray(targetUuids) ? targetUuids.filter(Boolean).map((uuid) => String(uuid)) : [],
    primaryTargetName: String(primaryTargetName ?? ""),
    primaryTargetUuid: String(primaryTargetUuid ?? ""),
    resultSummary: resultSummary ?? null
  };
}

function buildMidiDebugContext({ hookName, config, triggerReason, item, relay = null } = {}) {
  return {
    hook: hookName,
    trigger: config?.trigger ?? "",
    reason: triggerReason ?? "",
    itemName: item?.name ?? "",
    itemUuid: item?.uuid ?? "",
    relay
  };
}

function buildStoredPlan(plan, { hookName, config, triggerReason, item, relay = null } = {}) {
  return {
    ...plan,
    debug: {
      ...(plan.debug ?? {}),
      midi: buildMidiDebugContext({ hookName, config, triggerReason, item, relay })
    }
  };
}

function buildStoredExecutionResult(executionResult, { hookName, config, triggerReason, relay = null } = {}) {
  return {
    ...executionResult,
    resultSummary: {
      ...(executionResult.resultSummary ?? {}),
      hook: hookName,
      trigger: config?.trigger ?? "",
      triggerReason: triggerReason ?? "",
      relay
    }
  };
}

function buildRelayRequest({
  workflow,
  hookName,
  item,
  config,
  sourceToken,
  primaryTargetToken,
  triggerEvaluation,
  relayPlanPreview
} = {}) {
  const previewTargets = relayPlanPreview?.secondaryTargets ?? [];

  return {
    itemUuid: String(item?.uuid ?? ""),
    sourceTokenUuid: getTokenUuid(sourceToken),
    primaryTargetUuid: getTokenUuid(primaryTargetToken),
    secondaryTargetUuids: previewTargets.map((target) => String(target?.uuid ?? "")).filter(Boolean),
    primaryActivityId: String(workflow?.activity?.id ?? workflow?.activity?._id ?? relayPlanPreview?.primaryActivityId ?? ""),
    secondaryActivityId: String(config?.secondaryActivityId ?? relayPlanPreview?.secondaryActivityId ?? ""),
    trigger: String(config?.trigger ?? ""),
    includePrimaryTarget: Boolean(config?.includePrimaryTarget),
    detectedByUserId: String(game.user?.id ?? ""),
    workflowId: String(workflow?.id ?? ""),
    workflowUuid: String(workflow?.uuid ?? ""),
    itemCardUuid: String(workflow?.itemCardUuid ?? workflow?.itemCard?.uuid ?? ""),
    hookName: String(hookName ?? ""),
    triggerReason: String(triggerEvaluation?.reason ?? "")
  };
}

function buildRelayFailureResult({
  relayRequest,
  reason,
  hookName,
  config,
  triggerEvaluation,
  primaryTargetToken,
  relayPlanPreview
} = {}) {
  return buildMidiExecutionResult({
    executed: false,
    reason,
    executionMode: "gm-relay",
    attemptedTargetCount: Number(relayPlanPreview?.secondaryTargetCount ?? relayRequest?.secondaryTargetUuids?.length ?? 0),
    primaryActivityId: relayRequest?.primaryActivityId ?? "",
    secondaryActivityId: relayRequest?.secondaryActivityId ?? "",
    targetNames: (relayPlanPreview?.secondaryTargets ?? []).map((target) => target?.name).filter(Boolean),
    targetUuids: relayRequest?.secondaryTargetUuids ?? [],
    primaryTargetName: getTokenName(primaryTargetToken),
    primaryTargetUuid: relayRequest?.primaryTargetUuid ?? getTokenUuid(primaryTargetToken),
    resultSummary: {
      hook: hookName,
      trigger: config?.trigger ?? "",
      triggerReason: triggerEvaluation?.reason ?? "",
      relay: {
        detectedByUserId: String(game.user?.id ?? ""),
        requestedSecondaryTargetUuids: relayRequest?.secondaryTargetUuids ?? [],
        status: "requestFailed"
      }
    }
  });
}

async function resolveUuidDocument(uuid) {
  const normalizedUuid = String(uuid ?? "");
  if (!normalizedUuid) {
    return null;
  }

  if (typeof fromUuidSync === "function") {
    return fromUuidSync(normalizedUuid) ?? null;
  }

  if (typeof fromUuid === "function") {
    return await fromUuid(normalizedUuid);
  }

  return null;
}

async function resolveUuidToken(uuid) {
  const resolved = await resolveUuidDocument(uuid);
  return normalizeWorkflowToken(resolved);
}

function getFallbackItemSourceToken(item) {
  const actor = item?.actor ?? item?.parent ?? null;
  const activeTokens = actor?.getActiveTokens?.() ?? [];
  return normalizeWorkflowToken(activeTokens[0] ?? null);
}

async function handleSecondaryAoeRelayRequest(relayRequest = {}) {
  const requesterUserId = String(this?.socketdata?.userId ?? relayRequest?.detectedByUserId ?? "");
  logger.debug("GM received relay request.", buildRelayResolutionDebugState({
    relayRequest,
    extra: {
      requesterUserId
    }
  }));

  const item = await resolveUuidDocument(relayRequest.itemUuid);
  const sourceToken = await resolveUuidToken(relayRequest.sourceTokenUuid) ?? getFallbackItemSourceToken(item);
  const primaryTargetToken = await resolveUuidToken(relayRequest.primaryTargetUuid);
  const config = item ? getItemSecondaryAoeConfig(item) : {
    trigger: relayRequest.trigger ?? "",
    secondaryActivityId: relayRequest.secondaryActivityId ?? "",
    includePrimaryTarget: relayRequest.includePrimaryTarget ?? false
  };

  logger.debug("GM relay resolution after document lookup.", buildRelayResolutionDebugState({
    relayRequest,
    item,
    sourceToken,
    primaryTargetToken,
    extra: {
      requesterUserId
    }
  }));

  if (!item) {
    const unresolvedItemResult = buildMidiExecutionResult({
      executed: false,
      reason: "Relay item could not be resolved on the GM.",
      executionMode: "gm-relay",
      attemptedTargetCount: Number(relayRequest.secondaryTargetUuids?.length ?? 0),
      primaryActivityId: relayRequest.primaryActivityId,
      secondaryActivityId: relayRequest.secondaryActivityId,
      targetUuids: relayRequest.secondaryTargetUuids ?? [],
      primaryTargetUuid: relayRequest.primaryTargetUuid,
      resultSummary: {
        hook: relayRequest.hookName ?? "",
        trigger: relayRequest.trigger ?? "",
        triggerReason: relayRequest.triggerReason ?? "",
        relay: {
          requestedByUserId: requesterUserId,
          detectedByUserId: relayRequest.detectedByUserId ?? "",
          requestedSecondaryTargetUuids: relayRequest.secondaryTargetUuids ?? [],
          status: "itemNotResolved"
        }
      }
    });
    storeLastMidiSecondaryAoeExecutionResult(unresolvedItemResult);
    logger.warn(`GM relay request did not execute secondary activity: ${unresolvedItemResult.reason}`, unresolvedItemResult);
    return unresolvedItemResult;
  }

  const primaryActivity = getItemActivityById({
    item,
    activityId: relayRequest.primaryActivityId
  });
  const plan = buildSecondaryAoeExecutionPlan({
    sourceToken,
    primaryTargetToken,
    item,
    primaryActivity
  });

  logger.debug("GM relay plan evaluation.", buildRelayResolutionDebugState({
    relayRequest,
    item,
    sourceToken,
    primaryTargetToken,
    plan,
    extra: {
      requesterUserId
    }
  }));

  const relayDebug = {
    requestedByUserId: requesterUserId,
    detectedByUserId: relayRequest.detectedByUserId ?? "",
    workflowId: relayRequest.workflowId ?? "",
    workflowUuid: relayRequest.workflowUuid ?? "",
    itemCardUuid: relayRequest.itemCardUuid ?? "",
    requestedSecondaryTargetUuids: relayRequest.secondaryTargetUuids ?? [],
    requestedSecondaryActivityId: relayRequest.secondaryActivityId ?? "",
    requestedPrimaryActivityId: relayRequest.primaryActivityId ?? "",
    includePrimaryTarget: relayRequest.includePrimaryTarget ?? false
  };
  const storedPlan = buildStoredPlan(plan, {
    hookName: relayRequest.hookName,
    config,
    triggerReason: relayRequest.triggerReason || "Player relay request received.",
    item,
    relay: relayDebug
  });

  storeLastMidiSecondaryAoePlan(storedPlan);

  const executionResult = await executeSecondaryAoePlan({
    plan: storedPlan,
    executionMode: "gm-relay"
  });
  const storedExecutionResult = buildStoredExecutionResult(executionResult, {
    hookName: relayRequest.hookName,
    config,
    triggerReason: relayRequest.triggerReason || "Player relay request received.",
    relay: {
      ...relayDebug,
      authoritativeTargetUuids: executionResult.targetUuids ?? []
    }
  });

  storeLastMidiSecondaryAoeExecutionResult(storedExecutionResult);

  if (storedExecutionResult.executed) {
    logger.debug("GM executed secondary activity via relay.", buildRelayResolutionDebugState({
      relayRequest,
      item,
      sourceToken,
      primaryTargetToken,
      plan: storedPlan,
      executionResult: storedExecutionResult,
      extra: {
        requesterUserId
      }
    }));
  } else {
    logger.warn(`GM relay request did not execute secondary activity: ${storedExecutionResult.reason}`, buildRelayResolutionDebugState({
      relayRequest,
      item,
      sourceToken,
      primaryTargetToken,
      plan: storedPlan,
      executionResult: storedExecutionResult,
      extra: {
        requesterUserId
      }
    }));
  }

  return storedExecutionResult;
}

function registerSocketlibIntegration() {
  if (socketlibIntegrationRegistered) {
    return;
  }

  if (!isSocketlibActive()) {
    logger.warn("Socketlib is required for authoritative GM relay but is not available.");
    return;
  }

  moduleSocket = globalThis.socketlib.registerModule(MODULE_ID);
  if (!moduleSocket) {
    logger.warn("Socketlib relay could not register for the AoE secondary module.");
    return;
  }

  moduleSocket.register(SOCKET_HANDLERS.EXECUTE_SECONDARY_AOE_RELAY, handleSecondaryAoeRelayRequest);
  socketlibIntegrationRegistered = true;
  logger.debug("Socketlib relay active for AoE secondary.");
}

async function processMidiWorkflow(workflow, hookName) {
  const initialItem = getWorkflowItem(workflow);
  const initialConfig = initialItem ? getItemSecondaryAoeConfig(initialItem) : null;
  const initiatorUserId = getWorkflowInitiatorUserId(workflow);
  const initialSocketAvailable = isSocketlibActive();
  const initialSocketRegistered = Boolean(socketlibIntegrationRegistered && moduleSocket);

  logger.debug("Workflow seen on client.", buildWorkflowClientDebugState({
    workflow,
    hookName,
    item: initialItem,
    config: initialConfig,
    initiatorUserId,
    socketAvailable: initialSocketAvailable,
    socketRegistered: initialSocketRegistered
  }));

  if (isSecondaryExecutionWorkflow(workflow)) {
    logger.debug("Workflow seen on client but ignored because it is marked as a secondary execution.", buildWorkflowClientDebugState({
      workflow,
      hookName,
      item: initialItem,
      config: initialConfig,
      initiatorUserId,
      socketAvailable: initialSocketAvailable,
      socketRegistered: initialSocketRegistered
    }));
    return true;
  }

  const item = initialItem;
  if (!item) {
    logger.debug("Workflow seen on client but no item could be resolved.", buildWorkflowClientDebugState({
      workflow,
      hookName,
      initiatorUserId,
      socketAvailable: initialSocketAvailable,
      socketRegistered: initialSocketRegistered
    }));
    return true;
  }

  const config = initialConfig;
  if (!config.enabled) {
    logger.debug("Workflow seen on client but AoE secondary is disabled on this item.", buildWorkflowClientDebugState({
      workflow,
      hookName,
      item,
      config,
      initiatorUserId,
      socketAvailable: initialSocketAvailable,
      socketRegistered: initialSocketRegistered
    }));
    return true;
  }

  const shouldHandleTrigger = shouldHandleTriggerOnHook(config.trigger, hookName);
  if (!shouldHandleTrigger) {
    logger.debug("Workflow seen on client but this hook does not match the configured trigger.", buildWorkflowClientDebugState({
      workflow,
      hookName,
      item,
      config,
      initiatorUserId,
      shouldHandleTrigger,
      socketAvailable: initialSocketAvailable,
      socketRegistered: initialSocketRegistered
    }));
    return true;
  }

  const shouldExecuteLocally = game.user?.isGM ? shouldGmHandleWorkflowLocally(workflow) : false;
  const shouldRelayToGM = !game.user?.isGM ? shouldPlayerRelayWorkflow({ workflow, item }) : false;
  const sourceToken = getWorkflowSourceToken(workflow);
  const primaryTargetToken = getWorkflowPrimaryTargetToken(workflow, config.trigger);

  logger.debug("Workflow decision state on client.", buildWorkflowClientDebugState({
    workflow,
    hookName,
    item,
    config,
    sourceToken,
    primaryTargetToken,
    initiatorUserId,
    shouldExecuteLocally,
    shouldRelayToGM,
    shouldHandleTrigger,
    socketAvailable: initialSocketAvailable,
    socketRegistered: initialSocketRegistered
  }));

  if (game.user?.isGM && !shouldExecuteLocally) {
    logger.debug("Workflow seen on client and GM chose not to execute locally because this appears to be a player workflow awaiting relay.", buildWorkflowClientDebugState({
      workflow,
      hookName,
      item,
      config,
      sourceToken,
      primaryTargetToken,
      initiatorUserId,
      shouldExecuteLocally,
      shouldRelayToGM,
      shouldHandleTrigger,
      socketAvailable: initialSocketAvailable,
      socketRegistered: initialSocketRegistered
    }));
    return true;
  }

  if (!game.user?.isGM && !shouldRelayToGM) {
    logger.debug("Workflow seen on client but player relay decision is false.", buildWorkflowClientDebugState({
      workflow,
      hookName,
      item,
      config,
      sourceToken,
      primaryTargetToken,
      initiatorUserId,
      shouldExecuteLocally,
      shouldRelayToGM,
      shouldHandleTrigger,
      socketAvailable: initialSocketAvailable,
      socketRegistered: initialSocketRegistered
    }));
    return true;
  }

  const triggerEvaluation = evaluateTriggerCondition({ workflow, trigger: config.trigger, primaryTargetToken });

  if (!triggerEvaluation.shouldExecute) {
    logger.debug(`Workflow seen on client but trigger evaluation blocked execution: ${triggerEvaluation.reason}`, buildWorkflowClientDebugState({
      workflow,
      hookName,
      item,
      config,
      sourceToken,
      primaryTargetToken,
      initiatorUserId,
      shouldExecuteLocally,
      shouldRelayToGM,
      shouldHandleTrigger,
      socketAvailable: initialSocketAvailable,
      socketRegistered: initialSocketRegistered,
      triggerEvaluation
    }));
    storeLastMidiSecondaryAoeExecutionResult(buildMidiExecutionResult({
      executed: false,
      reason: triggerEvaluation.reason,
      executionMode: game.user?.isGM ? "gm-local" : "gm-relay",
      attemptedTargetCount: 0,
      primaryActivityId: String(workflow?.activity?.id ?? workflow?.activity?._id ?? ""),
      secondaryActivityId: config.secondaryActivityId,
      primaryTargetName: getTokenName(primaryTargetToken),
      primaryTargetUuid: getTokenUuid(primaryTargetToken),
      resultSummary: {
        hook: hookName,
        trigger: config.trigger
      }
    }));
    return true;
  }

  logger.debug("Workflow accepted for AoE processing.", buildWorkflowClientDebugState({
    workflow,
    hookName,
    item,
    config,
    sourceToken,
    primaryTargetToken,
    initiatorUserId,
    shouldExecuteLocally,
    shouldRelayToGM,
    shouldHandleTrigger,
    socketAvailable: initialSocketAvailable,
    socketRegistered: initialSocketRegistered,
    triggerEvaluation
  }));

  const localPlanPreview = buildSecondaryAoeExecutionPlan({
    sourceToken,
    primaryTargetToken,
    item,
    primaryActivity: workflow?.activity ?? null
  });

  if (!game.user?.isGM) {
    const relayPreviewPlan = buildStoredPlan(localPlanPreview, {
      hookName,
      config,
      triggerReason: triggerEvaluation.reason,
      item,
      relay: {
        mode: "player-preview",
        detectedByUserId: String(game.user?.id ?? "")
      }
    });
    storeLastMidiSecondaryAoePlan(relayPreviewPlan);

    const relayRequest = buildRelayRequest({
      workflow,
      hookName,
      item,
      config,
      sourceToken,
      primaryTargetToken,
      triggerEvaluation,
      relayPlanPreview: localPlanPreview
    });

    logger.debug("Player detected workflow for authoritative GM relay.", buildWorkflowClientDebugState({
      workflow,
      hookName,
      item,
      config,
      sourceToken,
      primaryTargetToken,
      initiatorUserId,
      shouldExecuteLocally,
      shouldRelayToGM,
      shouldHandleTrigger,
      socketAvailable: initialSocketAvailable,
      socketRegistered: initialSocketRegistered,
      relayRequestPrepared: true,
      triggerEvaluation,
      extra: {
        relayRequest
      }
    }));

    if (!socketlibIntegrationRegistered || !moduleSocket) {
      registerSocketlibIntegration();
    }

    const socketAvailableAfterRegistration = isSocketlibActive();
    const socketRegisteredAfterRegistration = Boolean(socketlibIntegrationRegistered && moduleSocket);

    if (!socketlibIntegrationRegistered || !moduleSocket) {
      logger.warn("Player prepared a relay request but no socket relay is available on this client.", buildWorkflowClientDebugState({
        workflow,
        hookName,
        item,
        config,
        sourceToken,
        primaryTargetToken,
        initiatorUserId,
        shouldExecuteLocally,
        shouldRelayToGM,
        shouldHandleTrigger,
        socketAvailable: socketAvailableAfterRegistration,
        socketRegistered: socketRegisteredAfterRegistration,
        relayRequestPrepared: true,
        relayRequestSent: false,
        triggerEvaluation,
        extra: {
          relayRequest
        }
      }));
      const relayFailureResult = buildRelayFailureResult({
        relayRequest,
        reason: "Socketlib relay is not registered on this client.",
        hookName,
        config,
        triggerEvaluation,
        primaryTargetToken,
        relayPlanPreview: localPlanPreview
      });
      storeLastMidiSecondaryAoeExecutionResult(relayFailureResult);
      logger.warn(`Player relay request could not be sent: ${relayFailureResult.reason}`, relayFailureResult);
      return true;
    }

    logger.debug("Player is sending relay request to GM.", buildWorkflowClientDebugState({
      workflow,
      hookName,
      item,
      config,
      sourceToken,
      primaryTargetToken,
      initiatorUserId,
      shouldExecuteLocally,
      shouldRelayToGM,
      shouldHandleTrigger,
      socketAvailable: socketAvailableAfterRegistration,
      socketRegistered: socketRegisteredAfterRegistration,
      relayRequestPrepared: true,
      relayRequestSent: false,
      triggerEvaluation,
      extra: {
        relayRequest
      }
    }));

    try {
      const relayResult = await moduleSocket.executeAsGM(
        SOCKET_HANDLERS.EXECUTE_SECONDARY_AOE_RELAY,
        relayRequest
      );
      logger.debug("Player sent relay request to GM.", buildWorkflowClientDebugState({
        workflow,
        hookName,
        item,
        config,
        sourceToken,
        primaryTargetToken,
        initiatorUserId,
        shouldExecuteLocally,
        shouldRelayToGM,
        shouldHandleTrigger,
        socketAvailable: socketAvailableAfterRegistration,
        socketRegistered: socketRegisteredAfterRegistration,
        relayRequestPrepared: true,
        relayRequestSent: true,
        triggerEvaluation,
        extra: {
          relayRequest
        }
      }));
      storeLastMidiSecondaryAoeExecutionResult(relayResult);
      const storedResult = getLastMidiSecondaryAoeExecutionResult();
      if (storedResult) {
        logger.debug("Player stored relay result.", {
          storedResult,
          storedExecutionMode: storedResult.executionMode ?? "",
          storedTargetCount: Number(storedResult.attemptedTargetCount ?? 0)
        });
      } else {
        logger.warn("Player received a relay result but could not confirm local storage.", {
          relayResult,
          relayRequest
        });
      }
    } catch (error) {
      logger.warn(`Player relay request failed before a final result could be confirmed: ${error?.message ?? String(error)}`, buildWorkflowClientDebugState({
        workflow,
        hookName,
        item,
        config,
        sourceToken,
        primaryTargetToken,
        initiatorUserId,
        shouldExecuteLocally,
        shouldRelayToGM,
        shouldHandleTrigger,
        socketAvailable: socketAvailableAfterRegistration,
        socketRegistered: socketRegisteredAfterRegistration,
        relayRequestPrepared: true,
        relayRequestSent: false,
        triggerEvaluation,
        extra: {
          relayRequest,
          errorName: error?.name ?? "Error",
          errorMessage: error?.message ?? String(error)
        }
      }));
      const relayFailureResult = buildRelayFailureResult({
        relayRequest,
        reason: error?.message ?? String(error),
        hookName,
        config,
        triggerEvaluation,
        primaryTargetToken,
        relayPlanPreview: localPlanPreview
      });
      storeLastMidiSecondaryAoeExecutionResult(relayFailureResult);
      const storedFailureResult = getLastMidiSecondaryAoeExecutionResult();
      if (!storedFailureResult) {
        logger.warn("Player built a relay failure result but could not confirm local storage.", {
          relayFailureResult,
          relayRequest
        });
      }
      logger.warn(`Player relay request failed: ${relayFailureResult.reason}`, relayFailureResult);
    }

    return true;
  }

  const storedPlan = buildStoredPlan(localPlanPreview, {
    hookName,
    config,
    triggerReason: triggerEvaluation.reason,
    item
  });

  storeLastMidiSecondaryAoePlan(storedPlan);

  const executionResult = await executeSecondaryAoePlan({
    plan: storedPlan,
    executionMode: "gm-local"
  });
  const storedExecutionResult = buildStoredExecutionResult(executionResult, {
    hookName,
    config,
    triggerReason: triggerEvaluation.reason
  });

  storeLastMidiSecondaryAoeExecutionResult(storedExecutionResult);

  if (storedExecutionResult.executed) {
    logger.debug(`Midi-QOL secondary activity executed: ${triggerEvaluation.reason}`, storedExecutionResult);
  } else {
    logger.warn(`Midi-QOL secondary activity not executed: ${storedExecutionResult.reason}`, storedExecutionResult);
  }

  return true;
}

function handleMidiQolAttackRollComplete(workflow) {
  logger.debug("AttackRollComplete callback entered.", buildHookCallbackEntryDebugState({
    hookKey: "ATTACK_COMPLETE",
    workflow
  }));
  return processMidiWorkflow(workflow, MIDI_QOL_HOOKS.ATTACK_COMPLETE);
}

function handleMidiQolRollComplete(workflow) {
  logger.debug("RollComplete callback entered.", buildHookCallbackEntryDebugState({
    hookKey: "ROLL_COMPLETE",
    workflow
  }));
  return processMidiWorkflow(workflow, MIDI_QOL_HOOKS.ROLL_COMPLETE);
}

function registerMidiQolIntegration() {
  if (midiQolHooksRegistered) {
    logger.debug("Midi-QOL hook registration skipped because hooks are already registered.", getMidiHookDebugStatus());
    return;
  }

  if (!isMidiQolActive()) {
    logger.debug("Midi-QOL hook registration skipped because Midi-QOL is not active on this client.", getMidiHookDebugStatus());
    return;
  }

  MIDI_QOL_HOOK_DEBUG.ATTACK_COMPLETE.hookId = Hooks.on(
    MIDI_QOL_HOOKS.ATTACK_COMPLETE,
    handleMidiQolAttackRollComplete
  );
  logger.debug("Midi-QOL AoE hook registered.", buildHookRegistrationDebugState("ATTACK_COMPLETE"));

  MIDI_QOL_HOOK_DEBUG.ROLL_COMPLETE.hookId = Hooks.on(
    MIDI_QOL_HOOKS.ROLL_COMPLETE,
    handleMidiQolRollComplete
  );
  logger.debug("Midi-QOL AoE hook registered.", buildHookRegistrationDebugState("ROLL_COMPLETE"));

  midiQolHooksRegistered = true;
  midiQolHooksRegisteredBy = getUserDebugSummary();
  logger.debug(`Midi-QOL integration active on ${MIDI_QOL_HOOKS.ATTACK_COMPLETE} and ${MIDI_QOL_HOOKS.ROLL_COMPLETE}.`);
  logger.debug(
    "AoE Secondary reminder: automatic triggering requires a complete Midi-QOL workflow. If a player only gets a chat card without automatic rolls, AttackRollComplete/RollComplete will not be reached."
  );
}

export {
  clearLastMidiSecondaryAoeExecutionResult,
  clearLastMidiSecondaryAoePlan,
  getLastMidiSecondaryAoeExecutionResult,
  getLastMidiSecondaryAoePlan,
  getMidiHookDebugStatus,
  handleMidiQolAttackRollComplete,
  handleMidiQolRollComplete,
  registerMidiQolIntegration,
  registerSocketlibIntegration
};
