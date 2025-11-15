import { createCanvas, loadImage } from 'canvas'

export interface CellCoordinates {
  row: number
  col: number
}

export async function drawBordersOnImage(
  imageBuffer: Buffer,
  selectedCells: string[],
  gridSize: number = 6
): Promise<Buffer> {
  const image = await loadImage(imageBuffer)

  const canvas = createCanvas(image.width, image.height)
  const ctx = canvas.getContext('2d')

  // Draw the original image
  ctx.drawImage(image, 0, 0)

  const cellWidth = image.width / gridSize
  const cellHeight = image.height / gridSize

  // Draw borders around selected cells
  ctx.strokeStyle = '#3B82F6' // Blue border
  ctx.lineWidth = Math.max(4, Math.min(image.width, image.height) * 0.01)

  selectedCells.forEach((cellId) => {
    const [row, col] = cellId.split('-').map(Number)

    ctx.strokeRect(
      col * cellWidth,
      row * cellHeight,
      cellWidth,
      cellHeight
    )
  })

  return canvas.toBuffer('image/png')
}

export function getCellCoordinates(cellIds: string[]): CellCoordinates[] {
  return cellIds.map((cellId) => {
    const [row, col] = cellId.split('-').map(Number)
    return { row, col }
  })
}

export function getCellBounds(
  cells: CellCoordinates[],
  imageWidth: number,
  imageHeight: number,
  gridSize: number = 6
) {
  const cellWidth = imageWidth / gridSize
  const cellHeight = imageHeight / gridSize

  const minRow = Math.min(...cells.map((c) => c.row))
  const maxRow = Math.max(...cells.map((c) => c.row))
  const minCol = Math.min(...cells.map((c) => c.col))
  const maxCol = Math.max(...cells.map((c) => c.col))

  return {
    x: minCol * cellWidth,
    y: minRow * cellHeight,
    width: (maxCol - minCol + 1) * cellWidth,
    height: (maxRow - minRow + 1) * cellHeight,
    minRow,
    maxRow,
    minCol,
    maxCol,
  }
}
