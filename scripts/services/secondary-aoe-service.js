import { getItemSecondaryAoeConfig, mergeSecondaryAoeConfig } from "../utils/flags.js";

function resolveSecondaryAoeConfig({ item, config } = {}) {
  if (config) {
    return mergeSecondaryAoeConfig(config);
  }

  return getItemSecondaryAoeConfig(item);
}

function getTokenCenterPoint(token) {
  if (!token) {
    return null;
  }

  if (token.center && Number.isFinite(token.center.x) && Number.isFinite(token.center.y)) {
    return { x: token.center.x, y: token.center.y };
  }

  const document = token.document ?? token;
  const width = Number(document.width ?? 1);
  const height = Number(document.height ?? 1);
  const gridSize = Number(canvas?.grid?.size ?? 100);
  const x = Number(document.x);
  const y = Number(document.y);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return {
    x: x + ((width * gridSize) / 2),
    y: y + ((height * gridSize) / 2)
  };
}

function getTokenBounds(token) {
  if (!token) {
    return null;
  }

  const document = token.document ?? token;
  const gridSize = Number(canvas?.grid?.size ?? 100);
  const x = Number(document.x);
  const y = Number(document.y);
  const width = Number(document.width ?? 1) * gridSize;
  const height = Number(document.height ?? 1) * gridSize;

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }

  return {
    left: x,
    right: x + width,
    top: y,
    bottom: y + height
  };
}

function pixelsToDistanceUnits(pixelDistance) {
  const gridSize = Number(canvas?.grid?.size ?? 100);
  const gridDistance = Number(canvas?.grid?.distance ?? 5);

  if (!Number.isFinite(pixelDistance) || gridSize <= 0 || gridDistance <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  return (pixelDistance / gridSize) * gridDistance;
}

function measureTokenCenterDistance(originToken, targetToken) {
  const originPoint = getTokenCenterPoint(originToken);
  const targetPoint = getTokenCenterPoint(targetToken);

  if (!originPoint || !targetPoint) {
    return Number.POSITIVE_INFINITY;
  }

  const dx = targetPoint.x - originPoint.x;
  const dy = targetPoint.y - originPoint.y;
  return pixelsToDistanceUnits(Math.hypot(dx, dy));
}

function measureTokenEdgeDistance(originToken, targetToken) {
  const originBounds = getTokenBounds(originToken);
  const targetBounds = getTokenBounds(targetToken);

  if (!originBounds || !targetBounds) {
    return Number.POSITIVE_INFINITY;
  }

  const horizontalGap = Math.max(
    0,
    originBounds.left - targetBounds.right,
    targetBounds.left - originBounds.right
  );
  const verticalGap = Math.max(
    0,
    originBounds.top - targetBounds.bottom,
    targetBounds.top - originBounds.bottom
  );

  return pixelsToDistanceUnits(Math.hypot(horizontalGap, verticalGap));
}

function getEffectiveDistanceMode(config = {}) {
  if (config.selectionMode === "creatureDistance") {
    return config.distanceMode;
  }

  return config.distanceMode;
}

function measureTokenDistanceData({ originToken, targetToken, distanceMode = "center" } = {}) {
  const rawDistance = measureTokenCenterDistance(originToken, targetToken);
  const effectiveDistance = distanceMode === "edge"
    ? measureTokenEdgeDistance(originToken, targetToken)
    : rawDistance;

  return {
    distanceMode,
    rawDistance,
    effectiveDistance
  };
}

function measureTokenDistance(originToken, targetToken, distanceMode = "center") {
  return measureTokenDistanceData({ originToken, targetToken, distanceMode }).effectiveDistance;
}

function isTokenInsideBurst({ primaryTargetToken, candidateToken, radius, distanceMode = "center" }) {
  return measureTokenDistance(primaryTargetToken, candidateToken, distanceMode) <= radius;
}

function matchesTargetFilter({ sourceToken, candidateToken, targetFilter }) {
  if (targetFilter === "any") {
    return true;
  }

  const sourceDisposition = Number(sourceToken?.document?.disposition ?? sourceToken?.disposition ?? 0);
  const candidateDisposition = Number(candidateToken?.document?.disposition ?? candidateToken?.disposition ?? 0);

  if (!sourceDisposition || !candidateDisposition) {
    return false;
  }

  if (targetFilter === "ally") {
    return sourceDisposition === candidateDisposition;
  }

  if (targetFilter === "enemy") {
    return sourceDisposition !== candidateDisposition;
  }

  return true;
}

function getSceneTokens() {
  return canvas?.tokens?.placeables ?? [];
}

function getSecondaryAoeCandidatesForConfig({
  sourceToken,
  primaryTargetToken,
  config,
  tokens
} = {}) {
  if (!sourceToken || !primaryTargetToken) {
    return [];
  }

  const normalizedConfig = mergeSecondaryAoeConfig(config);
  if (!normalizedConfig.enabled) {
    return [];
  }

  if (normalizedConfig.shape !== "burst") {
    return [];
  }

  if (normalizedConfig.selectionMode !== "creatureDistance") {
    return [];
  }

  const effectiveDistanceMode = getEffectiveDistanceMode(normalizedConfig);
  const candidateTokens = Array.isArray(tokens) ? tokens : getSceneTokens();

  return candidateTokens.filter((candidateToken) => {
    if (!candidateToken || candidateToken === sourceToken) {
      return false;
    }

    if (!normalizedConfig.includePrimaryTarget && candidateToken === primaryTargetToken) {
      return false;
    }

    if (!isTokenInsideBurst({
      primaryTargetToken,
      candidateToken,
      radius: normalizedConfig.radius,
      distanceMode: effectiveDistanceMode
    })) {
      return false;
    }

    if (!matchesTargetFilter({
      sourceToken,
      candidateToken,
      targetFilter: normalizedConfig.targetFilter
    })) {
      return false;
    }

    return true;
  });
}

function getSecondaryAoeTargetTokens({
  sourceToken,
  primaryTargetToken,
  item,
  tokens,
  config
} = {}) {
  const normalizedConfig = resolveSecondaryAoeConfig({ item, config });

  return getSecondaryAoeCandidatesForConfig({
    sourceToken,
    primaryTargetToken,
    config: normalizedConfig,
    tokens
  });
}

export {
  getEffectiveDistanceMode,
  getSceneTokens,
  getSecondaryAoeCandidatesForConfig,
  getSecondaryAoeTargetTokens,
  getTokenBounds,
  getTokenCenterPoint,
  isTokenInsideBurst,
  matchesTargetFilter,
  measureTokenCenterDistance,
  measureTokenDistance,
  measureTokenDistanceData,
  measureTokenEdgeDistance,
  pixelsToDistanceUnits,
  resolveSecondaryAoeConfig
};
