// Cost per million tokens
const COST_PER_MILLION_INPUT_TOKENS = 0.3; // $0.30 per million input tokens
const COST_PER_MILLION_OUTPUT_TOKENS = 2.5; // $2.50 per million output tokens

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface Cost {
  inputCost: number;
  outputCost: number;
  totalCost: number;
}

/**
 * Calculate cost from token usage
 */
export function calculateCost(usage: TokenUsage | null): Cost | null {
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

/**
 * Format duration in milliseconds to a readable string (e.g., "1.2s")
 */
export function formatDuration(durationMs: number | undefined): string | null {
  if (durationMs === undefined || durationMs === null) {
    return null;
  }
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
}

