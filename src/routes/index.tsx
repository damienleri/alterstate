import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { Minus, Plus, X, Grid3x3, Undo2, Edit } from "lucide-react";
import { ImageUpload } from "../components/ImageUpload";
import { ImageCanvas, ImageCanvasRef } from "../components/ImageCanvas";
import { ImageGallery } from "../components/ImageGallery";
import { ThumbnailRow } from "../components/ThumbnailRow";
import { TokenUsageDisplay } from "../components/TokenUsageDisplay";
import { DEFAULT_JUDGE_MODEL_ID } from "../lib/ai/judge/models";
import { formatDuration } from "../utils/cost";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { z } from "zod";
import {
  DEFAULT_GRID_ROWS,
  DEFAULT_GRID_COLS,
  MIN_GRID_SIZE,
  MAX_GRID_SIZE,
  GRID_FALLBACK_MIN,
  GRID_FALLBACK_PADDING,
  generateAllCells,
  calculateGridDimensions,
} from "../utils/grid";
import { formatDate } from "../utils/date";
import { fetchHistoryForImage } from "../utils/history";
import { uuidv7 } from "uuidv7";

const indexSearchSchema = z.object({
  imageUrl: z.string().optional(),
  imageFilename: z.string().optional(),
  tab: z.enum(["generated", "uploaded"]).optional(),
});

export const Route = createFileRoute("/")({
  validateSearch: indexSearchSchema,
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/" });
  const canvasRef = useRef<ImageCanvasRef>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [currentImage, setCurrentImage] = useState<{
    url: string;
    filename: string;
  } | null>(null);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [showGrid, setShowGrid] = useState(false);
  const [gridRows, setGridRows] = useState(DEFAULT_GRID_ROWS);
  const [gridCols, setGridCols] = useState(DEFAULT_GRID_COLS);
  const [selectAllMode, setSelectAllMode] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [modifiedImage, setModifiedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tokenUsage, setTokenUsage] = useState<{
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  } | null>(null);
  const DEFAULT_ATTEMPTS = 3;
  const [judgeModelId, setJudgeModelId] = useState<string>(DEFAULT_JUDGE_MODEL_ID);
  const [useJudges, setUseJudges] = useState<boolean>(false);

  // New state for parallel generation tracking
  interface GenerationAttempt {
    generationId: string;
    status: "pending" | "generating" | "completed" | "judging" | "judged";
    imageUrl: string | null;
    judgeScore: number | null;
    judgeSelectedAreasChanged: number | null;
    judgeSelectedAreasCorrect: number | null;
    judgeNothingElseChanged: number | null;
    judgeReasoning: string | null;
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
  }

  const [generationAttempts, setGenerationAttempts] = useState<GenerationAttempt[]>([]);
  const [selectedGenerationId, setSelectedGenerationId] = useState<string | null>(null);

  // Legacy state for backward compatibility with history
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
  const [promptHistory, setPromptHistory] = useState<
    Array<{
      filename: string;
      timestamp: string;
      data: {
        selectedCells: string[];
        prompt: string;
        originalFilename: string;
        maxAttempts: number;
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
  const [activeNavTab, setActiveNavTab] = useState<"generated" | "uploaded" | "history">(
    (search.tab as "generated" | "uploaded") || "generated"
  );

  // Sync activeNavTab with URL search param
  useEffect(() => {
    if (search.tab && (search.tab === "generated" || search.tab === "uploaded")) {
      setActiveNavTab(search.tab);
    }
  }, [search.tab]);

  // Shared function to generate N attempts
  const generateAttempts = async (
    count: number,
    imageDataUrl: string,
    selectedCells: string[],
    prompt: string,
    originalFilename: string,
    gridRows: number,
    gridCols: number,
    judgeModelId: string,
    selectAllMode: boolean,
    runId: string,
    appendToExisting: boolean = false,
    useJudges: boolean = false
  ) => {
    // Create or reuse AbortController
    if (!abortControllerRef.current) {
      abortControllerRef.current = new AbortController();
    }

    // Create temp generation IDs upfront
    const timestamp = Date.now();
    const tempGenerationIds = Array.from({ length: count }, (_, i) => `pending-${timestamp}-${i}`);

    // Initialize attempts array with pending status
    if (!appendToExisting) {
      const initialAttempts: GenerationAttempt[] = tempGenerationIds.map((id) => ({
        generationId: id,
        status: "pending",
        imageUrl: null,
        judgeScore: null,
        judgeSelectedAreasChanged: null,
        judgeSelectedAreasCorrect: null,
        judgeNothingElseChanged: null,
        judgeReasoning: null,
        usage: null,
        judgeUsage: null,
      }));
      setGenerationAttempts(initialAttempts);
    } else {
      // Append new pending attempts
      const newAttempts: GenerationAttempt[] = tempGenerationIds.map((id) => ({
        generationId: id,
        status: "pending",
        imageUrl: null,
        judgeScore: null,
        judgeSelectedAreasChanged: null,
        judgeSelectedAreasCorrect: null,
        judgeNothingElseChanged: null,
        judgeReasoning: null,
        usage: null,
        judgeUsage: null,
      }));
      setGenerationAttempts((prev) => [...prev, ...newAttempts]);
    }

    try {
      // Spawn all parallel generation requests
      const allPromises = Array.from({ length: count }, (_, i) => {
        const tempGenerationId = tempGenerationIds[i];

        return fetch("/api/generate-image", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            imageDataUrl,
            selectedCells,
            prompt,
            originalFilename,
            gridRows,
            gridCols,
            judgeModelId,
            selectAllMode,
            runId,
          }),
          signal: abortControllerRef.current?.signal,
        })
          .then(async (response) => {
            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || "Generation failed");
            }
            return response.json();
          })
          .then(async (genData) => {
            if (!genData.success) {
              throw new Error(genData.error || "Generation failed");
            }

            // Update attempt with generation result - find by tempGenerationId
            setGenerationAttempts((prev) => {
              const updated = [...prev];
              const foundIndex = updated.findIndex((a) => a.generationId === tempGenerationId);
              if (foundIndex !== -1) {
                updated[foundIndex] = {
                  generationId: genData.generationId,
                  status: "completed",
                  imageUrl: genData.imageUrl,
                  judgeScore: null,
                  judgeSelectedAreasChanged: null,
                  judgeSelectedAreasCorrect: null,
                  judgeNothingElseChanged: null,
                  judgeReasoning: null,
                  usage: genData.usage || null,
                  judgeUsage: null,
                  imageGenerationDurationMs: genData.durationMs,
                };
              }
              return updated;
            });

            // Conditionally trigger judge request
            if (useJudges) {
              const judgeRunId = genData.runId || runId;

              // Set status to "judging"
              setGenerationAttempts((prev) => {
                const updated = [...prev];
                const attemptIndex = updated.findIndex((a) => a.generationId === genData.generationId);
                if (attemptIndex !== -1) {
                  updated[attemptIndex] = {
                    ...updated[attemptIndex],
                    status: "judging",
                  };
                }
                return updated;
              });

              // Trigger judge
              const judgeResponse = await fetch("/api/judge-generation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ runId: judgeRunId, generationId: genData.generationId }),
                signal: abortControllerRef.current?.signal,
              });

              if (judgeResponse.ok) {
                const judgeData = await judgeResponse.json();
                if (judgeData.success) {
                  setGenerationAttempts((prev) => {
                    const updated = [...prev];
                    const attemptIndex = updated.findIndex((a) => a.generationId === genData.generationId);
                    if (attemptIndex !== -1) {
                      updated[attemptIndex] = {
                        ...updated[attemptIndex],
                        status: "judged",
                        judgeScore: judgeData.judgeResult.score,
                        judgeSelectedAreasChanged: judgeData.judgeResult.selectedAreasChanged,
                        judgeSelectedAreasCorrect: judgeData.judgeResult.selectedAreasCorrect,
                        judgeNothingElseChanged: judgeData.judgeResult.nothingElseChanged,
                        judgeReasoning: judgeData.judgeResult.reasoning,
                        judgeUsage: judgeData.judgeResult.usage || null,
                        judgeDurationMs: judgeData.judgeResult.durationMs,
                      };
                    }
                    return updated;
                  });
                }
              }
            } else {
              // If not using judges, mark as completed without judging
              setGenerationAttempts((prev) => {
                const updated = [...prev];
                const attemptIndex = updated.findIndex((a) => a.generationId === genData.generationId);
                if (attemptIndex !== -1) {
                  updated[attemptIndex] = {
                    ...updated[attemptIndex],
                    status: "completed",
                  };
                }
                return updated;
              });
            }

            return genData;
          });
      });

      // Wait for all generations to complete
      await Promise.all(allPromises);

      // Update best attempt and token usage after all are completed/judged
      setGenerationAttempts((prev) => {
        const allCompleted = useJudges
          ? prev.filter((a) => a.status === "judged")
          : prev.filter((a) => a.status === "completed");

        if (allCompleted.length > 0) {
          // Find the best attempt (by judge score if using judges, otherwise just pick first)
          const bestAttempt = useJudges
            ? [...allCompleted].sort((a, b) => (b.judgeScore || 0) - (a.judgeScore || 0))[0]
            : allCompleted[0];

          if (bestAttempt && bestAttempt.imageUrl) {
            setModifiedImage(bestAttempt.imageUrl);
            setJudgeScore(bestAttempt.judgeScore);
            setJudgeReasoning(bestAttempt.judgeReasoning);
            setSelectedGenerationId(bestAttempt.generationId);
          }

          // Update token usage totals
          const totalImageUsage = prev.reduce(
            (acc, a) => {
              if (a.usage) {
                acc.inputTokens += a.usage.inputTokens;
                acc.outputTokens += a.usage.outputTokens;
                acc.totalTokens += a.usage.totalTokens;
              }
              return acc;
            },
            { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
          );

          const totalJudgeUsage = prev.reduce(
            (acc, a) => {
              if (a.judgeUsage) {
                acc.inputTokens += a.judgeUsage.inputTokens;
                acc.outputTokens += a.judgeUsage.outputTokens;
                acc.totalTokens += a.judgeUsage.totalTokens;
              }
              return acc;
            },
            { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
          );

          const totalUsage = {
            inputTokens: totalImageUsage.inputTokens + totalJudgeUsage.inputTokens,
            outputTokens: totalImageUsage.outputTokens + totalJudgeUsage.outputTokens,
            totalTokens: totalImageUsage.totalTokens + totalJudgeUsage.totalTokens,
          };

          setTokenUsage(totalUsage);
          setImageGenerationUsage(totalImageUsage);
          setJudgeUsage(totalJudgeUsage);
        }
        return prev;
      });

      return runId;
    } catch (error: any) {
      if (error.name === "AbortError") {
        throw error;
      }
      console.error("Generation error:", error);
      throw error;
    }
  };

  // Load image from URL query parameter
  useEffect(() => {
    if (search.imageUrl && search.imageFilename) {
      // Only set if it's different from current to avoid loops
      if (!currentImage || currentImage.filename !== search.imageFilename) {
        setCurrentImage({ url: search.imageUrl, filename: search.imageFilename });
        setSelectedCells(new Set());
        setShowGrid(true);
        setModifiedImage(null);
        setError(null);
        setTokenUsage(null);
        setImageGenerationUsage(null);
        setJudgeUsage(null);
        setJudgeScore(null);
        setJudgeReasoning(null);
        setAttemptNumber(null);
        setAllAttempts([]);
        // Grid dimensions will be calculated when image loads
        setGridRows(DEFAULT_GRID_ROWS);
        setGridCols(DEFAULT_GRID_COLS);
        setCurrentPrompt("");
        setSelectAllMode(false);
        setCurrentHistoryPosition(null);
        setGenerationAttempts([]);
        setSelectedGenerationId(null);
      }
    } else {
      // Clear image if no query param
      if (currentImage) {
        setCurrentImage(null);
        setSelectedCells(new Set());
        setShowGrid(false);
        setModifiedImage(null);
        setTokenUsage(null);
        setImageGenerationUsage(null);
        setJudgeUsage(null);
        setJudgeScore(null);
        setJudgeReasoning(null);
        setAttemptNumber(null);
        setAllAttempts([]);
      }
    }
  }, [search.imageUrl, search.imageFilename]);

  // Calculate grid dimensions based on image aspect ratio when image loads
  useEffect(() => {
    if (!currentImage?.url) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const { rows, cols } = calculateGridDimensions(img.width, img.height);
      setGridRows(rows);
      setGridCols(cols);
    };
    img.onerror = () => {
      // Fallback to defaults if image fails to load
      setGridRows(DEFAULT_GRID_ROWS);
      setGridCols(DEFAULT_GRID_COLS);
    };
    img.src = currentImage.url;
  }, [currentImage?.url]);

  const loadHistoryForImage = async (filename: string) => {
    setLoadingHistory(true);
    try {
      const history = await fetchHistoryForImage(filename);
      if (history) {
        setPromptHistory(history);
      }
    } finally {
      setLoadingHistory(false);
    }
  };

  // Fetch history when image is selected
  useEffect(() => {
    if (currentImage) {
      loadHistoryForImage(currentImage.filename);
    } else {
      setPromptHistory([]);
    }
  }, [currentImage?.filename]);

  const loadHistoryEntry = (historyEntry: (typeof promptHistory)[0]) => {
    // Load prompt
    setCurrentPrompt(historyEntry.data.prompt);

    // Load selected cells
    setSelectedCells(new Set(historyEntry.data.selectedCells));

    // Load settings (maxAttempts is no longer used, always 3)

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
      setGridRows(Math.max(GRID_FALLBACK_MIN, maxRow + GRID_FALLBACK_PADDING));
      setGridCols(Math.max(GRID_FALLBACK_MIN, maxCol + GRID_FALLBACK_PADDING));
    }
  };

  const handleImageSelected = (url: string, filename: string) => {
    // Navigate to the image using query parameters
    navigate({
      to: "/",
      search: {
        imageUrl: url,
        imageFilename: filename,
        tab: activeNavTab !== "history" ? activeNavTab : undefined,
      },
    });
  };

  const handleGridRowsChange = (delta: number) => {
    const newRows = Math.max(MIN_GRID_SIZE, Math.min(MAX_GRID_SIZE, gridRows + delta));
    setGridRows(newRows);
    setSelectedCells(selectAllMode ? generateAllCells(newRows, gridCols) : new Set());
  };

  const handleGridColsChange = (delta: number) => {
    const newCols = Math.max(MIN_GRID_SIZE, Math.min(MAX_GRID_SIZE, gridCols + delta));
    setGridCols(newCols);
    setSelectedCells(selectAllMode ? generateAllCells(gridRows, newCols) : new Set());
  };

  const handleSelectAllModeToggle = (enabled: boolean) => {
    setSelectAllMode(enabled);
    setSelectedCells(enabled ? generateAllCells(gridRows, gridCols) : new Set());
  };

  const handlePromptSubmit = async (prompt: string) => {
    if (!prompt.trim()) {
      setError("Please enter a prompt");
      return;
    }
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
    setError(null);
    setModifiedImage(null);
    setSelectedGenerationId(null);

    // Generate runId on client side for all parallel requests
    const runId = uuidv7();

    try {
      // Use modify-image API which returns all attempts at once (2 LLM calls × 3 images each = up to 6 images)
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
          gridRows,
          gridCols,
          judgeModelId,
          selectAllMode,
          maxAttempts: 2, // 2 LLM calls, each requesting 3 varied images
          runId,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Image modification failed");
      }

      const data = await response.json();
      if (!data.success || !data.attempts) {
        throw new Error("Invalid response from server");
      }

      // Convert API response attempts to GenerationAttempt format
      const attempts: GenerationAttempt[] = data.attempts.map((attempt: any) => ({
        generationId: `attempt-${attempt.attemptNumber}-${runId}`,
        status: "judged" as const,
        imageUrl: attempt.imageUrl,
        judgeScore: attempt.judgeScore,
        judgeSelectedAreasChanged: attempt.judgeSelectedAreasChanged,
        judgeSelectedAreasCorrect: attempt.judgeSelectedAreasCorrect,
        judgeNothingElseChanged: attempt.judgeNothingElseChanged,
        judgeReasoning: attempt.judgeReasoning,
        usage: attempt.usage,
        judgeUsage: attempt.judgeUsage,
        imageGenerationDurationMs: attempt.imageGenerationDurationMs,
        judgeDurationMs: attempt.judgeDurationMs,
      }));

      // Sort by score (highest first) - already sorted by API but ensure it
      attempts.sort((a, b) => (b.judgeScore || 0) - (a.judgeScore || 0));

      // Update state with all attempts
      setGenerationAttempts(attempts);
      
      // Set the best attempt as selected
      if (attempts.length > 0 && attempts[0].imageUrl) {
        setSelectedGenerationId(attempts[0].generationId);
        setModifiedImage(attempts[0].imageUrl);
        setJudgeScore(attempts[0].judgeScore);
        setJudgeReasoning(attempts[0].judgeReasoning);
      }

      // Set token usage
      if (data.totalUsage) {
        setTokenUsage(data.totalUsage);
        setImageGenerationUsage(data.imageGenerationUsage);
        setJudgeUsage(data.judgeUsage);
      }

      // Convert to legacy format for history
      const legacyAttempts = attempts.map((a, idx) => ({
        imageUrl: a.imageUrl || "",
        judgeScore: a.judgeScore || 0,
        judgeReasoning: a.judgeReasoning || "",
        attemptNumber: idx + 1,
        usage: a.usage,
        judgeUsage: a.judgeUsage,
        imageGenerationDurationMs: a.imageGenerationDurationMs,
        judgeDurationMs: a.judgeDurationMs,
      }));

      setAllAttempts(legacyAttempts);

      // Save to history using data from API response
      const timestamp = new Date().toISOString();
      const historyEntry = {
        filename: `run-${runId}.json`,
        timestamp,
        data: {
          success: true,
          runId,
          selectedCells: Array.from(selectedCells),
          prompt,
          originalFilename: currentImage.filename,
          maxAttempts: 2, // 2 LLM calls
          gridRows,
          gridCols,
          judgeModelId,
          attempts: legacyAttempts,
          totalUsage: data.totalUsage,
          imageGenerationUsage: data.imageGenerationUsage,
          judgeUsage: data.judgeUsage,
          timestamp,
        },
      };

      // Save history via API
      fetch("/api/save-history", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(historyEntry.data),
      }).catch((err) => console.error("Failed to save history:", err));

      setPromptHistory((prev) => [historyEntry, ...prev]);

      setShowGrid(false);
      setError(null);
      // Keep prompt visible after generation - don't clear it
    } catch (error: any) {
      if (error.name === "AbortError") {
        return;
      }
      console.error("Modification error:", error);
      setError("Modification failed. Please try again.");
      setGenerationAttempts([]);
    } finally {
      setProcessing(false);
      abortControllerRef.current = null;
    }
  };

  const handleResetToImageList = () => {
    // Navigate back to list view (clear image query param)
    navigate({
      to: "/",
      search: {
        tab: activeNavTab !== "history" ? activeNavTab : undefined,
      },
    });
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
    setImageGenerationUsage(null);
    setJudgeUsage(null);
    setJudgeScore(null);
    setJudgeReasoning(null);
    setAttemptNumber(null);
    setAllAttempts([]);
  };

  const handleGenerateOneMore = async () => {
    // Get the most recent history entry to reuse prompt and settings
    if (promptHistory.length === 0) {
      setError("No previous generation to continue from");
      return;
    }

    if (!currentImage) {
      setError("No image available");
      return;
    }

    const lastEntry = promptHistory[0];
    const {
      prompt,
      selectedCells: contextSelectedCells,
      gridRows: contextGridRows,
      gridCols: contextGridCols,
      judgeModelId: contextJudgeModelId,
    } = lastEntry.data;

    // Infer selectAllMode from history (not stored, so we infer it)
    const inferredSelectAllMode =
      contextSelectedCells.length >= (contextGridRows || DEFAULT_GRID_ROWS) * (contextGridCols || DEFAULT_GRID_COLS);

    // Get image with borders drawn
    const imageDataUrl = canvasRef.current?.getImageWithBorders(inferredSelectAllMode);
    if (!imageDataUrl) {
      setError("Failed to prepare image");
      return;
    }

    // Create new runId for this additional generation
    const runId = uuidv7();

    // Create new AbortController if needed
    if (!abortControllerRef.current) {
      abortControllerRef.current = new AbortController();
    }

    try {
      // Use shared function to generate 1 more attempt (append to existing)
      await generateAttempts(
        1,
        imageDataUrl,
        Array.from(contextSelectedCells),
        prompt,
        currentImage.filename,
        contextGridRows || DEFAULT_GRID_ROWS,
        contextGridCols || DEFAULT_GRID_COLS,
        contextJudgeModelId || DEFAULT_JUDGE_MODEL_ID,
        inferredSelectAllMode,
        runId,
        true, // append to existing attempts
        useJudges
      );
    } catch (error: any) {
      if (error.name === "AbortError") {
        return;
      }
      console.error("Generate one more error:", error);
      setError("Failed to generate additional attempt. Please try again.");
    }
  };

  const handleEditImage = () => {
    if (!currentImage) return;

    // If we're editing a modified image, use it as the new original
    const imageUrl = modifiedImage || currentImage.url;
    let filename = currentImage.filename;

    // If using modified image, extract filename from URL
    if (modifiedImage) {
      const urlMatch = modifiedImage.match(/\/api\/images-modified\/(.+)$/);
      if (urlMatch) {
        filename = urlMatch[1];
      }
    }

    // Set this image as the current image for editing
    setCurrentImage({ url: imageUrl, filename });

    // Prefill prompt with the last prompt used (current prompt or most recent from history)
    let lastPrompt = currentPrompt;
    if (!lastPrompt && promptHistory.length > 0) {
      lastPrompt = promptHistory[0].data.prompt;
    }

    // Clear generation state for a fresh start
    setModifiedImage(null);
    setGenerationAttempts([]);
    setSelectedGenerationId(null);
    setSelectedCells(new Set());
    setCurrentPrompt(lastPrompt || "");
    setError(null);
    setTokenUsage(null);
    setImageGenerationUsage(null);
    setJudgeUsage(null);
    setJudgeScore(null);
    setJudgeReasoning(null);
    setAttemptNumber(null);
    setAllAttempts([]);
    setCurrentHistoryPosition(null);

    // Show grid to allow selecting cells
    setShowGrid(true);

    // Navigate to update URL if using modified image
    if (modifiedImage) {
      navigate({
        to: "/",
        search: {
          imageUrl: imageUrl,
          imageFilename: filename,
          tab: activeNavTab !== "history" ? activeNavTab : undefined,
        },
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-start mb-2">
          <Tabs
            value={activeNavTab}
            onValueChange={(value) => {
              if (value === "history") {
                navigate({ to: "/history" });
              } else {
                const newTab = value as "generated" | "uploaded";
                setActiveNavTab(newTab);
                // Navigate to list view with the selected tab
                navigate({
                  to: "/",
                  search: {
                    tab: newTab,
                  },
                });
              }
            }}
          >
            <TabsList className="h-8">
              <TabsTrigger value="generated" className="text-xs px-3 py-1">
                Generated images
              </TabsTrigger>
              <TabsTrigger value="uploaded" className="text-xs px-3 py-1">
                Uploaded images
              </TabsTrigger>
              <TabsTrigger value="history" className="text-xs px-3 py-1">
                History
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Image Display */}
          <div className="lg:col-span-2 space-y-4">
            {!currentImage ? (
              <div className="space-y-6">
                <ImageUpload onImageUploaded={handleImageSelected} />
                <ImageGallery
                  onImageSelected={handleImageSelected}
                  activeTab={activeNavTab === "history" ? "generated" : activeNavTab}
                />
              </div>
            ) : (
              <>
                <div className="flex items-center mb-2 flex-wrap gap-2">
                  {showGrid && (
                    <>
                      <div className="flex items-center gap-2 px-2 py-1 bg-gray-50 rounded-lg border border-gray-200">
                        <span className="text-xs font-medium text-gray-600">Rows:</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleGridRowsChange(-1)}
                            className="p-1 rounded hover:bg-gray-200 transition-colors"
                            aria-label="Decrease rows"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-sm font-semibold text-gray-900 min-w-[2ch] text-center">
                            {gridRows}
                          </span>
                          <button
                            onClick={() => handleGridRowsChange(1)}
                            className="p-1 rounded hover:bg-gray-200 transition-colors"
                            aria-label="Increase rows"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 px-2 py-1 bg-gray-50 rounded-lg border border-gray-200">
                        <span className="text-xs font-medium text-gray-600">Cols:</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleGridColsChange(-1)}
                            className="p-1 rounded hover:bg-gray-200 transition-colors"
                            aria-label="Decrease columns"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-sm font-semibold text-gray-900 min-w-[2ch] text-center">
                            {gridCols}
                          </span>
                          <button
                            onClick={() => handleGridColsChange(1)}
                            className="p-1 rounded hover:bg-gray-200 transition-colors"
                            aria-label="Increase columns"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 px-2 py-1 bg-gray-50 rounded-lg border border-gray-200">
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
                      <div className="flex items-center gap-2 px-2 py-1 bg-gray-50 rounded-lg border border-gray-200">
                        <input
                          type="checkbox"
                          id="useJudges"
                          checked={useJudges}
                          onChange={(e) => setUseJudges(e.target.checked)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <label htmlFor="useJudges" className="text-xs font-medium text-gray-700 cursor-pointer">
                          Use Judges
                        </label>
                      </div>
                    </>
                  )}
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
                  <button
                    onClick={handleResetToImageList}
                    className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Back to Images
                  </button>
                </div>
                <div className="relative inline-block">
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
                  {currentImage && (
                    <div className="absolute top-4 right-4 z-10">
                      <button
                        onClick={handleEditImage}
                        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-lg"
                        title="Edit this image - change prompt and start a new run"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Read-only Prompt Display - Show when processing or after generation */}
                {(processing || generationAttempts.length > 0) && currentPrompt && (
                  <div className="mt-2 bg-white rounded-lg border border-gray-200 shadow-sm px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded text-xs text-gray-900 flex-1">
                        {currentPrompt}
                      </div>
                      {processing && (
                        <button
                          onClick={handleCancel}
                          className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Thumbnail Row - Parallel Generations */}
                <ThumbnailRow
                  generationAttempts={generationAttempts}
                  selectedGenerationId={selectedGenerationId}
                  onThumbnailClick={(attempt) => {
                    setSelectedGenerationId(attempt.generationId);
                    setModifiedImage(attempt.imageUrl);
                    setJudgeScore(attempt.judgeScore);
                    setJudgeReasoning(attempt.judgeReasoning);
                  }}
                  onMoreClick={handleGenerateOneMore}
                  canRetry={promptHistory.length > 0}
                  processing={processing}
                  originalImage={currentImage}
                  modifiedImage={modifiedImage}
                  onOriginalImageClick={() => {
                    setSelectedGenerationId(null);
                    setModifiedImage(null);
                    setJudgeScore(null);
                    setJudgeReasoning(null);
                  }}
                  onPromptSubmit={handlePromptSubmit}
                  promptInitialValue={currentPrompt}
                  onPromptChange={setCurrentPrompt}
                  hasSelectedCells={selectedCells.size > 0}
                  promptError={error}
                />

                {/* Judge Feedback - Current Selected Attempt */}
                {(() => {
                  const selectedAttempt = selectedGenerationId
                    ? generationAttempts.find((a) => a.generationId === selectedGenerationId)
                    : null;
                  const hasJudgeScores =
                    selectedAttempt &&
                    selectedAttempt.judgeSelectedAreasChanged !== null &&
                    selectedAttempt.judgeSelectedAreasCorrect !== null &&
                    selectedAttempt.judgeNothingElseChanged !== null;

                  return hasJudgeScores && selectedAttempt ? (
                    <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-sm font-medium text-blue-900 mb-2">Current Selection - Judge Evaluation</p>
                      <div className="space-y-2">
                        <div className="grid grid-cols-3 gap-3">
                          <div className="bg-white rounded p-2 border border-blue-200">
                            <p className="text-xs text-gray-600 mb-1">Changed</p>
                            <p className="text-lg font-bold text-blue-700">
                              {selectedAttempt.judgeSelectedAreasChanged}/10
                            </p>
                          </div>
                          <div className="bg-white rounded p-2 border border-blue-200">
                            <p className="text-xs text-gray-600 mb-1">Correct</p>
                            <p className="text-lg font-bold text-blue-700">
                              {selectedAttempt.judgeSelectedAreasCorrect}/10
                            </p>
                          </div>
                          <div className="bg-white rounded p-2 border border-blue-200">
                            <p className="text-xs text-gray-600 mb-1">Preserved</p>
                            <p className="text-lg font-bold text-blue-700">
                              {selectedAttempt.judgeNothingElseChanged}/10
                            </p>
                          </div>
                        </div>
                        {selectedAttempt.judgeReasoning && (
                          <p className="text-sm text-blue-800">{selectedAttempt.judgeReasoning}</p>
                        )}
                      </div>
                    </div>
                  ) : null;
                })()}

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
                                      <span className={`text-xs font-semibold ${"text-gray-700"}`}>
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

                <TokenUsageDisplay
                  tokenUsage={tokenUsage}
                  imageGenerationUsage={imageGenerationUsage}
                  judgeUsage={judgeUsage}
                />
              </>
            )}
          </div>

          {/* Right Column - Empty for now, can be used for future features */}
          {currentImage && showGrid && <div className="space-y-6"></div>}
        </div>
      </div>
    </div>
  );
}
