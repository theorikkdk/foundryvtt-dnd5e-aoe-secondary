import {
  getEffectiveDistanceMode,
  getSceneTokens,
  getTokenCenterPoint,
  isTokenInsideBurst,
  matchesTargetFilter,
  measureTokenDistanceData,
  resolveSecondaryAoeConfig
} from "./secondary-aoe-service.js";
import {
  getCandidateGridSpacesAroundPoint,
  getTokenOccupiedGridSpaces
} from "./grid-utils.js";

function getTokenId(token) {
  return String(token?.id ?? token?.document?.id ?? "");
}

function getTokenName(token) {
  return String(token?.name ?? token?.document?.name ?? "");
}

function getTokenDisposition(token) {
  return Number(token?.document?.disposition ?? token?.disposition ?? 0);
}

function buildSecondaryAoeCandidateDebugData({
  sourceToken,
  primaryTargetToken,
  candidateToken,
  config
} = {}) {
  const effectiveDistanceMode = getEffectiveDistanceMode(config);
  const distanceData = measureTokenDistanceData({
    originToken: primaryTargetToken,
    targetToken: candidateToken,
    distanceMode: effectiveDistanceMode
  });
  const isPrimaryTarget = candidateToken === primaryTargetToken;
  const insideBurst = isTokenInsideBurst({
    primaryTargetToken,
    candidateToken,
    radius: config.radius,
    distanceMode: effectiveDistanceMode
  });
  const passesTargetFilter = matchesTargetFilter({
    sourceToken,
    candidateToken,
    targetFilter: config.targetFilter
  });

  let included = true;
  let exclusionReason = null;

  if (!config.enabled) {
    included = false;
    exclusionReason = "featureDisabled";
  } else if (config.shape !== "burst") {
    included = false;
    exclusionReason = "unsupportedShape";
  } else if (config.selectionMode === "gridAreaHalfSquare") {
    included = false;
    exclusionReason = "selectionModeNotFinalized";
  } else if (isPrimaryTarget && !config.includePrimaryTarget) {
    included = false;
    exclusionReason = "primaryTargetExcluded";
  } else if (!insideBurst) {
    included = false;
    exclusionReason = "outsideBurst";
  } else if (!passesTargetFilter) {
    included = false;
    exclusionReason = "targetFilterMismatch";
  }

  return {
    token: candidateToken,
    id: getTokenId(candidateToken),
    name: getTokenName(candidateToken),
    disposition: getTokenDisposition(candidateToken),
    selectionMode: config.selectionMode,
    distanceMode: effectiveDistanceMode,
    rawDistance: distanceData.rawDistance,
    effectiveDistance: distanceData.effectiveDistance,
    distance: distanceData.effectiveDistance,
    insideBurst,
    passesTargetFilter,
    isPrimaryTarget,
    included,
    exclusionReason,
    occupiedGridSpaces: getTokenOccupiedGridSpaces(candidateToken)
  };
}

function resolveSecondaryAoeTargets({
  sourceToken,
  primaryTargetToken,
  item,
  tokens,
  config
} = {}) {
  const resolvedConfig = resolveSecondaryAoeConfig({ item, config });
  const center = getTokenCenterPoint(primaryTargetToken);
  const sceneTokens = Array.isArray(tokens) ? tokens : getSceneTokens();
  const candidateTokens = sceneTokens.filter((candidateToken) => {
    return Boolean(candidateToken) && candidateToken !== sourceToken;
  });
  const candidateGridSpaces = getCandidateGridSpacesAroundPoint({
    centerPoint: center,
    radiusUnits: resolvedConfig.radius
  });

  const candidates = candidateTokens.map((candidateToken) => {
    return buildSecondaryAoeCandidateDebugData({
      sourceToken,
      primaryTargetToken,
      candidateToken,
      config: resolvedConfig
    });
  });

  const includedTargets = candidates.filter((candidate) => candidate.included);
  const excludedTargets = candidates.filter((candidate) => !candidate.included);

  return {
    config: resolvedConfig,
    selectionMode: resolvedConfig.selectionMode,
    shape: resolvedConfig.shape,
    radius: resolvedConfig.radius,
    distanceMode: getEffectiveDistanceMode(resolvedConfig),
    center,
    primaryTargetIncluded: includedTargets.some((candidate) => candidate.isPrimaryTarget),
    candidates,
    includedTargets,
    excludedTargets,
    includedTokens: includedTargets.map((candidate) => candidate.token),
    gridPreparation: {
      ready: resolvedConfig.selectionMode === "gridAreaHalfSquare",
      finalized: false,
      note: resolvedConfig.selectionMode === "gridAreaHalfSquare"
        ? "gridAreaHalfSquare is prepared for debug but final inclusion logic is not implemented yet."
        : null,
      primaryTargetOccupiedGridSpaces: getTokenOccupiedGridSpaces(primaryTargetToken),
      candidateGridSpaces
    }
  };
}

export {
  buildSecondaryAoeCandidateDebugData,
  getTokenDisposition,
  getTokenId,
  getTokenName,
  resolveSecondaryAoeTargets
};
