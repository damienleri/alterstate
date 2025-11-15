export interface CellCoordinates {
  row: number
  col: number
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

export function formatCellsForPrompt(cellIds: string[], gridSize: number = 6): string {
  const coords = getCellCoordinates(cellIds)

  if (coords.length === 0) return ''

  const cellList = coords
    .map((c) => `row ${c.row + 1}, column ${c.col + 1}`)
    .join('; ')

  return `Selected cells in a ${gridSize}x${gridSize} grid: ${cellList}`
}
