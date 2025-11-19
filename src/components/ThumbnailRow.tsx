import { Plus, Loader2, X, MousePointerClick, ChevronDown } from "lucide-react";
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
  const [expandedAttemptId, setExpandedAttemptId] = useState<string | null>(null);
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
            className={`${isColumn ? "w-full" : "shrink-0 w-24"} flex gap-2 items-start cursor-pointer transition-all ${
              isOriginalSelected
                ? `ring-2 ring-blue-500 dark:ring-blue-400 ring-offset-2 dark:ring-offset-gray-900 rounded-lg p-1.5 ${isColumn ? "" : "mx-1"}`
                : "rounded-lg border border-gray-200 dark:border-gray-700 p-1 hover:border-gray-300 dark:hover:border-gray-600"
            }`}
            onClick={() => {
              if (onOriginalImageClick) {
                onOriginalImageClick();
              }
            }}
          >
            <div className={`${isColumn ? "w-24 shrink-0" : "w-full"}`}>
              <div className="relative w-full aspect-square bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
                <img src={originalImage.url} alt="Original image" className="w-full h-full object-cover" />
              </div>
            </div>
            {isColumn && (
              <div className="flex-1 min-w-0 py-1">
                <div className="text-xs font-medium text-gray-900 dark:text-gray-100">Original</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Base image</div>
              </div>
            )}
          </div>
        )}
        {generationAttempts.map((attempt, index) => {
          const hasScores =
            attempt.judgeSelectedAreasChanged !== null &&
            attempt.judgeSelectedAreasCorrect !== null &&
            attempt.judgeNothingElseChanged !== null;
          const isExpanded = expandedAttemptId === attempt.generationId;
          const reasoningIsLong = (attempt.judgeReasoning?.length || 0) > 200;

          return (
            <div
              key={attempt.generationId}
              className={`${isColumn ? "w-full flex-row" : "shrink-0 w-32 flex-col"} flex gap-2 items-start cursor-pointer transition-all ${
                selectedGenerationId === attempt.generationId
                  ? `ring-2 ring-blue-500 dark:ring-blue-400 ring-offset-2 dark:ring-offset-gray-900 rounded-lg p-1.5 ${isColumn ? "" : "mx-1"}`
                  : "rounded-lg border border-gray-200 dark:border-gray-700 p-1 hover:border-gray-300 dark:hover:border-gray-600"
              }`}
              onClick={() => {
                if (attempt.image) {
                  onThumbnailClick(attempt);
                }
              }}
            >
              <div className={`${isColumn ? "w-24 shrink-0" : "w-full"}`}>
                <div className="relative w-full aspect-square bg-gray-100 dark:bg-gray-800 rounded overflow-hidden border border-gray-200 dark:border-gray-700">
                  {attempt.status === "pending" || attempt.status === "generating" ? (
                    <div className="w-full h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                      <Loader2 className="w-6 h-6 text-gray-400 dark:text-gray-500 animate-spin" />
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
                    </>
                  ) : attempt.image ? (
                    <img
                      src={attempt.image.url}
                      alt={`Generation ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                      <div className="text-xs text-gray-500 dark:text-gray-400">Error</div>
                    </div>
                  )}
                </div>
              </div>
              {isColumn ? (
                <div className="flex-1 min-w-0 py-1">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-gray-900 dark:text-gray-100">Variation #{index + 1}</div>
                    <div
                      className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        attempt.status === "judging"
                          ? "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300"
                          : attempt.status === "judged"
                            ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300"
                            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                      }`}
                    >
                      {attempt.status === "judging"
                        ? "Judging…"
                        : attempt.status === "judged"
                          ? `Score ${attempt.judgeScore ?? "-"} / 10`
                          : attempt.status === "completed"
                            ? "Generated"
                            : "Pending"}
                    </div>
                  </div>
                  {hasScores && (
                    <div className="grid grid-cols-1 gap-2 mb-2 text-xs">
                      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-2">
                        <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Changed Areas
                        </div>
                        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {attempt.judgeSelectedAreasChanged}/10
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                          How well the selected regions were modified.
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-2">
                        <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Accuracy
                        </div>
                        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {attempt.judgeSelectedAreasCorrect}/10
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                          Alignment with the requested changes.
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-2">
                        <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Preservation
                        </div>
                        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {attempt.judgeNothingElseChanged}/10
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                          How much of the image stayed untouched.
                        </p>
                      </div>
                    </div>
                  )}
                  {attempt.judgeReasoning && (
                    <div className="mb-2">
                      <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                        Judge Notes
                      </div>
                      <div
                        className={`text-xs text-gray-700 dark:text-gray-300 leading-relaxed ${
                          !isExpanded && reasoningIsLong ? "max-h-20 overflow-hidden" : ""
                        }`}
                      >
                        {attempt.judgeReasoning}
                      </div>
                      {reasoningIsLong && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedAttemptId(isExpanded ? null : attempt.generationId);
                          }}
                          className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                        >
                          {isExpanded ? "Collapse notes" : "Expand notes"}
                          <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </button>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2 text-xs text-gray-500 dark:text-gray-400">
                    {attempt.imageGenerationDurationMs && (
                      <span>Gen: {Math.round(attempt.imageGenerationDurationMs / 1000)}s</span>
                    )}
                    {attempt.judgeDurationMs && <span>Judge: {Math.round(attempt.judgeDurationMs / 1000)}s</span>}
                  </div>
                </div>
              ) : (
                <div className="w-full flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] font-medium text-gray-900 dark:text-gray-100">#{index + 1}</div>
                    {attempt.status === "judging" ? (
                      <div className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">Judging…</div>
                    ) : attempt.status === "judged" && attempt.judgeScore !== null ? (
                      <div className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">
                        {attempt.judgeScore}/10
                      </div>
                    ) : null}
                  </div>
                  {hasScores && (
                    <div className="text-[11px] text-gray-600 dark:text-gray-300 leading-tight space-y-1">
                      <div>Changed Areas: {attempt.judgeSelectedAreasChanged}/10</div>
                      <div>Accuracy: {attempt.judgeSelectedAreasCorrect}/10</div>
                      <div>Preservation: {attempt.judgeNothingElseChanged}/10</div>
                    </div>
                  )}
                  {attempt.judgeReasoning && (
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 max-h-12 overflow-hidden">
                      {attempt.judgeReasoning}
                    </div>
                  )}
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
            className={`${isColumn ? "w-full" : "shrink-0 w-24"} flex gap-2 items-start rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 transition-colors bg-gray-50 dark:bg-gray-800 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed p-1`}
            title="Generate more variations"
          >
            <div className={`${isColumn ? "w-24 shrink-0" : "w-full"} flex items-center justify-center aspect-square`}>
              <Plus className={`${isColumn ? "w-5 h-5" : "w-6 h-6"} text-gray-400 dark:text-gray-500`} />
            </div>
            {isColumn && (
              <div className="flex-1 min-w-0 py-1 flex items-center">
                <div className="text-xs text-gray-500 dark:text-gray-400">Generate more</div>
              </div>
            )}
          </button>
        )}
        {showPromptInput && (
          <>
            {!hasSelectedCells ? (
              <div className="w-full flex flex-col items-center justify-center py-8 px-4 text-center">
                <MousePointerClick className="w-12 h-12 text-gray-400 dark:text-gray-500 mb-4" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Select part of the image
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 max-w-sm">
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
                    className="w-full px-4 py-3 pr-10 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent resize-none disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400"
                  />
                  {prompt && (
                    <button
                      type="button"
                      onClick={() => handlePromptChange("")}
                      className="absolute top-2 right-2 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 z-10"
                      title="Clear prompt"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={processing || !prompt.trim()}
                  className="px-4 py-2 text-sm bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
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
                {promptError && <div className="text-xs text-red-600 dark:text-red-400 mt-1">{promptError}</div>}
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
