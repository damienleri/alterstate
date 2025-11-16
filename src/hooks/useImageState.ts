import { useState } from "react";

export interface ImageState {
  url: string;
  filename: string;
}

export function useImageState() {
  const [currentImage, setCurrentImage] = useState<ImageState | null>(null);
  const [modifiedImage, setModifiedImage] = useState<string | null>(null);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [showGrid, setShowGrid] = useState(false);
  const [gridRows, setGridRows] = useState(5);
  const [gridCols, setGridCols] = useState(5);
  const [selectAllMode, setSelectAllMode] = useState(false);

  const resetImageState = () => {
    setCurrentImage(null);
    setSelectedCells(new Set());
    setShowGrid(false);
    setModifiedImage(null);
    setGridRows(5);
    setGridCols(5);
    setSelectAllMode(false);
  };

  const resetToImageList = () => {
    resetImageState();
  };

  return {
    currentImage,
    setCurrentImage,
    modifiedImage,
    setModifiedImage,
    selectedCells,
    setSelectedCells,
    showGrid,
    setShowGrid,
    gridRows,
    setGridRows,
    gridCols,
    setGridCols,
    selectAllMode,
    setSelectAllMode,
    resetImageState,
    resetToImageList,
  };
}

