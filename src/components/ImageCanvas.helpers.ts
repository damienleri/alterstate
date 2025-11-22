import { CoordinatePoint, CoordinateLine } from "./ImageCanvas";

export function drawCoordinateMarker(
  ctx: CanvasRenderingContext2D,
  point: CoordinatePoint,
  imageWidth: number,
  imageHeight: number
) {
  const markerRadius = Math.max(15, Math.min(imageWidth, imageHeight) * 0.02);
  const fontSize = Math.max(12, Math.min(imageWidth, imageHeight) * 0.015);

  ctx.fillStyle = "rgba(59, 130, 246, 0.8)";
  ctx.beginPath();
  ctx.arc(point.x, point.y, markerRadius, 0, 2 * Math.PI);
  ctx.fill();

  ctx.strokeStyle = "rgb(255, 255, 255)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "rgb(255, 255, 255)";
  ctx.font = `bold ${fontSize}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(point.number.toString(), point.x, point.y);
}

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  imageWidth: number,
  imageHeight: number,
  gridRows: number,
  gridCols: number
) {
  const cellW = imageWidth / gridCols;
  const cellH = imageHeight / gridRows;

  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
  ctx.lineWidth = 2;

  for (let i = 0; i <= gridCols; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cellW, 0);
    ctx.lineTo(i * cellW, imageHeight);
    ctx.stroke();
  }

  for (let i = 0; i <= gridRows; i++) {
    ctx.beginPath();
    ctx.moveTo(0, i * cellH);
    ctx.lineTo(imageWidth, i * cellH);
    ctx.stroke();
  }

  return { cellW, cellH };
}

export function drawSelectedCells(
  ctx: CanvasRenderingContext2D,
  selectedCells: Set<string>,
  cellW: number,
  cellH: number
) {
  ctx.fillStyle = "rgba(59, 130, 246, 0.3)";
  ctx.strokeStyle = "rgb(59, 130, 246)";
  ctx.lineWidth = 3;

  selectedCells.forEach((cellId) => {
    const [row, col] = cellId.split("-").map(Number);
    ctx.fillRect(col * cellW, row * cellH, cellW, cellH);
    ctx.strokeRect(col * cellW, row * cellH, cellW, cellH);
  });
}

export function drawCellBorders(
  ctx: CanvasRenderingContext2D,
  selectedCells: Set<string>,
  cellW: number,
  cellH: number,
  lineWidth: number
) {
  ctx.strokeStyle = "rgb(59, 130, 246)";
  ctx.lineWidth = lineWidth;
  const selectedSet = new Set(selectedCells);

  const isSelected = (row: number, col: number): boolean => selectedSet.has(`${row}-${col}`);

  selectedCells.forEach((cellId) => {
    const [row, col] = cellId.split("-").map(Number);
    const x = col * cellW;
    const y = row * cellH;

    if (!isSelected(row - 1, col)) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + cellW, y);
      ctx.stroke();
    }
    if (!isSelected(row, col + 1)) {
      ctx.beginPath();
      ctx.moveTo(x + cellW, y);
      ctx.lineTo(x + cellW, y + cellH);
      ctx.stroke();
    }
    if (!isSelected(row + 1, col)) {
      ctx.beginPath();
      ctx.moveTo(x + cellW, y + cellH);
      ctx.lineTo(x, y + cellH);
      ctx.stroke();
    }
    if (!isSelected(row, col - 1)) {
      ctx.beginPath();
      ctx.moveTo(x, y + cellH);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  });
}

export function getCanvasCoordinates(
  e: React.MouseEvent<HTMLCanvasElement> | MouseEvent,
  canvas: HTMLCanvasElement
): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  return { x, y };
}

export function drawCoordinateLine(
  ctx: CanvasRenderingContext2D,
  line: CoordinateLine,
  imageWidth: number,
  imageHeight: number
) {
  const lineWidth = Math.max(3, Math.min(imageWidth, imageHeight) * 0.005);
  const fontSize = Math.max(12, Math.min(imageWidth, imageHeight) * 0.015);

  ctx.strokeStyle = "rgba(59, 130, 246, 0.8)";
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(line.x1, line.y1);
  ctx.lineTo(line.x2, line.y2);
  ctx.stroke();

  // Draw number label at midpoint
  const midX = (line.x1 + line.x2) / 2;
  const midY = (line.y1 + line.y2) / 2;
  const markerRadius = Math.max(15, Math.min(imageWidth, imageHeight) * 0.02);

  ctx.fillStyle = "rgba(59, 130, 246, 0.8)";
  ctx.beginPath();
  ctx.arc(midX, midY, markerRadius, 0, 2 * Math.PI);
  ctx.fill();

  ctx.strokeStyle = "rgb(255, 255, 255)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "rgb(255, 255, 255)";
  ctx.font = `bold ${fontSize}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(line.number.toString(), midX, midY);
}

export function getPointAtCoordinate(
  x: number,
  y: number,
  coordinatePoints: CoordinatePoint[],
  imageWidth: number,
  imageHeight: number
): number | null {
  const markerRadius = Math.max(15, Math.min(imageWidth, imageHeight) * 0.02);
  const detectionRadius = markerRadius * 3;

  for (let i = 0; i < coordinatePoints.length; i++) {
    const point = coordinatePoints[i];
    const distance = Math.sqrt(Math.pow(x - point.x, 2) + Math.pow(y - point.y, 2));
    if (distance <= detectionRadius) return i;
  }
  return null;
}

export function getLineAtCoordinate(
  x: number,
  y: number,
  coordinateLines: CoordinateLine[],
  imageWidth: number,
  imageHeight: number
): number | null {
  const detectionRadius = Math.max(20, Math.min(imageWidth, imageHeight) * 0.03);

  for (let i = 0; i < coordinateLines.length; i++) {
    const line = coordinateLines[i];
    // Calculate distance from point to line segment
    const A = x - line.x1;
    const B = y - line.y1;
    const C = line.x2 - line.x1;
    const D = line.y2 - line.y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) param = dot / lenSq;

    let xx: number, yy: number;

    if (param < 0) {
      xx = line.x1;
      yy = line.y1;
    } else if (param > 1) {
      xx = line.x2;
      yy = line.y2;
    } else {
      xx = line.x1 + param * C;
      yy = line.y1 + param * D;
    }

    const dx = x - xx;
    const dy = y - yy;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance <= detectionRadius) return i;
  }
  return null;
}

