import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from "react";

interface ImageCanvasProps {
  imageUrl: string;
  gridRows?: number;
  gridCols?: number;
  selectedCells: Set<string>;
  onCellsSelected: (cells: Set<string>) => void;
  showGrid: boolean;
  selectAllMode?: boolean;
}

export interface ImageCanvasRef {
  getImageWithBorders: (skipBorders?: boolean) => string | null;
}

const ImageCanvasComponent = forwardRef<ImageCanvasRef, ImageCanvasProps>(
  ({ imageUrl, gridRows = 5, gridCols = 5, selectedCells, onCellsSelected, showGrid, selectAllMode = false }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [cellSize, setCellSize] = useState({ width: 0, height: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragMode, setDragMode] = useState<"add" | "remove" | null>(null);
    const visitedCellsRef = useRef<Set<string>>(new Set());
    const selectedCellsRef = useRef<Set<string>>(selectedCells);

    useEffect(() => {
      const img = new Image();
      img.crossOrigin = "anonymous"; // Enable CORS for local images
      img.onload = () => {
        setImage(img);
        drawCanvas(img);
      };
      img.src = imageUrl;
    }, [imageUrl]);

    useEffect(() => {
      if (image) {
        drawCanvas(image);
      }
    }, [image, selectedCells, showGrid, gridRows, gridCols, selectAllMode]);

    const drawCanvas = (img: HTMLImageElement) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Set canvas size to match image
      canvas.width = img.width;
      canvas.height = img.height;

      // Draw image
      ctx.drawImage(img, 0, 0);

      // Calculate cell size
      const cellW = img.width / gridCols;
      const cellH = img.height / gridRows;
      setCellSize({ width: cellW, height: cellH });

      if (showGrid) {
        // Draw grid
        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        ctx.lineWidth = 2;

        // Draw vertical lines (columns)
        for (let i = 0; i <= gridCols; i++) {
          ctx.beginPath();
          ctx.moveTo(i * cellW, 0);
          ctx.lineTo(i * cellW, img.height);
          ctx.stroke();
        }

        // Draw horizontal lines (rows)
        for (let i = 0; i <= gridRows; i++) {
          ctx.beginPath();
          ctx.moveTo(0, i * cellH);
          ctx.lineTo(img.width, i * cellH);
          ctx.stroke();
        }

        // Highlight selected cells (skip if selectAllMode is enabled)
        if (!selectAllMode) {
          ctx.fillStyle = "rgba(59, 130, 246, 0.3)";
          ctx.strokeStyle = "rgb(59, 130, 246)";
          ctx.lineWidth = 3;

          selectedCells.forEach((cellId) => {
            const [row, col] = cellId.split("-").map(Number);
            ctx.fillRect(col * cellW, row * cellH, cellW, cellH);
            ctx.strokeRect(col * cellW, row * cellH, cellW, cellH);
          });
        }
      }
    };

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

        // Draw borders around selected cells (skip if selectAllMode or skipBorders is true)
        if (!skipBorders && !selectAllMode) {
          const cellW = image.width / gridCols;
          const cellH = image.height / gridRows;

          tempCtx.strokeStyle = "rgb(59, 130, 246)";
          tempCtx.lineWidth = Math.max(4, Math.min(image.width, image.height) * 0.01);

          selectedCells.forEach((cellId) => {
            const [row, col] = cellId.split("-").map(Number);
            tempCtx.strokeRect(col * cellW, row * cellH, cellW, cellH);
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

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        const col = Math.floor(x / cellSize.width);
        const row = Math.floor(y / cellSize.height);

        // Bounds check
        if (col < 0 || col >= gridCols || row < 0 || row >= gridRows) return null;

        return `${row}-${col}`;
      },
      [image, cellSize, gridCols, gridRows]
    );

    const handleCanvasMouseDown = useCallback(
      (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!showGrid || !image || selectAllMode) return; // Disable cell interaction in select-all mode

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
      },
      [showGrid, image, selectAllMode, getCellFromEvent, selectedCells, onCellsSelected]
    );

    const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDragging || !dragMode || !showGrid || !image || selectAllMode) return;

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

    const handleCanvasMouseUp = useCallback(() => {
      setIsDragging(false);
      setDragMode(null);
      visitedCellsRef.current = new Set();
    }, []);

    // Handle mouse leave to end drag
    const handleCanvasMouseLeave = () => {
      if (isDragging) {
        handleCanvasMouseUp();
      }
    };

    // Add global mouse event listeners for dragging
    useEffect(() => {
      if (!isDragging) return;

      const handleGlobalMouseMove = (e: MouseEvent) => {
        if (!isDragging || !dragMode || !showGrid || !image || selectAllMode) return;

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

    return (
      <div className="relative inline-block">
        <canvas
          ref={canvasRef}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseLeave}
          className="max-w-full h-auto border border-gray-300 rounded-lg cursor-crosshair"
        />
      </div>
    );
  }
);

ImageCanvasComponent.displayName = "ImageCanvas";

export const ImageCanvas = ImageCanvasComponent;
