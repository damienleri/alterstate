import { DEFAULT_GENERATION_MODEL_ID, MODEL_SUMMARY, type ModelPricing } from "./constants";

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

export function getModelPricing(modelId?: string): ModelPricing {
  return (
    (modelId ? MODEL_SUMMARY[modelId]?.pricing : MODEL_SUMMARY[DEFAULT_GENERATION_MODEL_ID]?.pricing) ?? {
      inputPerMillionTokens: 0,
      cachedInputPerMillionTokens: 0,
      outputPerMillionTokens: 0,
    }
  );
}

/**
 * Calculate cost from token usage
 */
export function calculateCost(usage: TokenUsage | null, modelId?: string): Cost | null {
  if (!usage) {
    return null;
  }

  const pricing = getModelPricing(modelId);

  return {
    inputCost: (usage.inputTokens / 1_000_000) * pricing.inputPerMillionTokens,
    outputCost: (usage.outputTokens / 1_000_000) * pricing.outputPerMillionTokens,
    totalCost:
      (usage.inputTokens / 1_000_000) * pricing.inputPerMillionTokens +
      (usage.outputTokens / 1_000_000) * pricing.outputPerMillionTokens,
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
