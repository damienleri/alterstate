import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { Minus, Plus, X, Grid3x3, Undo2, RotateCw } from "lucide-react";
import { ImageUpload } from "../components/ImageUpload";
import { ImageCanvas, ImageCanvasRef } from "../components/ImageCanvas";
import { PromptInput } from "../components/PromptInput";
import { ImageGallery } from "../components/ImageGallery";
import { DEFAULT_JUDGE_MODEL_ID, getAvailableJudgeModelIds, getJudgeModelConfig } from "../lib/ai/judge/models";

// Cost per million tokens (moved from backend)
const COST_PER_MILLION_INPUT_TOKENS = 0.3; // $0.30 per million input tokens
const COST_PER_MILLION_OUTPUT_TOKENS = 2.5; // $2.50 per million output tokens

// Helper function to calculate cost from token usage
function calculateCost(usage: { inputTokens: number; outputTokens: number; totalTokens: number } | null) {
  if (!usage) {
    return null;
  }
  return {
    inputCost: (usage.inputTokens / 1_000_000) * COST_PER_MILLION_INPUT_TOKENS,
    outputCost: (usage.outputTokens / 1_000_000) * COST_PER_MILLION_OUTPUT_TOKENS,
    totalCost:
      (usage.inputTokens / 1_000_000) * COST_PER_MILLION_INPUT_TOKENS +
      (usage.outputTokens / 1_000_000) * COST_PER_MILLION_OUTPUT_TOKENS,
  };
}

// Helper function to format duration in milliseconds to a readable string (e.g., "1.2s")
function formatDuration(durationMs: number | undefined): string | null {
  if (durationMs === undefined || durationMs === null) {
    return null;
  }
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
}

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const canvasRef = useRef<ImageCanvasRef>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [currentImage, setCurrentImage] = useState<{
    url: string;
    filename: string;
  } | null>(null);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [showGrid, setShowGrid] = useState(false);
  const [gridRows, setGridRows] = useState(5);
  const [gridCols, setGridCols] = useState(5);
  const [selectAllMode, setSelectAllMode] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [modifiedImage, setModifiedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tokenUsage, setTokenUsage] = useState<{
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  } | null>(null);
  const [cost, setCost] = useState<{
    inputCost: number;
    outputCost: number;
    totalCost: number;
  } | null>(null);
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [scoreThreshold, setScoreThreshold] = useState(8);
  const [judgeModelId, setJudgeModelId] = useState<string>(DEFAULT_JUDGE_MODEL_ID);
  const [judgeScore, setJudgeScore] = useState<number | null>(null);
  const [judgeReasoning, setJudgeReasoning] = useState<string | null>(null);
  const [attemptNumber, setAttemptNumber] = useState<number | null>(null);
  const [allAttempts, setAllAttempts] = useState<
    Array<{
      imageUrl: string;
      judgeScore: number;
      judgeReasoning: string;
      attemptNumber: number;
      usage: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
      } | null;
      judgeUsage: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
      } | null;
      imageGenerationDurationMs?: number;
      judgeDurationMs?: number;
    }>
  >([]);
  const [imageGenerationUsage, setImageGenerationUsage] = useState<{
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  } | null>(null);
  const [judgeUsage, setJudgeUsage] = useState<{
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  } | null>(null);
  const [allAttemptsFailed, setAllAttemptsFailed] = useState(false);
  const [promptHistory, setPromptHistory] = useState<
    Array<{
      filename: string;
      timestamp: string;
      data: {
        selectedCells: string[];
        prompt: string;
        originalFilename: string;
        maxAttempts: number;
        scoreThreshold: number;
        gridRows?: number;
        gridCols?: number;
        judgeModelId?: string;
        attempts: Array<{
          imageUrl: string;
          judgeScore: number;
          judgeReasoning: string;
          attemptNumber: number;
        }>;
      };
    }>
  >([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState("");
  // Track current position in history: [historyIndex, attemptIndex]
  // historyIndex: which history entry we're on (-1 = original image, 0+ = history entries)
  // attemptIndex: which attempt within that entry (0 = best attempt)
  const [currentHistoryPosition, setCurrentHistoryPosition] = useState<[number, number] | null>(null);

  // Fetch history when image is selected
  useEffect(() => {
    if (currentImage) {
      fetchHistoryForImage(currentImage.filename);
    } else {
      setPromptHistory([]);
    }
  }, [currentImage?.filename]);

  const fetchHistoryForImage = async (filename: string) => {
    setLoadingHistory(true);
    try {
      const response = await fetch(`/api/get-history-for-image?filename=${encodeURIComponent(filename)}`);
      const data = await response.json();
      if (data.history) {
        setPromptHistory(data.history);
      }
    } catch (error) {
      console.error("Failed to fetch history:", error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadHistoryEntry = (historyEntry: (typeof promptHistory)[0]) => {
    // Load prompt
    setCurrentPrompt(historyEntry.data.prompt);

    // Load selected cells
    setSelectedCells(new Set(historyEntry.data.selectedCells));

    // Load settings
    setMaxAttempts(historyEntry.data.maxAttempts);
    setScoreThreshold(historyEntry.data.scoreThreshold);

    // Load grid dimensions (if stored, otherwise calculate from selected cells)
    if (historyEntry.data.gridRows && historyEntry.data.gridCols) {
      // Use stored grid dimensions
      setGridRows(historyEntry.data.gridRows);
      setGridCols(historyEntry.data.gridCols);
    } else if (historyEntry.data.selectedCells.length > 0) {
      // Fallback: Calculate grid dimensions from selected cells
      const cellCoords = historyEntry.data.selectedCells.map((cell) => {
        const [row, col] = cell.split("-").map(Number);
        return { row, col };
      });
      const maxRow = Math.max(...cellCoords.map((c) => c.row));
      const maxCol = Math.max(...cellCoords.map((c) => c.col));
      // Set grid to accommodate all selected cells with some padding
      setGridRows(Math.max(5, maxRow + 2));
      setGridCols(Math.max(5, maxCol + 2));
    }
  };

  const handleImageSelected = (url: string, filename: string) => {
    setCurrentImage({ url, filename });
    setSelectedCells(new Set());
    setShowGrid(true);
    setModifiedImage(null);
    setError(null);
    setTokenUsage(null);
    setCost(null);
    setImageGenerationUsage(null);
    setJudgeUsage(null);
    setJudgeScore(null);
    setJudgeReasoning(null);
    setAttemptNumber(null);
    setAllAttempts([]);
    setAllAttemptsFailed(false);
    setGridRows(5);
    setGridCols(5);
    setCurrentPrompt("");
    setSelectAllMode(false);
    // Reset to original image position
    setCurrentHistoryPosition(null);
  };

  const handleGridRowsChange = (delta: number) => {
    const newRows = Math.max(1, Math.min(20, gridRows + delta));
    setGridRows(newRows);
    if (selectAllMode) {
      // Re-select all cells with new grid size
      const allCells = new Set<string>();
      for (let row = 0; row < newRows; row++) {
        for (let col = 0; col < gridCols; col++) {
          allCells.add(`${row}-${col}`);
        }
      }
      setSelectedCells(allCells);
    } else {
      setSelectedCells(new Set()); // Clear selection when grid changes
    }
  };

  const handleGridColsChange = (delta: number) => {
    const newCols = Math.max(1, Math.min(20, gridCols + delta));
    setGridCols(newCols);
    if (selectAllMode) {
      // Re-select all cells with new grid size
      const allCells = new Set<string>();
      for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < newCols; col++) {
          allCells.add(`${row}-${col}`);
        }
      }
      setSelectedCells(allCells);
    } else {
      setSelectedCells(new Set()); // Clear selection when grid changes
    }
  };

  const handleSelectAllModeToggle = (enabled: boolean) => {
    setSelectAllMode(enabled);
    if (enabled) {
      // Select all cells
      const allCells = new Set<string>();
      for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
          allCells.add(`${row}-${col}`);
        }
      }
      setSelectedCells(allCells);
    } else {
      // Clear selection when disabling
      setSelectedCells(new Set());
    }
  };

  const handlePromptSubmit = async (prompt: string) => {
    if (!currentImage || selectedCells.size === 0) {
      setError("Please select at least one cell to modify");
      return;
    }

    // Get image with borders drawn (skip borders if selectAllMode is enabled)
    const imageDataUrl = canvasRef.current?.getImageWithBorders(selectAllMode);
    if (!imageDataUrl) {
      setError("Failed to prepare image");
      return;
    }

    // Create new AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setProcessing(true);
    setError(null); // Clear any previous errors

    try {
      const response = await fetch("/api/modify-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageDataUrl,
          selectedCells: Array.from(selectedCells),
          prompt,
          originalFilename: currentImage.filename,
          maxAttempts,
          scoreThreshold,
          gridRows,
          gridCols,
          judgeModelId,
          selectAllMode,
        }),
        signal: abortController.signal,
      });

      const data = await response.json();

      if (data.success) {
        // New response structure: always includes attempts array
        const attempts = data.attempts || [];
        const bestAttempt = attempts.length > 0 ? attempts[0] : null; // First attempt is best (sorted by score)

        // Add this new history entry to promptHistory
        const newHistoryEntry = {
          filename: `run-${data.timestamp.replace(/[:.]/g, "-")}.json`,
          timestamp: data.timestamp,
          data: {
            selectedCells: data.selectedCells || [],
            prompt: data.prompt,
            originalFilename: data.originalFilename,
            maxAttempts: data.maxAttempts,
            scoreThreshold: data.scoreThreshold,
            gridRows: data.gridRows,
            gridCols: data.gridCols,
            judgeModelId: data.judgeModelId,
            attempts: attempts.map((a: any) => ({
              imageUrl: a.imageUrl,
              judgeScore: a.judgeScore,
              judgeReasoning: a.judgeReasoning || "",
              attemptNumber: a.attemptNumber || 0,
              imageGenerationDurationMs: a.imageGenerationDurationMs,
              judgeDurationMs: a.judgeDurationMs,
            })),
          },
        };

        // Add to history and set position to this new entry
        setPromptHistory((prev) => [newHistoryEntry, ...prev]);

        // Check if any attempt met the threshold
        const metThreshold = bestAttempt && bestAttempt.judgeScore >= scoreThreshold;

        if (metThreshold) {
          // Set position to the new history entry (index 0, best attempt)
          setCurrentHistoryPosition([0, 0]);

          // Best attempt met threshold
          setModifiedImage(bestAttempt.imageUrl);
          setJudgeScore(bestAttempt.judgeScore);
          setJudgeReasoning(bestAttempt.judgeReasoning);
          setAttemptNumber(bestAttempt.attemptNumber);
          setAllAttemptsFailed(false);
          setAllAttempts(attempts);
        } else {
          // All attempts failed to meet threshold
          setAllAttemptsFailed(true);
          setAllAttempts(attempts);
          setModifiedImage(null);
          setJudgeScore(null);
          setJudgeReasoning(null);
          setAttemptNumber(null);
          setCurrentHistoryPosition(null);
        }

        // Set token usage (total, image generation, and judge)
        const totalUsage = data.totalUsage || null;
        setTokenUsage(totalUsage);
        setCost(calculateCost(totalUsage));
        setImageGenerationUsage(data.imageGenerationUsage || null);
        setJudgeUsage(data.judgeUsage || null);
        setShowGrid(true); // Show grid by default after receiving response
        setError(null); // Clear error on success
        // Clear prompt after successful submission
        setCurrentPrompt("");
      } else {
        setError(data.error || "Modification failed");
        setTokenUsage(null);
        setCost(null);
        setImageGenerationUsage(null);
        setJudgeUsage(null);
        setJudgeScore(null);
        setJudgeReasoning(null);
        setAttemptNumber(null);
        setAllAttempts([]);
        setAllAttemptsFailed(false);
      }
    } catch (error: any) {
      if (error.name === "AbortError") {
        // Request was cancelled, don't show error
        return;
      }
      console.error("Modification error:", error);
      setError("Modification failed. Please try again.");
    } finally {
      setProcessing(false);
      abortControllerRef.current = null;
    }
  };

  const handleResetToImageList = () => {
    setCurrentImage(null);
    setSelectedCells(new Set());
    setShowGrid(false);
    setModifiedImage(null);
    setTokenUsage(null);
    setCost(null);
    setImageGenerationUsage(null);
    setJudgeUsage(null);
    setJudgeScore(null);
    setJudgeReasoning(null);
    setAttemptNumber(null);
    setAllAttempts([]);
    setAllAttemptsFailed(false);
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setProcessing(false);
    setError(null);
    // Reset to image list view
    handleResetToImageList();
  };

  const handleToggleGrid = () => {
    setShowGrid(!showGrid);
    if (!showGrid) {
      // When turning grid back on, use the modified image if available
      if (modifiedImage && currentImage) {
        // The modified image becomes the current image for further editing
        setCurrentImage({ url: modifiedImage, filename: currentImage.filename });
        setModifiedImage(null);
        // Reset to original position since we're now editing the modified image
        setCurrentHistoryPosition(null);
      }
    }
  };

  const handleUndo = () => {
    // If we have a modifiedImage, just remove it and go back to the input image
    if (modifiedImage) {
      setModifiedImage(null);
      // Go back to the previous position in history
      if (currentHistoryPosition) {
        const [historyIndex] = currentHistoryPosition;
        // Find the input image: it's either the original or a previous history entry
        if (historyIndex > 0 && promptHistory.length > historyIndex - 1) {
          // Previous history entry's best attempt
          const prevEntry = promptHistory[historyIndex - 1];
          if (prevEntry.data.attempts.length > 0) {
            const bestAttempt = prevEntry.data.attempts[0];
            setCurrentImage({
              url: bestAttempt.imageUrl,
              filename: prevEntry.data.originalFilename,
            });
            setCurrentHistoryPosition([historyIndex - 1, 0]);
          }
        } else {
          // Go back to original image
          setCurrentHistoryPosition(null);
        }
      } else {
        // Already at original, can't undo further
        return;
      }
    } else if (currentHistoryPosition) {
      // We're viewing a history entry, go back one step
      const [historyIndex] = currentHistoryPosition;
      if (historyIndex > 0) {
        // Go to previous history entry
        const prevEntry = promptHistory[historyIndex - 1];
        if (prevEntry.data.attempts.length > 0) {
          const bestAttempt = prevEntry.data.attempts[0];
          setCurrentImage({
            url: bestAttempt.imageUrl,
            filename: prevEntry.data.originalFilename,
          });
          setCurrentHistoryPosition([historyIndex - 1, 0]);
        }
      } else {
        // Go back to original image
        setCurrentHistoryPosition(null);
      }
    } else {
      // Already at original, can't undo
      return;
    }

    setSelectedCells(new Set());
    setShowGrid(true);
    // Clear related state
    setTokenUsage(null);
    setCost(null);
    setImageGenerationUsage(null);
    setJudgeUsage(null);
    setJudgeScore(null);
    setJudgeReasoning(null);
    setAttemptNumber(null);
    setAllAttempts([]);
    setAllAttemptsFailed(false);
  };

  const handleRetry = async () => {
    // Get the most recent history entry (index 0) for retry
    if (promptHistory.length === 0) return;

    const lastEntry = promptHistory[0];
    const {
      prompt,
      selectedCells: contextSelectedCells,
      maxAttempts: contextMaxAttempts,
      scoreThreshold: contextScoreThreshold,
      gridRows: contextGridRows,
      gridCols: contextGridCols,
      judgeModelId: contextJudgeModelId,
    } = lastEntry.data;

    // Determine the input image: if we have a currentHistoryPosition, use that image
    // Otherwise, use the original image or the previous history entry's result
    let inputImageUrl: string;
    let inputFilename: string;

    if (currentHistoryPosition) {
      const [historyIndex, attemptIndex] = currentHistoryPosition;
      if (historyIndex >= 0 && historyIndex < promptHistory.length) {
        const entry = promptHistory[historyIndex];
        if (entry.data.attempts.length > attemptIndex) {
          inputImageUrl = entry.data.attempts[attemptIndex].imageUrl;
          inputFilename = entry.data.originalFilename;
        } else {
          // Fallback to original
          inputImageUrl = currentImage?.url || "";
          inputFilename = currentImage?.filename || "";
        }
      } else {
        inputImageUrl = currentImage?.url || "";
        inputFilename = currentImage?.filename || "";
      }
    } else {
      // Use original image
      inputImageUrl = currentImage?.url || "";
      inputFilename = currentImage?.filename || "";
    }

    if (!inputImageUrl || !currentImage) {
      setError("Cannot retry: no input image available");
      return;
    }

    // Restore the input image
    setCurrentImage({ url: inputImageUrl, filename: inputFilename });
    setModifiedImage(null);
    setSelectedCells(new Set(contextSelectedCells));
    setShowGrid(true);

    // Restore settings
    setMaxAttempts(contextMaxAttempts);
    setScoreThreshold(contextScoreThreshold);
    setGridRows(contextGridRows || 5);
    setGridCols(contextGridCols || 5);
    setJudgeModelId(contextJudgeModelId || DEFAULT_JUDGE_MODEL_ID);
    // Note: selectAllMode is not stored in history, so we'll infer it
    const selectAllMode = contextSelectedCells.length >= (contextGridRows || 5) * (contextGridCols || 5);
    setSelectAllMode(selectAllMode);
    setCurrentPrompt(prompt);

    // Wait a bit for state to update, then submit
    setTimeout(async () => {
      // Get image with borders drawn
      const imageDataUrl = canvasRef.current?.getImageWithBorders(selectAllMode);
      if (!imageDataUrl) {
        setError("Failed to prepare image for retry");
        return;
      }

      // Create new AbortController for this request
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      setProcessing(true);
      setError(null);

      try {
        const response = await fetch("/api/modify-image", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            imageDataUrl,
            selectedCells: Array.from(contextSelectedCells),
            prompt,
            originalFilename: inputFilename,
            maxAttempts: contextMaxAttempts,
            scoreThreshold: contextScoreThreshold,
            gridRows: contextGridRows,
            gridCols: contextGridCols,
            judgeModelId: contextJudgeModelId,
            selectAllMode,
          }),
          signal: abortController.signal,
        });

        const data = await response.json();

        if (data.success) {
          // Process response the same way as handlePromptSubmit
          const attempts = data.attempts || [];
          const bestAttempt = attempts.length > 0 ? attempts[0] : null;

          // Add this new history entry to promptHistory
          const newHistoryEntry = {
            filename: `run-${data.timestamp.replace(/[:.]/g, "-")}.json`,
            timestamp: data.timestamp,
            data: {
              selectedCells: data.selectedCells || [],
              prompt: data.prompt,
              originalFilename: data.originalFilename,
              maxAttempts: data.maxAttempts,
              scoreThreshold: data.scoreThreshold,
              gridRows: data.gridRows,
              gridCols: data.gridCols,
              judgeModelId: data.judgeModelId,
              attempts: attempts.map((a: any) => ({
                imageUrl: a.imageUrl,
                judgeScore: a.judgeScore,
                judgeReasoning: a.judgeReasoning || "",
                attemptNumber: a.attemptNumber || 0,
              })),
            },
          };

          setPromptHistory((prev) => [newHistoryEntry, ...prev]);

          const metThreshold = bestAttempt && bestAttempt.judgeScore >= contextScoreThreshold;

          if (metThreshold) {
            setCurrentHistoryPosition([0, 0]);
            setModifiedImage(bestAttempt.imageUrl);
            setJudgeScore(bestAttempt.judgeScore);
            setJudgeReasoning(bestAttempt.judgeReasoning);
            setAttemptNumber(bestAttempt.attemptNumber);
            setAllAttemptsFailed(false);
            setAllAttempts(attempts);
          } else {
            setAllAttemptsFailed(true);
            setAllAttempts(attempts);
            setModifiedImage(null);
            setJudgeScore(null);
            setJudgeReasoning(null);
            setAttemptNumber(null);
            setCurrentHistoryPosition(null);
          }

          const totalUsage = data.totalUsage || null;
          setTokenUsage(totalUsage);
          setCost(calculateCost(totalUsage));
          setImageGenerationUsage(data.imageGenerationUsage || null);
          setJudgeUsage(data.judgeUsage || null);
          setShowGrid(true);
          setError(null);
          setCurrentPrompt("");
        } else {
          setError(data.error || "Retry failed");
        }
      } catch (error: any) {
        if (error.name === "AbortError") {
          return;
        }
        console.error("Retry error:", error);
        setError("Retry failed. Please try again.");
      } finally {
        setProcessing(false);
        abortControllerRef.current = null;
      }
    }, 100);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">AlterState</h1>
            <p className="text-gray-600 mt-2">Iterative image modification with AI</p>
          </div>
          <Link
            to="/history"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            View History
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Image Display */}
          <div className="lg:col-span-2 space-y-4">
            {!currentImage ? (
              <div className="space-y-6">
                <ImageUpload onImageUploaded={handleImageSelected} />
                <ImageGallery onImageSelected={handleImageSelected} />
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">
                    {modifiedImage ? "Modified Image" : "Original Image"}
                  </h2>
                  <div className="flex gap-2 items-center">
                    {showGrid && (
                      <button
                        onClick={handleToggleGrid}
                        className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-1.5"
                        title="Hide gridlines"
                      >
                        <Grid3x3 className="w-4 h-4" />
                        <span className="hidden sm:inline">Hide Grid</span>
                      </button>
                    )}
                    {!showGrid && (
                      <button
                        onClick={handleToggleGrid}
                        className="px-3 py-1.5 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                      >
                        Show Grid
                      </button>
                    )}
                    {(modifiedImage || currentHistoryPosition !== null) && (
                      <button
                        onClick={handleUndo}
                        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5"
                        title="Undo to previous image"
                      >
                        <Undo2 className="w-4 h-4" />
                        <span className="hidden sm:inline">Undo</span>
                      </button>
                    )}
                    {promptHistory.length > 0 && (
                      <button
                        onClick={handleRetry}
                        disabled={processing}
                        className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Retry last modification with same prompt"
                      >
                        <RotateCw className="w-4 h-4" />
                        <span className="hidden sm:inline">Retry</span>
                      </button>
                    )}
                    {modifiedImage && (
                      <button
                        onClick={handleResetToImageList}
                        className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
                {showGrid && (
                  <div className="flex items-center gap-4 mb-2 p-2 bg-white rounded-lg border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-600">Rows:</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleGridRowsChange(-1)}
                          className="p-1 rounded hover:bg-gray-100 transition-colors"
                          aria-label="Decrease rows"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-sm font-semibold text-gray-900 min-w-[2ch] text-center">{gridRows}</span>
                        <button
                          onClick={() => handleGridRowsChange(1)}
                          className="p-1 rounded hover:bg-gray-100 transition-colors"
                          aria-label="Increase rows"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <div className="w-px h-4 bg-gray-300" />
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-600">Cols:</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleGridColsChange(-1)}
                          className="p-1 rounded hover:bg-gray-100 transition-colors"
                          aria-label="Decrease columns"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-sm font-semibold text-gray-900 min-w-[2ch] text-center">{gridCols}</span>
                        <button
                          onClick={() => handleGridColsChange(1)}
                          className="p-1 rounded hover:bg-gray-100 transition-colors"
                          aria-label="Increase columns"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <div className="w-px h-4 bg-gray-300" />
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="selectAllMode"
                        checked={selectAllMode}
                        onChange={(e) => handleSelectAllModeToggle(e.target.checked)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor="selectAllMode" className="text-xs font-medium text-gray-700 cursor-pointer">
                        Select All
                      </label>
                    </div>
                  </div>
                )}
                <ImageCanvas
                  ref={canvasRef}
                  imageUrl={modifiedImage || currentImage.url}
                  selectedCells={selectedCells}
                  onCellsSelected={setSelectedCells}
                  showGrid={showGrid}
                  gridRows={gridRows}
                  gridCols={gridCols}
                  selectAllMode={selectAllMode}
                />
                {selectedCells.size > 0 && showGrid && (
                  <p className="text-sm text-gray-600">
                    {selectAllMode ? (
                      <>All {selectedCells.size} cells selected (select-all mode)</>
                    ) : (
                      <>
                        {selectedCells.size} cell{selectedCells.size !== 1 ? "s" : ""} selected
                      </>
                    )}
                  </p>
                )}
                {/* Judge Feedback - Current Selected Attempt */}
                {judgeScore !== null && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-xs font-medium text-blue-900 mb-2">Current Selection - Judge Evaluation</p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-blue-900">Score:</span>
                        <span className="text-lg font-bold text-blue-700">{judgeScore}/10</span>
                        {attemptNumber && <span className="text-xs text-blue-600">Attempt {attemptNumber}</span>}
                        {allAttempts.find((a) => a.attemptNumber === attemptNumber)?.imageGenerationDurationMs !==
                          undefined && (
                          <span className="text-xs text-blue-600">
                            Image:{" "}
                            {formatDuration(
                              allAttempts.find((a) => a.attemptNumber === attemptNumber)?.imageGenerationDurationMs
                            ) || "—"}
                          </span>
                        )}
                        {allAttempts.find((a) => a.attemptNumber === attemptNumber)?.judgeDurationMs !== undefined && (
                          <span className="text-xs text-blue-600">
                            Judge:{" "}
                            {formatDuration(
                              allAttempts.find((a) => a.attemptNumber === attemptNumber)?.judgeDurationMs
                            ) || "—"}
                          </span>
                        )}
                      </div>
                      {judgeReasoning && <p className="text-xs text-blue-800">{judgeReasoning}</p>}
                    </div>
                  </div>
                )}

                {/* All Attempts UI - Always show all attempts sorted by priority */}
                {allAttempts.length > 0 && (
                  <div className="mt-4 p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                    <p className="text-sm font-semibold text-gray-900 mb-3">
                      All Attempts (sorted by score, highest first)
                      {!allAttemptsFailed && (
                        <span className="ml-2 text-xs font-normal text-green-600">
                          ✓ Threshold met ({scoreThreshold}/10)
                        </span>
                      )}
                      {allAttemptsFailed && (
                        <span className="ml-2 text-xs font-normal text-yellow-600">
                          ⚠ None met threshold ({scoreThreshold}/10)
                        </span>
                      )}
                    </p>
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {allAttempts.map((attempt) => {
                        const isPassing = attempt.judgeScore >= scoreThreshold;
                        const isSelected = modifiedImage === attempt.imageUrl;
                        return (
                          <div
                            key={attempt.attemptNumber}
                            className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                              isSelected
                                ? "bg-blue-50 border-blue-500 shadow-md"
                                : isPassing
                                  ? "bg-green-50 border-green-300 hover:border-green-400"
                                  : "bg-white border-gray-300 hover:border-gray-400"
                            }`}
                            onClick={() => {
                              setModifiedImage(attempt.imageUrl);
                              setJudgeScore(attempt.judgeScore);
                              setJudgeReasoning(attempt.judgeReasoning);
                              setAttemptNumber(attempt.attemptNumber);
                              setAllAttemptsFailed(!isPassing);
                              // Calculate and display cost for selected attempt if available
                              if (attempt.usage) {
                                setCost(calculateCost(attempt.usage));
                              } else {
                                setCost(null);
                              }
                            }}
                          >
                            <div className="flex items-start gap-3">
                              <div className="relative">
                                <img
                                  src={attempt.imageUrl}
                                  alt={`Attempt ${attempt.attemptNumber}`}
                                  className="w-24 h-24 object-cover rounded border-2 border-gray-200"
                                />
                                {isSelected && (
                                  <div className="absolute -top-1 -right-1 bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                                    ✓
                                  </div>
                                )}
                                {isPassing && !isSelected && (
                                  <div className="absolute -top-1 -right-1 bg-green-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                                    ✓
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span
                                    className={`text-sm font-semibold ${
                                      isPassing ? "text-green-700" : "text-gray-900"
                                    }`}
                                  >
                                    Score: {attempt.judgeScore}/10
                                  </span>
                                  <span className="text-xs text-gray-500">Attempt {attempt.attemptNumber}</span>
                                  {attempt.imageGenerationDurationMs !== undefined && (
                                    <span className="text-xs text-gray-500">
                                      Image: {formatDuration(attempt.imageGenerationDurationMs) || "—"}
                                    </span>
                                  )}
                                  {attempt.judgeDurationMs !== undefined && (
                                    <span className="text-xs text-gray-500">
                                      Judge: {formatDuration(attempt.judgeDurationMs) || "—"}
                                    </span>
                                  )}
                                  {isPassing && (
                                    <span className="text-xs font-medium text-green-600 bg-green-100 px-2 py-0.5 rounded">
                                      Passes threshold
                                    </span>
                                  )}
                                  {isSelected && (
                                    <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-0.5 rounded">
                                      Currently selected
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-600 line-clamp-3">{attempt.judgeReasoning}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Prompt History */}
                {showGrid && currentImage && (
                  <div className="mt-4 bg-white rounded-lg border border-gray-200 shadow-sm p-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Prompt History</h3>
                    {loadingHistory ? (
                      <p className="text-sm text-gray-500">Loading history...</p>
                    ) : promptHistory.length === 0 ? (
                      <p className="text-sm text-gray-500">No previous prompts for this image</p>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {promptHistory.map((entry) => {
                          const bestAttempt =
                            entry.data.attempts.length > 0
                              ? entry.data.attempts[0] // Already sorted by score
                              : null;
                          const bestScore = bestAttempt?.judgeScore || null;
                          const formatDate = (timestamp: string) => {
                            try {
                              return new Date(timestamp).toLocaleString();
                            } catch {
                              return timestamp;
                            }
                          };

                          return (
                            <div
                              key={entry.filename}
                              className="p-3 bg-gray-50 rounded-lg border border-gray-200 hover:border-blue-300 cursor-pointer transition-colors"
                              onClick={() => loadHistoryEntry(entry)}
                            >
                              <div className="flex gap-3">
                                {bestAttempt && (
                                  <img
                                    src={bestAttempt.imageUrl}
                                    alt="Generated image"
                                    className="w-20 h-20 object-cover rounded border border-gray-300 shrink-0"
                                  />
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between mb-1">
                                    <span className="text-xs font-medium text-gray-700">
                                      {formatDate(entry.timestamp)}
                                    </span>
                                    {bestScore !== null && (
                                      <span
                                        className={`text-xs font-semibold ${
                                          bestScore >= entry.data.scoreThreshold ? "text-green-600" : "text-yellow-600"
                                        }`}
                                      >
                                        Score: {bestScore}/10
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm text-gray-900 mb-1 line-clamp-2">{entry.data.prompt}</p>
                                  <div className="flex items-center gap-2 text-xs text-gray-500">
                                    <span>{entry.data.selectedCells.length} cells</span>
                                    <span>•</span>
                                    <span>
                                      {entry.data.attempts.length} attempt{entry.data.attempts.length !== 1 ? "s" : ""}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {tokenUsage && (
                  <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-xs font-medium text-gray-700 mb-3">Token Usage</p>

                    {/* Total Usage */}
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-gray-800 mb-2">Total</p>
                      <div className="grid grid-cols-3 gap-2 text-xs text-gray-600">
                        <div>
                          <span className="font-medium">Input:</span> {tokenUsage.inputTokens.toLocaleString()}
                        </div>
                        <div>
                          <span className="font-medium">Output:</span> {tokenUsage.outputTokens.toLocaleString()}
                        </div>
                        <div>
                          <span className="font-medium">Total:</span> {tokenUsage.totalTokens.toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {/* Image Generation Usage */}
                    {imageGenerationUsage && (
                      <div className="mb-3 pt-3 border-t border-gray-300">
                        <p className="text-xs font-semibold text-gray-800 mb-2">Image Generation</p>
                        <div className="grid grid-cols-3 gap-2 text-xs text-gray-600">
                          <div>
                            <span className="font-medium">Input:</span>{" "}
                            {imageGenerationUsage.inputTokens.toLocaleString()}
                          </div>
                          <div>
                            <span className="font-medium">Output:</span>{" "}
                            {imageGenerationUsage.outputTokens.toLocaleString()}
                          </div>
                          <div>
                            <span className="font-medium">Total:</span>{" "}
                            {imageGenerationUsage.totalTokens.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Judge Usage */}
                    {judgeUsage && (
                      <div className="mb-3 pt-3 border-t border-gray-300">
                        <p className="text-xs font-semibold text-gray-800 mb-2">Judge</p>
                        <div className="grid grid-cols-3 gap-2 text-xs text-gray-600">
                          <div>
                            <span className="font-medium">Input:</span> {judgeUsage.inputTokens.toLocaleString()}
                          </div>
                          <div>
                            <span className="font-medium">Output:</span> {judgeUsage.outputTokens.toLocaleString()}
                          </div>
                          <div>
                            <span className="font-medium">Total:</span> {judgeUsage.totalTokens.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Cost */}
                    {cost && (
                      <div className="pt-3 border-t border-gray-300">
                        <p className="text-xs font-medium text-gray-700 mb-2">Cost</p>
                        <div className="grid grid-cols-3 gap-2 text-xs text-gray-600">
                          <div>
                            <span className="font-medium">Input:</span> ${cost.inputCost.toFixed(6)}
                          </div>
                          <div>
                            <span className="font-medium">Output:</span> ${cost.outputCost.toFixed(6)}
                          </div>
                          <div>
                            <span className="font-medium">Total:</span>{" "}
                            <span className="font-semibold text-gray-900">${cost.totalCost.toFixed(6)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right Column - Controls */}
          {currentImage && showGrid && (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-lg shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Modify Selected Cells</h3>
                  {processing && (
                    <button
                      onClick={handleCancel}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                    >
                      <X className="w-4 h-4" />
                      Cancel
                    </button>
                  )}
                </div>

                <PromptInput
                  onSubmit={handlePromptSubmit}
                  disabled={processing || selectedCells.size === 0}
                  processing={processing}
                  error={error}
                  initialValue={currentPrompt}
                  onValueChange={setCurrentPrompt}
                />

                {!processing && (
                  <button
                    onClick={handleResetToImageList}
                    className="w-full mt-4 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                  >
                    Cancel
                  </button>
                )}

                {/* Judge Settings - Advanced */}
                <div className="mt-4 space-y-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Max Attempts: {maxAttempts}</label>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={maxAttempts}
                      onChange={(e) => setMaxAttempts(Number(e.target.value))}
                      disabled={processing}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>1</span>
                      <span>10</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Score Threshold: {scoreThreshold}
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={scoreThreshold}
                      onChange={(e) => setScoreThreshold(Number(e.target.value))}
                      disabled={processing}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>1</span>
                      <span>10</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Judge Model</label>
                    <select
                      value={judgeModelId}
                      onChange={(e) => setJudgeModelId(e.target.value)}
                      disabled={processing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {getAvailableJudgeModelIds().map((modelId) => {
                        const config = getJudgeModelConfig(modelId);
                        return (
                          <option key={modelId} value={modelId}>
                            {config?.name || modelId}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">How it works:</h4>
                <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                  <li>Click cells on the grid to select them</li>
                  <li>Enter instructions for modifications</li>
                  <li>Submit to generate modified image</li>
                  <li>Toggle grid to continue editing</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
