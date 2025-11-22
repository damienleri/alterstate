import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from "react";
import { SEND_COORDINATES_AS_TEXT } from "../utils/constants";
import {
  drawCoordinateMarker,
  drawCoordinateLine,
  drawGrid,
  drawSelectedCells,
  drawCellBorders,
  getCanvasCoordinates,
  getPointAtCoordinate as getPointAtCoordinateHelper,
  getLineAtCoordinate,
} from "./ImageCanvas.helpers";
import { CoordinatePointButton } from "./CoordinatePointButton";

export interface CoordinatePoint {
  x: number;
  y: number;
  number: number;
}

export interface CoordinateLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  number: number;
}

export type CoordinateMarker =
  | { type: "point"; x: number; y: number; number: number }
  | { type: "line"; x1: number; y1: number; x2: number; y2: number; number: number };

interface ImageCanvasProps {
  imageUrl: string;
  gridRows?: number;
  gridCols?: number;
  selectedCells: Set<string>;
  onCellsSelected: (cells: Set<string>) => void;
  showGrid: boolean;
  selectAllMode?: boolean;
  annotationMode?: "grid" | "coords";
  coordinateMarkers?: CoordinateMarker[];
  onCoordinateMarkersChange?: (markers: CoordinateMarker[]) => void;
  coordinateToolMode?: "point" | "line";
  showMarkers?: boolean;
}

export interface ImageCanvasRef {
  getImageWithBorders: (skipBorders?: boolean) => string | null;
}

const ImageCanvasComponent = forwardRef<ImageCanvasRef, ImageCanvasProps>(
  (
    {
      imageUrl,
      gridRows = 5,
      gridCols = 5,
      selectedCells,
      onCellsSelected,
      showGrid,
      selectAllMode = false,
      annotationMode = "grid",
      coordinateMarkers = [],
      onCoordinateMarkersChange,
      coordinateToolMode = "point",
      showMarkers = true,
    },
    ref
  ) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [cellSize, setCellSize] = useState({ width: 0, height: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragMode, setDragMode] = useState<"add" | "remove" | null>(null);
    const visitedCellsRef = useRef<Set<string>>(new Set());
    const selectedCellsRef = useRef<Set<string>>(selectedCells);
    const [hoveredMarkerIndex, setHoveredMarkerIndex] = useState<number | null>(null);
    const [lineStartPoint, setLineStartPoint] = useState<{ x: number; y: number } | null>(null);
    const [currentMousePos, setCurrentMousePos] = useState<{ x: number; y: number } | null>(null);

    useEffect(() => {
      const img = new Image();
      img.crossOrigin = "anonymous"; // Enable CORS for local images
      img.onload = () => {
        setImage(img);
        drawCanvas(img);
      };
      img.src = imageUrl;
    }, [imageUrl]);

    const drawCanvas = useCallback(
      (img: HTMLImageElement) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const cellW = img.width / gridCols;
        const cellH = img.height / gridRows;
        setCellSize({ width: cellW, height: cellH });

        if (annotationMode === "coords" && showMarkers) {
          coordinateMarkers.forEach((marker) => {
            if (marker.type === "point") {
              drawCoordinateMarker(ctx, marker, img.width, img.height);
            } else {
              drawCoordinateLine(ctx, marker, img.width, img.height);
            }
          });
          // Draw preview line if in line mode with start point
          if (coordinateToolMode === "line" && lineStartPoint && currentMousePos) {
            ctx.strokeStyle = "rgba(59, 130, 246, 0.6)";
            ctx.lineWidth = 3;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(lineStartPoint.x, lineStartPoint.y);
            ctx.lineTo(currentMousePos.x, currentMousePos.y);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }

        if (showGrid && annotationMode === "grid") {
          drawGrid(ctx, img.width, img.height, gridRows, gridCols);
          if (!selectAllMode) {
            drawSelectedCells(ctx, selectedCells, cellW, cellH);
          }
        }
      },
      [
        gridRows,
        gridCols,
        annotationMode,
        coordinateMarkers,
        coordinateToolMode,
        showMarkers,
        lineStartPoint,
        currentMousePos,
        showGrid,
        selectAllMode,
        selectedCells,
      ]
    );

    useEffect(() => {
      if (image) {
        drawCanvas(image);
      }
    }, [image, drawCanvas]);

    // Clear line start point when switching tool modes
    useEffect(() => {
      if (coordinateToolMode !== "line") {
        setLineStartPoint(null);
      }
    }, [coordinateToolMode]);

    // Keep selectedCellsRef in sync with selectedCells prop
    useEffect(() => {
      selectedCellsRef.current = selectedCells;
    }, [selectedCells]);

    // Expose method to get image with borders drawn
    useImperativeHandle(ref, () => ({
      getImageWithBorders: (skipBorders: boolean = false) => {
        if (typeof document === "undefined") return null; // SSR guard
        if (!image || !canvasRef.current) return null;

        const tempCanvas = document.createElement("canvas");
        const tempCtx = tempCanvas.getContext("2d");
        if (!tempCtx) return null;

        tempCanvas.width = image.width;
        tempCanvas.height = image.height;

        // Draw original image
        tempCtx.drawImage(image, 0, 0);

        if (!skipBorders && !selectAllMode && annotationMode === "grid") {
          const cellW = image.width / gridCols;
          const cellH = image.height / gridRows;
          const lineWidth = Math.max(4, Math.min(image.width, image.height) * 0.01);
          drawCellBorders(tempCtx, selectedCells, cellW, cellH, lineWidth);
        }

        if (!skipBorders && annotationMode === "coords" && showMarkers && !SEND_COORDINATES_AS_TEXT) {
          coordinateMarkers.forEach((marker) => {
            if (marker.type === "point") {
              drawCoordinateMarker(tempCtx, marker, image.width, image.height);
            } else {
              drawCoordinateLine(tempCtx, marker, image.width, image.height);
            }
          });
        }

        return tempCanvas.toDataURL("image/png");
      },
    }));

    const getCellFromEvent = useCallback(
      (e: React.MouseEvent<HTMLCanvasElement> | MouseEvent): string | null => {
        if (!image || cellSize.width === 0 || cellSize.height === 0) return null;
        const canvas = canvasRef.current;
        if (!canvas) return null;

        const coords = getCanvasCoordinates(e, canvas);
        if (!coords) return null;

        const col = Math.floor(coords.x / cellSize.width);
        const row = Math.floor(coords.y / cellSize.height);
        if (col < 0 || col >= gridCols || row < 0 || row >= gridRows) return null;

        return `${row}-${col}`;
      },
      [image, cellSize, gridCols, gridRows]
    );

    const getCoordinateFromEvent = useCallback(
      (e: React.MouseEvent<HTMLCanvasElement> | MouseEvent): { x: number; y: number } | null => {
        if (!image) return null;
        const canvas = canvasRef.current;
        if (!canvas) return null;

        const coords = getCanvasCoordinates(e, canvas);
        if (!coords || coords.x < 0 || coords.x >= canvas.width || coords.y < 0 || coords.y >= canvas.height)
          return null;

        return coords;
      },
      [image]
    );

    // Helper to find marker at coordinate
    const getMarkerAtCoordinate = useCallback(
      (x: number, y: number): number | null => {
        if (!image) return null;
        for (let i = 0; i < coordinateMarkers.length; i++) {
          const marker = coordinateMarkers[i];
          if (marker.type === "point") {
            const pointIndex = getPointAtCoordinateHelper(
              x,
              y,
              [{ x: marker.x, y: marker.y, number: marker.number }],
              image.width,
              image.height
            );
            if (pointIndex !== null) return i;
          } else {
            const lineIndex = getLineAtCoordinate(
              x,
              y,
              [{ x1: marker.x1, y1: marker.y1, x2: marker.x2, y2: marker.y2, number: marker.number }],
              image.width,
              image.height
            );
            if (lineIndex !== null) return i;
          }
        }
        return null;
      },
      [coordinateMarkers, image]
    );

    // Helper to get the next number
    const getNextNumber = useCallback((): number => {
      const allNumbers = coordinateMarkers.map((m) => m.number);
      return allNumbers.length > 0 ? Math.max(...allNumbers) + 1 : 1;
    }, [coordinateMarkers]);

    // Helper to renumber all markers sequentially
    const renumberMarkers = useCallback((markers: CoordinateMarker[]): CoordinateMarker[] => {
      // Sort by original number to preserve creation order
      const sorted = [...markers].sort((a, b) => a.number - b.number);
      // Renumber sequentially
      return sorted.map((marker, index) => ({ ...marker, number: index + 1 }));
    }, []);

    const handleCanvasMouseDown = useCallback(
      (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!image) return;

        // Handle coordinate mode
        if (annotationMode === "coords" && onCoordinateMarkersChange) {
          const coord = getCoordinateFromEvent(e);
          if (!coord) return;

          // Check if clicking on an existing marker (for deletion)
          const markerIndex = getMarkerAtCoordinate(coord.x, coord.y);
          if (markerIndex !== null) {
            // Don't delete here, let the hover button handle it
            return;
          }

          if (coordinateToolMode === "point") {
            // Add new point
            const nextNumber = getNextNumber();
            const newMarkers = [
              ...coordinateMarkers,
              { type: "point" as const, x: coord.x, y: coord.y, number: nextNumber },
            ];
            onCoordinateMarkersChange(newMarkers);
            return;
          }

          if (coordinateToolMode === "line") {
            // Handle line drawing: first click sets start, second click sets end
            if (lineStartPoint === null) {
              // First click - set start point
              setLineStartPoint(coord);
            } else {
              // Second click - create line
              const nextNumber = getNextNumber();
              const newMarkers = [
                ...coordinateMarkers,
                {
                  type: "line" as const,
                  x1: lineStartPoint.x,
                  y1: lineStartPoint.y,
                  x2: coord.x,
                  y2: coord.y,
                  number: nextNumber,
                },
              ];
              onCoordinateMarkersChange(newMarkers);
              setLineStartPoint(null);
            }
            return;
          }
        }

        // Handle grid mode
        if (annotationMode === "grid" && showGrid && !selectAllMode) {
          const cellId = getCellFromEvent(e);
          if (!cellId) return;

          setIsDragging(true);
          visitedCellsRef.current = new Set([cellId]);

          // Determine drag mode based on initial cell state
          const initialSelected = selectedCells.has(cellId);
          setDragMode(initialSelected ? "remove" : "add");

          // Toggle the initial cell
          const newSelectedCells = new Set(selectedCells);
          if (initialSelected) {
            newSelectedCells.delete(cellId);
          } else {
            newSelectedCells.add(cellId);
          }
          onCellsSelected(newSelectedCells);
        }
      },
      [
        image,
        annotationMode,
        showGrid,
        selectAllMode,
        getCellFromEvent,
        getCoordinateFromEvent,
        getMarkerAtCoordinate,
        getNextNumber,
        selectedCells,
        onCellsSelected,
        coordinateMarkers,
        onCoordinateMarkersChange,
        coordinateToolMode,
        lineStartPoint,
      ]
    );

    const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!image) return;

      // Handle coordinate mode hover
      if (annotationMode === "coords") {
        const coord = getCoordinateFromEvent(e);
        if (coord) {
          setCurrentMousePos(coord);
          const markerIndex = getMarkerAtCoordinate(coord.x, coord.y);
          setHoveredMarkerIndex(markerIndex);
        } else {
          setCurrentMousePos(null);
          setHoveredMarkerIndex(null);
        }
        // Redraw canvas to show preview line if in line mode with start point
        if (coordinateToolMode === "line" && lineStartPoint && image) {
          drawCanvas(image);
        }
        return;
      }

      // Handle grid mode dragging
      if (isDragging && dragMode && showGrid && !selectAllMode && annotationMode === "grid") {
        const cellId = getCellFromEvent(e);
        if (!cellId || visitedCellsRef.current.has(cellId)) return;

        // Mark this cell as visited
        visitedCellsRef.current.add(cellId);

        // Update selection based on drag mode
        const newSelectedCells = new Set(selectedCellsRef.current);
        if (dragMode === "add") {
          newSelectedCells.add(cellId);
        } else {
          newSelectedCells.delete(cellId);
        }
        onCellsSelected(newSelectedCells);
      }
    };

    const handleCanvasMouseUp = useCallback(() => {
      setIsDragging(false);
      setDragMode(null);
      visitedCellsRef.current = new Set();
    }, []);

    // Add global mouse event listeners for dragging
    useEffect(() => {
      if (!isDragging) return;

      const handleGlobalMouseMove = (e: MouseEvent) => {
        if (!isDragging || !dragMode || !showGrid || !image || selectAllMode || annotationMode !== "grid") return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        // Check if mouse is still over canvas
        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
          return;
        }

        const cellId = getCellFromEvent(e);
        if (!cellId || visitedCellsRef.current.has(cellId)) return;

        // Mark this cell as visited
        visitedCellsRef.current.add(cellId);

        // Update selection based on drag mode
        const newSelectedCells = new Set(selectedCellsRef.current);
        if (dragMode === "add") {
          newSelectedCells.add(cellId);
        } else {
          newSelectedCells.delete(cellId);
        }
        onCellsSelected(newSelectedCells);
      };

      window.addEventListener("mousemove", handleGlobalMouseMove);
      window.addEventListener("mouseup", handleCanvasMouseUp);

      return () => {
        window.removeEventListener("mousemove", handleGlobalMouseMove);
        window.removeEventListener("mouseup", handleCanvasMouseUp);
      };
    }, [isDragging, dragMode, showGrid, image, selectAllMode, onCellsSelected, getCellFromEvent, handleCanvasMouseUp]);

    const handleDeleteMarker = useCallback(
      (index: number) => {
        if (!onCoordinateMarkersChange) return;
        const newMarkers = coordinateMarkers.filter((_, i) => i !== index);
        const renumbered = renumberMarkers(newMarkers);
        onCoordinateMarkersChange(renumbered);
      },
      [coordinateMarkers, onCoordinateMarkersChange, renumberMarkers]
    );

    const getMarkerPosition = useCallback((marker: CoordinateMarker): { left: number; top: number } | null => {
      if (!canvasRef.current || !containerRef.current) return null;
      const canvas = canvasRef.current;
      const container = containerRef.current;
      const rect = canvas.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const scaleX = rect.width / canvas.width;
      const scaleY = rect.height / canvas.height;

      if (marker.type === "point") {
        return {
          left: rect.left - containerRect.left + marker.x * scaleX,
          top: rect.top - containerRect.top + marker.y * scaleY,
        };
      } else {
        const midX = (marker.x1 + marker.x2) / 2;
        const midY = (marker.y1 + marker.y2) / 2;
        return {
          left: rect.left - containerRect.left + midX * scaleX,
          top: rect.top - containerRect.top + midY * scaleY,
        };
      }
    }, []);

    return (
      <div ref={containerRef} className="relative inline-block">
        <canvas
          ref={canvasRef}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={(e) => {
            if (isDragging) {
              handleCanvasMouseUp();
            }
            setCurrentMousePos(null);
            // Only clear hover if we're not moving to a button (which is outside the canvas)
            const relatedTarget = e.relatedTarget as HTMLElement;
            if (!relatedTarget || !relatedTarget.closest("[data-point-button]")) {
              // Small delay to allow mouse to reach button
              setTimeout(() => {
                // Check if mouse is still not over a button
                const activeElement = document.elementFromPoint(e.clientX, e.clientY);
                if (!activeElement?.closest("[data-point-button]")) {
                  setHoveredMarkerIndex(null);
                }
              }, 10);
            }
          }}
          className="max-w-full h-auto border border-gray-300 rounded-lg"
        />
        {annotationMode === "coords" &&
          showMarkers &&
          coordinateMarkers.map((marker, index) => {
            const position = getMarkerPosition(marker);
            if (!position || !image || !canvasRef.current) return null;

            const pointData =
              marker.type === "point"
                ? marker
                : { x: (marker.x1 + marker.x2) / 2, y: (marker.y1 + marker.y2) / 2, number: marker.number };

            return (
              <CoordinatePointButton
                key={index}
                point={pointData}
                index={index}
                position={position}
                isHovered={hoveredMarkerIndex === index}
                imageWidth={image.width}
                imageHeight={image.height}
                canvasWidth={canvasRef.current.width}
                onDelete={() => handleDeleteMarker(index)}
                onHover={() => setHoveredMarkerIndex(index)}
                onHoverEnd={() => setHoveredMarkerIndex(null)}
              />
            );
          })}
      </div>
    );
  }
);

ImageCanvasComponent.displayName = "ImageCanvas";

export const ImageCanvas = ImageCanvasComponent;
