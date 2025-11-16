import sharp from "sharp";
import { MAX_IMAGE_WIDTH, MAX_IMAGE_HEIGHT } from "./imageConstants";

export interface CellCoordinates {
  row: number;
  col: number;
}

export function getCellCoordinates(cellIds: string[]): CellCoordinates[] {
  return cellIds.map((cellId) => {
    const [row, col] = cellId.split("-").map(Number);
    return { row, col };
  });
}

export function getCellBounds(cells: CellCoordinates[], imageWidth: number, imageHeight: number, gridSize: number = 6) {
  const cellWidth = imageWidth / gridSize;
  const cellHeight = imageHeight / gridSize;

  const minRow = Math.min(...cells.map((c) => c.row));
  const maxRow = Math.max(...cells.map((c) => c.row));
  const minCol = Math.min(...cells.map((c) => c.col));
  const maxCol = Math.max(...cells.map((c) => c.col));

  return {
    x: minCol * cellWidth,
    y: minRow * cellHeight,
    width: (maxCol - minCol + 1) * cellWidth,
    height: (maxRow - minRow + 1) * cellHeight,
    minRow,
    maxRow,
    minCol,
    maxCol,
  };
}

export function formatCellsForPrompt(cellIds: string[], gridSize: number = 6): string {
  const coords = getCellCoordinates(cellIds);

  if (coords.length === 0) return "";

  const cellList = coords.map((c) => `row ${c.row + 1}, column ${c.col + 1}`).join("; ");

  return `Selected cells in a ${gridSize}x${gridSize} grid: ${cellList}`;
}

/**
 * Resizes an image buffer to fit within MAX_IMAGE_WIDTH and MAX_IMAGE_HEIGHT
 * while maintaining aspect ratio. If the image is already smaller, returns it unchanged.
 *
 * @param imageBuffer - The image buffer to resize
 * @returns A resized image buffer (PNG format)
 */
export async function resizeImageForAI(imageBuffer: Buffer): Promise<Buffer> {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  const width = metadata.width || 0;
  const height = metadata.height || 0;

  // If image is already within limits, return as-is
  if (width <= MAX_IMAGE_WIDTH && height <= MAX_IMAGE_HEIGHT) {
    return imageBuffer;
  }

  // Resize to fit within max dimensions while maintaining aspect ratio
  // 'fit: inside' ensures the image fits within the bounds without cropping
  // 'withoutEnlargement: true' prevents upscaling if already smaller
  const resizedBuffer = await image
    .resize(MAX_IMAGE_WIDTH, MAX_IMAGE_HEIGHT, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();

  const resizedMetadata = await sharp(resizedBuffer).metadata();
  console.log(`[DEBUG] Resized image from ${width}x${height} to ${resizedMetadata.width}x${resizedMetadata.height}`);

  return resizedBuffer;
}
