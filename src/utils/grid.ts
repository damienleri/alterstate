// Grid dimension constants
export const DEFAULT_GRID_ROWS = 6;
export const DEFAULT_GRID_COLS = 6;
export const MIN_GRID_SIZE = 1;
export const MAX_GRID_SIZE = 20;
export const GRID_FALLBACK_MIN = 5;
export const GRID_FALLBACK_PADDING = 2;

/**
 * Generate all cell IDs for a grid of given dimensions
 * @param rows Number of rows in the grid
 * @param cols Number of columns in the grid
 * @returns Set of cell IDs in format "row-col"
 */
export function generateAllCells(rows: number, cols: number): Set<string> {
  const allCells = new Set<string>();
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      allCells.add(`${row}-${col}`);
    }
  }
  return allCells;
}

/**
 * Calculate grid dimensions based on image aspect ratio
 * @param imageWidth Width of the image
 * @param imageHeight Height of the image
 * @returns Object with rows and cols for the grid
 */
export function calculateGridDimensions(imageWidth: number, imageHeight: number): { rows: number; cols: number } {
  const aspectRatio = imageWidth / imageHeight;

  // Start with a base grid size (aim for around 36 total cells)
  const baseSize = 10;

  // Calculate dimensions that maintain aspect ratio
  // If image is wider (aspectRatio > 1), more cols than rows
  // If image is taller (aspectRatio < 1), more rows than cols
  let cols = Math.round(baseSize * Math.sqrt(aspectRatio));
  let rows = Math.round(baseSize / Math.sqrt(aspectRatio));

  // Ensure we stay within bounds
  cols = Math.max(MIN_GRID_SIZE, Math.min(MAX_GRID_SIZE, cols));
  rows = Math.max(MIN_GRID_SIZE, Math.min(MAX_GRID_SIZE, rows));

  return { rows, cols };
}
