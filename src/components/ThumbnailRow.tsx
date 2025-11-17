import { Plus, Loader2, X, MousePointerClick } from "lucide-react";
import { useState, useEffect } from "react";
import type { Image } from "../utils/storage";

interface GenerationAttempt {
  generationId: string;
  status: "pending" | "generating" | "completed" | "judging" | "judged";
  image: Image | null;
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

interface ThumbnailRowProps {
  generationAttempts: GenerationAttempt[];
  selectedGenerationId: string | null;
  onThumbnailClick: (attempt: GenerationAttempt) => void;
  onMoreClick?: () => void;
  canRetry?: boolean;
  processing?: boolean;
  originalImage?: Image | null;
  onOriginalImageClick?: () => void;
  modifiedImage?: string | null;
  // Prompt input props (for when no generations yet)
  onPromptSubmit?: (prompt: string) => void;
  promptInitialValue?: string;
  onPromptChange?: (value: string) => void;
  hasSelectedCells?: boolean;
  promptError?: string | null;
  variant?: "column" | "row"; // New prop to control layout
}

export function ThumbnailRow({
  generationAttempts,
  selectedGenerationId,
  onThumbnailClick,
  onMoreClick,
  canRetry = false,
  processing = false,
  originalImage,
  onOriginalImageClick,
  modifiedImage,
  onPromptSubmit,
  promptInitialValue = "",
  onPromptChange,
  hasSelectedCells = false,
  promptError,
  variant = "column",
}: ThumbnailRowProps) {
  const [prompt, setPrompt] = useState(promptInitialValue);
  const hasGenerations = generationAttempts.length > 0;
  const showPromptInput = !hasGenerations && onPromptSubmit;

  useEffect(() => {
    setPrompt(promptInitialValue);
  }, [promptInitialValue]);

  const handlePromptChange = (value: string) => {
    setPrompt(value);
    onPromptChange?.(value);
  };

  const handlePromptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim() && onPromptSubmit) {
      onPromptSubmit(prompt);
    }
  };

  if (generationAttempts.length === 0 && !canRetry && !originalImage && !showPromptInput) {
    return null;
  }

  const isOriginalSelected = selectedGenerationId === null && !modifiedImage && originalImage !== null;

  const isColumn = variant === "column";

  return (
    <div className={`w-full ${isColumn ? "h-full flex flex-col" : ""}`}>
      <div
        className={`flex ${isColumn ? "flex-col" : "flex-row"} gap-3 ${isColumn ? "overflow-y-auto" : "overflow-x-auto"} py-1 ${isColumn ? "px-1" : ""} items-start w-full ${isColumn ? "flex-1 min-h-0" : ""}`}
      >
        {originalImage && (
          <div
            className={`${isColumn ? "w-full" : "shrink-0 w-24"} flex gap-2 items-start ${
              isOriginalSelected
                ? `ring-2 ring-blue-500 ring-offset-2 rounded-lg p-1.5 ${isColumn ? "" : "mx-1"}`
                : "rounded-lg border border-gray-200 p-1 hover:border-gray-300"
            }`}
          >
            <div
              className={`${isColumn ? "w-24 shrink-0" : "w-full"} cursor-pointer transition-all`}
              onClick={() => {
                if (onOriginalImageClick) {
                  onOriginalImageClick();
                }
              }}
            >
              <div className="relative w-full aspect-square bg-gray-100 rounded overflow-hidden">
                <img src={originalImage.url} alt="Original image" className="w-full h-full object-cover" />
              </div>
            </div>
            {isColumn && (
              <div className="flex-1 min-w-0 py-1">
                <div className="text-xs font-medium text-gray-900">Original</div>
                <div className="text-xs text-gray-500 mt-1">Base image</div>
              </div>
            )}
          </div>
        )}
        {generationAttempts.map((attempt, index) => {
          const hasScores =
            attempt.judgeSelectedAreasChanged !== null &&
            attempt.judgeSelectedAreasCorrect !== null &&
            attempt.judgeNothingElseChanged !== null;

          return (
            <div
              key={attempt.generationId}
              className={`${isColumn ? "w-full" : "shrink-0 w-24"} flex gap-2 items-start ${
                selectedGenerationId === attempt.generationId
                  ? `ring-2 ring-blue-500 ring-offset-2 rounded-lg p-1.5 ${isColumn ? "" : "mx-1"}`
                  : "rounded-lg border border-gray-200 p-1 hover:border-gray-300"
              }`}
            >
              <div
                className={`${isColumn ? "w-24 shrink-0" : "w-full"} cursor-pointer transition-all`}
                onClick={() => {
                  if (attempt.image) {
                    onThumbnailClick(attempt);
                  }
                }}
              >
                <div className="relative w-full aspect-square bg-gray-100 rounded overflow-hidden border border-gray-200">
                  {attempt.status === "pending" || attempt.status === "generating" ? (
                    <div className="w-full h-full flex items-center justify-center bg-gray-50">
                      <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                    </div>
                  ) : attempt.status === "judging" ? (
                    <>
                      {attempt.image ? (
                        <img
                          src={attempt.image.url}
                          alt={`Generation ${index + 1}`}
                          className="w-full h-full object-cover opacity-75"
                        />
                      ) : null}
                      <div className="absolute inset-0 flex items-center justify-center bg-gray-900/20">
                        <Loader2 className="w-6 h-6 text-white animate-spin" />
                      </div>
                    </>
                  ) : attempt.image ? (
                    <img
                      src={attempt.image.url}
                      alt={`Generation ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-50">
                      <div className="text-xs text-gray-500">Error</div>
                    </div>
                  )}
                </div>
              </div>
              {isColumn && (
                <div className="flex-1 min-w-0 py-1">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs font-medium text-gray-900">#{index + 1}</div>
                    {attempt.status === "judging" && <div className="text-xs text-blue-600">Judging...</div>}
                    {attempt.status === "judged" && attempt.judgeScore !== null && (
                      <div className="text-xs font-semibold text-gray-700">Score: {attempt.judgeScore}/10</div>
                    )}
                  </div>
                  {hasScores && (
                    <div className="flex gap-2 mb-1">
                      <div className="text-xs">
                        <span className="text-gray-500">C:</span>{" "}
                        <span className="font-medium text-gray-900">{attempt.judgeSelectedAreasChanged}/10</span>
                      </div>
                      <div className="text-xs">
                        <span className="text-gray-500">A:</span>{" "}
                        <span className="font-medium text-gray-900">{attempt.judgeSelectedAreasCorrect}/10</span>
                      </div>
                      <div className="text-xs">
                        <span className="text-gray-500">P:</span>{" "}
                        <span className="font-medium text-gray-900">{attempt.judgeNothingElseChanged}/10</span>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2 text-xs text-gray-500">
                    {attempt.imageGenerationDurationMs && (
                      <span>Gen: {Math.round(attempt.imageGenerationDurationMs / 1000)}s</span>
                    )}
                    {attempt.judgeDurationMs && <span>Judge: {Math.round(attempt.judgeDurationMs / 1000)}s</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {hasGenerations && canRetry && onMoreClick && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMoreClick();
            }}
            disabled={processing}
            className={`${isColumn ? "w-full" : "shrink-0 w-24"} flex gap-2 items-start rounded-lg border-2 border-dashed border-gray-300 hover:border-gray-400 transition-colors bg-gray-50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed p-1`}
            title="Generate more variations"
          >
            <div className={`${isColumn ? "w-24 shrink-0" : "w-full"} flex items-center justify-center aspect-square`}>
              <Plus className={`${isColumn ? "w-5 h-5" : "w-6 h-6"} text-gray-400`} />
            </div>
            {isColumn && (
              <div className="flex-1 min-w-0 py-1 flex items-center">
                <div className="text-xs text-gray-500">Generate more</div>
              </div>
            )}
          </button>
        )}
        {showPromptInput && (
          <>
            {!hasSelectedCells ? (
              <div className="w-full flex flex-col items-center justify-center py-8 px-4 text-center">
                <MousePointerClick className="w-12 h-12 text-gray-400 mb-4" />
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Select part of the image</h3>
                <p className="text-sm text-gray-600 max-w-sm">
                  Click and drag on the image above to select the area you want to modify.
                </p>
              </div>
            ) : (
              <form onSubmit={handlePromptSubmit} className="w-full flex flex-col gap-2">
                <div className="relative w-full">
                  <textarea
                    value={prompt}
                    onChange={(e) => handlePromptChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (prompt.trim() && !processing && hasSelectedCells && onPromptSubmit) {
                          onPromptSubmit(prompt);
                        }
                      }
                    }}
                    disabled={processing}
                    placeholder="Enter prompt... (Press Enter to submit, Shift+Enter for new line)"
                    rows={3}
                    className="w-full px-4 py-3 pr-10 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                  {prompt && (
                    <button
                      type="button"
                      onClick={() => handlePromptChange("")}
                      className="absolute top-2 right-2 p-1 rounded hover:bg-gray-200 transition-colors text-gray-500 hover:text-gray-700 z-10"
                      title="Clear prompt"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={processing || !prompt.trim()}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
                >
                  {processing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    "Generate"
                  )}
                </button>
                {promptError && <div className="text-xs text-red-600 mt-1">{promptError}</div>}
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
