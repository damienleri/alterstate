import { calculateCost, formatDuration } from "../utils/cost";

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

interface TokenUsageDisplayProps {
  tokenUsage: TokenUsage | null;
  imageGenerationUsage: TokenUsage | null;
  judgeUsage: TokenUsage | null;
  imageGenerationDurationMs?: number | null;
  judgeDurationMs?: number | null;
  totalDurationMs?: number | null;
}

export function TokenUsageDisplay({
  tokenUsage,
  imageGenerationUsage,
  judgeUsage,
  imageGenerationDurationMs,
  judgeDurationMs,
  totalDurationMs,
}: TokenUsageDisplayProps) {
  if (!tokenUsage) {
    return null;
  }

  const cost = calculateCost(tokenUsage);
  const renderDuration = (durationMs?: number | null) => formatDuration(durationMs ?? undefined) ?? "—";

  return (
    <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-3">Token Usage</p>

      {/* Total Usage */}
      <div className="mb-3">
        <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-2">Total</p>
        <div className="grid grid-cols-4 gap-2 text-xs text-gray-600 dark:text-gray-400">
          <div>
            <span className="font-medium">Input:</span> {tokenUsage.inputTokens.toLocaleString()}
          </div>
          <div>
            <span className="font-medium">Output:</span> {tokenUsage.outputTokens.toLocaleString()}
          </div>
          <div>
            <span className="font-medium">Total:</span> {tokenUsage.totalTokens.toLocaleString()}
          </div>
          <div>
            <span className="font-medium">Duration:</span> {renderDuration(totalDurationMs)}
          </div>
        </div>
      </div>

      {/* Image Generation Usage */}
      {imageGenerationUsage && (
        <div className="mb-3 pt-3 border-t border-gray-300 dark:border-gray-700">
          <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-2">Image Generation</p>
          <div className="grid grid-cols-4 gap-2 text-xs text-gray-600 dark:text-gray-400">
            <div>
              <span className="font-medium">Input:</span> {imageGenerationUsage.inputTokens.toLocaleString()}
            </div>
            <div>
              <span className="font-medium">Output:</span> {imageGenerationUsage.outputTokens.toLocaleString()}
            </div>
            <div>
              <span className="font-medium">Total:</span> {imageGenerationUsage.totalTokens.toLocaleString()}
            </div>
            <div>
              <span className="font-medium">Duration:</span> {renderDuration(imageGenerationDurationMs)}
            </div>
          </div>
        </div>
      )}

      {/* Judge Usage */}
      {judgeUsage && (
        <div className="mb-3 pt-3 border-t border-gray-300 dark:border-gray-700">
          <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-2">Judge</p>
          <div className="grid grid-cols-4 gap-2 text-xs text-gray-600 dark:text-gray-400">
            <div>
              <span className="font-medium">Input:</span> {judgeUsage.inputTokens.toLocaleString()}
            </div>
            <div>
              <span className="font-medium">Output:</span> {judgeUsage.outputTokens.toLocaleString()}
            </div>
            <div>
              <span className="font-medium">Total:</span> {judgeUsage.totalTokens.toLocaleString()}
            </div>
            <div>
              <span className="font-medium">Duration:</span> {renderDuration(judgeDurationMs)}
            </div>
          </div>
        </div>
      )}

      {/* Cost */}
      {cost && (
        <div className="pt-3 border-t border-gray-300 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Cost</p>
          <div className="grid grid-cols-3 gap-2 text-xs text-gray-600 dark:text-gray-400">
            <div>
              <span className="font-medium">Input:</span> ${cost.inputCost.toFixed(6)}
            </div>
            <div>
              <span className="font-medium">Output:</span> ${cost.outputCost.toFixed(6)}
            </div>
            <div>
              <span className="font-medium">Total:</span>{" "}
              <span className="font-semibold text-gray-900 dark:text-gray-100">${cost.totalCost.toFixed(6)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

