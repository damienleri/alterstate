import { Plus, Loader2, X } from "lucide-react";
import { useState, useEffect } from "react";

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

interface ThumbnailRowProps {
  generationAttempts: GenerationAttempt[];
  selectedGenerationId: string | null;
  onThumbnailClick: (attempt: GenerationAttempt) => void;
  onMoreClick?: () => void;
  canRetry?: boolean;
  processing?: boolean;
  originalImage?: { url: string; filename: string } | null;
  onOriginalImageClick?: () => void;
  modifiedImage?: string | null;
  // Prompt input props (for when no generations yet)
  onPromptSubmit?: (prompt: string) => void;
  promptInitialValue?: string;
  onPromptChange?: (value: string) => void;
  hasSelectedCells?: boolean;
  promptError?: string | null;
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

  return (
    <div className="w-full">
      <div className="flex gap-4 overflow-x-auto py-1 pl-2 pr-4 items-start w-full">
        {originalImage && (
          <div
            className={`shrink-0 w-32 cursor-pointer transition-all ${
              isOriginalSelected
                ? "ring-2 ring-blue-500 ring-offset-1 rounded-lg p-1"
                : "rounded-lg border border-gray-200 p-1 hover:border-gray-300"
            }`}
            onClick={() => {
              if (onOriginalImageClick) {
                onOriginalImageClick();
              }
            }}
          >
            <div className="relative w-full aspect-square bg-gray-100 rounded overflow-hidden">
              <img src={originalImage.url} alt="Original image" className="w-full h-full object-cover" />
              <div className="absolute top-1 left-1 bg-gray-700 text-white text-xs font-bold px-2 py-1 rounded">
                Original
              </div>
            </div>
            <div className="mt-1 text-xs text-gray-600 text-center line-clamp-2">Original</div>
          </div>
        )}
        {generationAttempts.map((attempt, index) => (
          <div
            key={attempt.generationId}
            className={`shrink-0 w-32 cursor-pointer transition-all ${
              selectedGenerationId === attempt.generationId
                ? "ring-2 ring-blue-500 ring-offset-1 rounded-lg p-1"
                : "rounded-lg border border-gray-200 p-1 hover:border-gray-300"
            }`}
            onClick={() => {
              if (attempt.imageUrl) {
                onThumbnailClick(attempt);
              }
            }}
          >
            <div className="relative w-full aspect-square bg-gray-100 rounded overflow-hidden">
              {attempt.status === "pending" || attempt.status === "generating" ? (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-xs text-gray-500">
                    {attempt.status === "pending" ? "Pending..." : "Generating..."}
                  </div>
                </div>
              ) : attempt.imageUrl ? (
                <img src={attempt.imageUrl} alt={`Generation ${index + 1}`} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-xs text-gray-500">Error</div>
                </div>
              )}
            </div>
            {attempt.status === "judging" && (
              <div className="mt-1">
                <div className="relative h-1 w-full overflow-hidden rounded-full bg-gray-200">
                  <div className="absolute h-full w-[40%] bg-blue-600 animate-loading-slide" />
                </div>
              </div>
            )}
          </div>
        ))}
        {hasGenerations && canRetry && onMoreClick && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMoreClick();
            }}
            disabled={processing}
            className="shrink-0 w-32 rounded-lg border-2 border-dashed border-gray-300 hover:border-gray-400 transition-colors flex items-center justify-center aspect-square bg-gray-50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            title="Generate more variations"
          >
            <Plus className="w-8 h-8 text-gray-400" />
          </button>
        )}
        {showPromptInput && (
          <form onSubmit={handlePromptSubmit} className="shrink-0 flex flex-col gap-2" style={{ width: "400px" }}>
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
                disabled={processing || !hasSelectedCells}
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
              disabled={processing || !prompt.trim() || !hasSelectedCells}
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
      </div>
    </div>
  );
}
