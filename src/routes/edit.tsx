import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { Minus, Plus, X, Grid3x3, Undo2, ArrowLeft } from "lucide-react";
import { ImageCanvas, ImageCanvasRef } from "../components/ImageCanvas";
import { ThumbnailRow } from "../components/ThumbnailRow";
import { TokenUsageDisplay } from "../components/TokenUsageDisplay";
import { DEFAULT_JUDGE_MODEL_ID } from "../lib/ai/judge/models";
import { z } from "zod";
import {
  DEFAULT_GRID_ROWS,
  DEFAULT_GRID_COLS,
  MIN_GRID_SIZE,
  MAX_GRID_SIZE,
  generateAllCells,
  calculateGridDimensions,
} from "../utils/grid";
import { uuidv7 } from "uuidv7";
import { DEFAULT_IMAGES_PER_RUN, IMAGES_PER_LLM_CALL, calculateLLMCallsNeeded } from "../utils/generationConstants";

const editSearchSchema = z.object({
  images: z.array(z.string()).optional(),
});

export const Route = createFileRoute("/edit")({
  validateSearch: editSearchSchema,
  component: EditView,
});

interface ImageData {
  id: string;
  url: string;
  filename: string;
  type: "uploaded" | "generated";
}

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

function EditView() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/edit" });
  const canvasRefs = useRef<(ImageCanvasRef | null)[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [selectedImages, setSelectedImages] = useState<ImageData[]>([]);
  const [selectedCells, setSelectedCells] = useState<Set<string>[]>([]);
  const [showGrid, setShowGrid] = useState<boolean[]>([]);
  const [gridRows, setGridRows] = useState<number[]>([]);
  const [gridCols, setGridCols] = useState<number[]>([]);
  const [selectAllMode, setSelectAllMode] = useState<boolean[]>([]);
  const [processing, setProcessing] = useState(false);
  const [modifiedImages, setModifiedImages] = useState<(string | null)[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tokenUsage, setTokenUsage] = useState<{
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  } | null>(null);
  const [judgeModelId, setJudgeModelId] = useState<string>(DEFAULT_JUDGE_MODEL_ID);
  const [useJudges, setUseJudges] = useState<boolean>(false);
  const [generationAttempts, setGenerationAttempts] = useState<GenerationAttempt[]>([]);
  const [selectedGenerationId, setSelectedGenerationId] = useState<string | null>(null);
  const [currentPrompt, setCurrentPrompt] = useState("");

  // Load images from URL params
  useEffect(() => {
    if (!search.images || search.images.length === 0) {
      // No images selected, redirect to gallery
      navigate({ to: "/" });
      return;
    }

    if (search.images.length > 2) {
      setError("Maximum 2 images can be selected");
      return;
    }

    // Load image data from API
    const loadImages = async () => {
      try {
        const response = await fetch("/api/list-images");
        const data = await response.json();
        const imageIndex = new Map(
          data.images.map((img: any) => [img.id, { id: img.id, url: img.url, filename: img.filename, type: img.type }])
        );

        const loadedImages: ImageData[] = [];
        for (const id of search.images) {
          const imageData = imageIndex.get(id);
          if (imageData) {
            loadedImages.push(imageData);
          }
        }

        if (loadedImages.length !== search.images.length) {
          setError("Some images could not be found");
          return;
        }

        setSelectedImages(loadedImages);
        // Initialize state arrays
        setSelectedCells(loadedImages.map(() => new Set<string>()));
        setShowGrid(loadedImages.map(() => true));
        setGridRows(loadedImages.map(() => DEFAULT_GRID_ROWS));
        setGridCols(loadedImages.map(() => DEFAULT_GRID_COLS));
        setSelectAllMode(loadedImages.map(() => false));
        setModifiedImages(loadedImages.map(() => null));
        canvasRefs.current = loadedImages.map(() => null);
      } catch (err) {
        console.error("Failed to load images:", err);
        setError("Failed to load images");
      }
    };

    loadImages();
  }, [search.images, navigate]);

  // Calculate grid dimensions for each image
  useEffect(() => {
    selectedImages.forEach((image, index) => {
      if (!image.url) return;

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const { rows, cols } = calculateGridDimensions(img.width, img.height);
        setGridRows((prev) => {
          const newRows = [...prev];
          newRows[index] = rows;
          return newRows;
        });
        setGridCols((prev) => {
          const newCols = [...prev];
          newCols[index] = cols;
          return newCols;
        });
      };
      img.onerror = () => {
        setGridRows((prev) => {
          const newRows = [...prev];
          newRows[index] = DEFAULT_GRID_ROWS;
          return newRows;
        });
        setGridCols((prev) => {
          const newCols = [...prev];
          newCols[index] = DEFAULT_GRID_COLS;
          return newCols;
        });
      };
      img.src = image.url;
    });
  }, [selectedImages]);

  const handleGridRowsChange = (index: number, delta: number) => {
    setGridRows((prev) => {
      const newRows = [...prev];
      newRows[index] = Math.max(MIN_GRID_SIZE, Math.min(MAX_GRID_SIZE, newRows[index] + delta));
      return newRows;
    });
    if (selectAllMode[index]) {
      setSelectedCells((prev) => {
        const newCells = [...prev];
        newCells[index] = generateAllCells(gridRows[index], gridCols[index]);
        return newCells;
      });
    }
  };

  const handleGridColsChange = (index: number, delta: number) => {
    setGridCols((prev) => {
      const newCols = [...prev];
      newCols[index] = Math.max(MIN_GRID_SIZE, Math.min(MAX_GRID_SIZE, newCols[index] + delta));
      return newCols;
    });
    if (selectAllMode[index]) {
      setSelectedCells((prev) => {
        const newCells = [...prev];
        newCells[index] = generateAllCells(gridRows[index], gridCols[index]);
        return newCells;
      });
    }
  };

  const handleSelectAllModeToggle = (index: number, enabled: boolean) => {
    setSelectAllMode((prev) => {
      const newModes = [...prev];
      newModes[index] = enabled;
      return newModes;
    });
    setSelectedCells((prev) => {
      const newCells = [...prev];
      newCells[index] = enabled ? generateAllCells(gridRows[index], gridCols[index]) : new Set();
      return newCells;
    });
  };

  const generateAttempts = async (
    count: number,
    imageDataUrls: string[],
    selectedCellsArrays: string[][],
    prompt: string,
    originalFilenames: string[],
    gridRowsArrays: number[],
    gridColsArrays: number[],
    judgeModelId: string,
    selectAllModeArray: boolean[],
    runId: string,
    appendToExisting: boolean = false,
    useJudges: boolean = false
  ) => {
    if (!abortControllerRef.current) {
      abortControllerRef.current = new AbortController();
    }

    const timestamp = Date.now();
    const tempGenerationIds = Array.from({ length: count }, (_, i) => `pending-${timestamp}-${i}`);

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
      // For now, generate for the first image only (multi-image generation will be handled later)
      const imageDataUrl = imageDataUrls[0];
      const selectedCells = selectedCellsArrays[0];
      const originalFilename = originalFilenames[0];
      const gridRows = gridRowsArrays[0];
      const gridCols = gridColsArrays[0];
      const selectAllMode = selectAllModeArray[0];

      const llmCallsNeeded = calculateLLMCallsNeeded(count);
      const allPromises = Array.from({ length: llmCallsNeeded }, (_, callIndex) => {
        const startSlotIndex = callIndex * IMAGES_PER_LLM_CALL;
        const slotsForThisCall = tempGenerationIds.slice(startSlotIndex, startSlotIndex + IMAGES_PER_LLM_CALL);

        setGenerationAttempts((prev) => {
          const updated = [...prev];
          slotsForThisCall.forEach((tempId) => {
            const foundIndex = updated.findIndex((a) => a.generationId === tempId);
            if (foundIndex !== -1) {
              updated[foundIndex] = {
                ...updated[foundIndex],
                status: "generating",
              };
            }
          });
          return updated;
        });

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
            if (!genData.success || !genData.generations) {
              throw new Error(genData.error || "Generation failed");
            }

            const generations = genData.generations as Array<{
              generationId: string;
              imageUrl: string;
              usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
              imageIndex: number;
            }>;

            setGenerationAttempts((prev) => {
              const updated = [...prev];
              generations.forEach((gen, genIndex) => {
                const slotIndex = startSlotIndex + genIndex;
                if (slotIndex < tempGenerationIds.length) {
                  const tempId = tempGenerationIds[slotIndex];
                  const foundIndex = updated.findIndex((a) => a.generationId === tempId);
                  if (foundIndex !== -1) {
                    updated[foundIndex] = {
                      generationId: gen.generationId,
                      status: "completed",
                      imageUrl: gen.imageUrl,
                      judgeScore: null,
                      judgeSelectedAreasChanged: null,
                      judgeSelectedAreasCorrect: null,
                      judgeNothingElseChanged: null,
                      judgeReasoning: null,
                      usage: gen.usage || null,
                      judgeUsage: null,
                      imageGenerationDurationMs: genData.durationMs,
                    };
                  }
                }
              });
              return updated;
            });

            if (useJudges) {
              const judgeRunId = genData.runId || runId;
              generations.forEach((gen) => {
                setGenerationAttempts((prev) => {
                  const updated = [...prev];
                  const attemptIndex = updated.findIndex((a) => a.generationId === gen.generationId);
                  if (attemptIndex !== -1) {
                    updated[attemptIndex] = {
                      ...updated[attemptIndex],
                      status: "judging",
                    };
                  }
                  return updated;
                });

                fetch("/api/judge-generation", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ runId: judgeRunId, generationId: gen.generationId }),
                  signal: abortControllerRef.current?.signal,
                })
                  .then(async (judgeResponse) => {
                    if (judgeResponse.ok) {
                      const judgeData = await judgeResponse.json();
                      if (judgeData.success) {
                        setGenerationAttempts((prev) => {
                          const updated = [...prev];
                          const attemptIndex = updated.findIndex((a) => a.generationId === gen.generationId);
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

                          const totalImageUsage = updated.reduce(
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

                          const totalJudgeUsage = updated.reduce(
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
                          return updated;
                        });
                      }
                    }
                  })
                  .catch((error) => {
                    if (error.name !== "AbortError") {
                      console.error("Judge error:", error);
                      setGenerationAttempts((prev) => {
                        const updated = [...prev];
                        const attemptIndex = updated.findIndex((a) => a.generationId === gen.generationId);
                        if (attemptIndex !== -1) {
                          updated[attemptIndex] = {
                            ...updated[attemptIndex],
                            status: "completed",
                          };
                        }
                        return updated;
                      });
                    }
                  });
              });
            } else {
              setGenerationAttempts((prev) => {
                const updated = [...prev];
                generations.forEach((gen) => {
                  const attemptIndex = updated.findIndex((a) => a.generationId === gen.generationId);
                  if (attemptIndex !== -1) {
                    updated[attemptIndex] = {
                      ...updated[attemptIndex],
                      status: "completed",
                    };
                  }
                });
                return updated;
              });
            }

            return genData;
          });
      });

      await Promise.all(allPromises);

      setGenerationAttempts((prev) => {
        const allCompleted = prev.filter(
          (a) => a.status === "completed" || a.status === "judged" || a.status === "judging"
        );

        if (allCompleted.length > 0) {
          const judgedAttempts = allCompleted.filter((a) => a.status === "judged");
          const bestAttempt =
            judgedAttempts.length > 0
              ? [...judgedAttempts].sort((a, b) => (b.judgeScore || 0) - (a.judgeScore || 0))[0]
              : allCompleted.find((a) => a.status === "completed") || allCompleted[0];

          if (bestAttempt && bestAttempt.imageUrl) {
            setModifiedImages((prev) => {
              const newModified = [...prev];
              newModified[0] = bestAttempt.imageUrl;
              return newModified;
            });
            setSelectedGenerationId(bestAttempt.generationId);
          }

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

  const handlePromptSubmit = async (prompt: string) => {
    if (!prompt.trim()) {
      setError("Please enter a prompt");
      return;
    }

    if (selectedImages.length === 0) {
      setError("No images selected");
      return;
    }

    // Check if at least one image has selected cells
    const hasSelectedCells = selectedCells.some((cells) => cells.size > 0);
    if (!hasSelectedCells) {
      setError("Please select at least one cell to modify");
      return;
    }

    // Get images with borders drawn
    const imageDataUrls: string[] = [];
    for (let i = 0; i < selectedImages.length; i++) {
      const imageDataUrl = canvasRefs.current[i]?.getImageWithBorders(selectAllMode[i]);
      if (!imageDataUrl) {
        setError(`Failed to prepare image ${i + 1}`);
        return;
      }
      imageDataUrls.push(imageDataUrl);
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setProcessing(true);
    setError(null);
    setModifiedImages(selectedImages.map(() => null));
    setSelectedGenerationId(null);
    setCurrentPrompt(prompt);

    const runId = uuidv7();

    try {
      await generateAttempts(
        DEFAULT_IMAGES_PER_RUN,
        imageDataUrls,
        selectedCells.map((cells) => Array.from(cells)),
        prompt,
        selectedImages.map((img) => img.filename),
        gridRows,
        gridCols,
        judgeModelId,
        selectAllMode,
        runId,
        false,
        useJudges
      );

      setShowGrid(selectedImages.map(() => false));
      setError(null);
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

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setProcessing(false);
    setError(null);
  };

  const handleToggleGrid = (index: number) => {
    setShowGrid((prev) => {
      const newShowGrid = [...prev];
      newShowGrid[index] = !newShowGrid[index];
      return newShowGrid;
    });
  };

  if (selectedImages.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-gray-600">Loading images...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-start mb-6">
          <button
            onClick={() => navigate({ to: "/" })}
            className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Gallery
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
          {/* Left Column - Image Display */}
          <div className="space-y-4">
            {/* Canvas Controls */}
            {selectedImages.map((image, index) => (
              <div key={image.id} className="space-y-4">
                {showGrid[index] && (
                  <div className="flex items-center mb-2 flex-wrap gap-2">
                    <div className="flex items-center gap-2 px-2 py-1 bg-gray-50 rounded-lg border border-gray-200">
                      <span className="text-xs font-medium text-gray-600">Rows:</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleGridRowsChange(index, -1)}
                          className="p-1 rounded hover:bg-gray-200 transition-colors"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-sm font-semibold text-gray-900 min-w-[2ch] text-center">
                          {gridRows[index]}
                        </span>
                        <button
                          onClick={() => handleGridRowsChange(index, 1)}
                          className="p-1 rounded hover:bg-gray-200 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 px-2 py-1 bg-gray-50 rounded-lg border border-gray-200">
                      <span className="text-xs font-medium text-gray-600">Cols:</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleGridColsChange(index, -1)}
                          className="p-1 rounded hover:bg-gray-200 transition-colors"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-sm font-semibold text-gray-900 min-w-[2ch] text-center">
                          {gridCols[index]}
                        </span>
                        <button
                          onClick={() => handleGridColsChange(index, 1)}
                          className="p-1 rounded hover:bg-gray-200 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 px-2 py-1 bg-gray-50 rounded-lg border border-gray-200">
                      <input
                        type="checkbox"
                        id={`selectAllMode-${index}`}
                        checked={selectAllMode[index]}
                        onChange={(e) => handleSelectAllModeToggle(index, e.target.checked)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor={`selectAllMode-${index}`} className="text-xs font-medium text-gray-700 cursor-pointer">
                        Select All
                      </label>
                    </div>
                    <div className="flex items-center gap-2 px-2 py-1 bg-gray-50 rounded-lg border border-gray-200">
                      <input
                        type="checkbox"
                        id={`useJudges-${index}`}
                        checked={useJudges}
                        onChange={(e) => setUseJudges(e.target.checked)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor={`useJudges-${index}`} className="text-xs font-medium text-gray-700 cursor-pointer">
                        Use Judges
                      </label>
                    </div>
                    {showGrid[index] && (
                      <button
                        onClick={() => handleToggleGrid(index)}
                        className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-1.5"
                      >
                        <Grid3x3 className="w-4 h-4" />
                        <span className="hidden sm:inline">Hide Grid</span>
                      </button>
                    )}
                    {!showGrid[index] && (
                      <button
                        onClick={() => handleToggleGrid(index)}
                        className="px-3 py-1.5 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                      >
                        Show Grid
                      </button>
                    )}
                  </div>
                )}

                <div className="relative inline-block">
                  <ImageCanvas
                    ref={(ref) => {
                      canvasRefs.current[index] = ref;
                    }}
                    imageUrl={modifiedImages[index] || image.url}
                    selectedCells={selectedCells[index]}
                    onCellsSelected={(cells) => {
                      setSelectedCells((prev) => {
                        const newCells = [...prev];
                        newCells[index] = cells;
                        return newCells;
                      });
                    }}
                    showGrid={showGrid[index]}
                    gridRows={gridRows[index]}
                    gridCols={gridCols[index]}
                    selectAllMode={selectAllMode[index]}
                  />
                </div>
              </div>
            ))}

            {/* Shared Prompt Display */}
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

            {/* Thumbnails - Mobile View */}
            {selectedImages.length > 0 && (
              <div className="lg:hidden mt-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Variations</h3>
                <ThumbnailRow
                  variant="row"
                  generationAttempts={generationAttempts}
                  selectedGenerationId={selectedGenerationId}
                  onThumbnailClick={(attempt) => {
                    setSelectedGenerationId(attempt.generationId);
                    setModifiedImages((prev) => {
                      const newModified = [...prev];
                      newModified[0] = attempt.imageUrl;
                      return newModified;
                    });
                  }}
                  onMoreClick={() => {}}
                  canRetry={false}
                  processing={processing}
                  originalImage={selectedImages[0] ? { url: selectedImages[0].url, filename: selectedImages[0].filename } : null}
                  modifiedImage={modifiedImages[0]}
                  onOriginalImageClick={() => {
                    setSelectedGenerationId(null);
                    setModifiedImages((prev) => {
                      const newModified = [...prev];
                      newModified[0] = null;
                      return newModified;
                    });
                  }}
                  onPromptSubmit={handlePromptSubmit}
                  promptInitialValue={currentPrompt}
                  onPromptChange={setCurrentPrompt}
                  hasSelectedCells={selectedCells[0]?.size > 0}
                  promptError={error}
                />
              </div>
            )}

            <TokenUsageDisplay tokenUsage={tokenUsage} />
          </div>

          {/* Right Column - Thumbnails */}
          {selectedImages.length > 0 && (
            <div className="hidden lg:block sticky top-8 h-[calc(100vh-4rem)]">
              <div className="h-full flex flex-col">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Variations</h3>
                <div className="flex-1 overflow-hidden">
                  <ThumbnailRow
                    generationAttempts={generationAttempts}
                    selectedGenerationId={selectedGenerationId}
                    onThumbnailClick={(attempt) => {
                      setSelectedGenerationId(attempt.generationId);
                      setModifiedImages((prev) => {
                        const newModified = [...prev];
                        newModified[0] = attempt.imageUrl;
                        return newModified;
                      });
                    }}
                    onMoreClick={() => {}}
                    canRetry={false}
                    processing={processing}
                    originalImage={selectedImages[0] ? { url: selectedImages[0].url, filename: selectedImages[0].filename } : null}
                    modifiedImage={modifiedImages[0]}
                    onOriginalImageClick={() => {
                      setSelectedGenerationId(null);
                      setModifiedImages((prev) => {
                        const newModified = [...prev];
                        newModified[0] = null;
                        return newModified;
                      });
                    }}
                    onPromptSubmit={handlePromptSubmit}
                    promptInitialValue={currentPrompt}
                    onPromptChange={setCurrentPrompt}
                    hasSelectedCells={selectedCells[0]?.size > 0}
                    promptError={error}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

