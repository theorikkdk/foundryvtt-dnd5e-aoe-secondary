/**
 * Return the active scene grid size in pixels.
 *
 * @returns {number}
 */
function getGridSize() {
  return Number(canvas?.grid?.size ?? 100);
}

/**
 * Convert a pixel position to a grid cell coordinate.
 *
 * @param {number} x
 * @param {number} y
 * @returns {{x: number, y: number}}
 */
function getGridCellFromPixels(x, y) {
  const gridSize = getGridSize();
  return {
    x: Math.floor(Number(x) / gridSize),
    y: Math.floor(Number(y) / gridSize)
  };
}

/**
 * Return all grid cells occupied by a token rectangle.
 * This is a preparation helper for future area-on-grid logic.
 *
 * @param {Token|TokenDocument|object} token
 * @returns {Array<{x: number, y: number, key: string}>}
 */
function getTokenOccupiedGridSpaces(token) {
  if (!token) {
    return [];
  }

  const document = token.document ?? token;
  const origin = getGridCellFromPixels(document.x ?? 0, document.y ?? 0);
  const width = Math.max(1, Number(document.width ?? 1));
  const height = Math.max(1, Number(document.height ?? 1));
  const spaces = [];

  for (let offsetY = 0; offsetY < height; offsetY += 1) {
    for (let offsetX = 0; offsetX < width; offsetX += 1) {
      const x = origin.x + offsetX;
      const y = origin.y + offsetY;
      spaces.push({ x, y, key: `${x},${y}` });
    }
  }

  return spaces;
}

/**
 * Return the center point of a grid cell in pixels.
 *
 * @param {{x: number, y: number}} cell
 * @returns {{x: number, y: number}}
 */
function getGridCellCenter(cell) {
  const gridSize = getGridSize();
  return {
    x: (cell.x * gridSize) + (gridSize / 2),
    y: (cell.y * gridSize) + (gridSize / 2)
  };
}

/**
 * Build candidate grid cells around a center point for a circular area preview.
 * This does not decide final inclusion yet; it only prepares a reusable search set.
 *
 * @param {object} params
 * @param {{x: number, y: number}|null} params.centerPoint
 * @param {number} params.radiusUnits
 * @returns {Array<{x: number, y: number, key: string, center: {x: number, y: number}}>} 
 */
function getCandidateGridSpacesAroundPoint({ centerPoint, radiusUnits } = {}) {
  if (!centerPoint) {
    return [];
  }

  const gridSize = getGridSize();
  const gridDistance = Number(canvas?.grid?.distance ?? 5);
  const radiusPixels = (Number(radiusUnits ?? 0) / gridDistance) * gridSize;
  const minCell = getGridCellFromPixels(centerPoint.x - radiusPixels, centerPoint.y - radiusPixels);
  const maxCell = getGridCellFromPixels(centerPoint.x + radiusPixels, centerPoint.y + radiusPixels);
  const cells = [];

  for (let y = minCell.y; y <= maxCell.y; y += 1) {
    for (let x = minCell.x; x <= maxCell.x; x += 1) {
      const center = getGridCellCenter({ x, y });
      cells.push({ x, y, key: `${x},${y}`, center });
    }
  }

  return cells;
}

export {
  getCandidateGridSpacesAroundPoint,
  getGridCellCenter,
  getGridCellFromPixels,
  getGridSize,
  getTokenOccupiedGridSpaces
};
