import { google } from "@ai-sdk/google";
import { openai, OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export interface JudgeModelCost {
  inputPerMillionTokens: number; // Cost per 1M input tokens
  cachedInputPerMillionTokens: number; // Cost per 1M cached input tokens
  outputPerMillionTokens: number; // Cost per 1M output tokens
}

export interface JudgeModelConfig {
  id: string;
  name: string;
  provider: "google" | "openai";
  modelId: string;
  getModel: () => LanguageModel;
  cost?: JudgeModelCost; // Optional cost data
  providerOptions?: {
    openai?: OpenAIResponsesProviderOptions;
  };
}

/**
 * Available judge models configuration.
 * This file is shared between frontend and backend.
 */
export const JUDGE_MODELS: Record<string, JudgeModelConfig> = {
  "gemini-2.5-flash": {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "google",
    modelId: "gemini-2.5-flash",
    getModel: () => {
      const model = google("gemini-2.5-flash");
      // Workaround: Ensure specificationVersion is v3 (Nitro bundling issue)
      if (model.specificationVersion !== "v3") {
        Object.defineProperty(model, "specificationVersion", {
          value: "v3",
          writable: false,
          enumerable: true,
          configurable: true,
        });
      }
      return model;
    },
  },
  "gpt-5-mini": {
    id: "gpt-5-mini",
    name: "GPT-5 Mini",
    provider: "openai",
    modelId: "gpt-5-mini",
    getModel: () => openai("gpt-5-mini"),
    cost: {
      inputPerMillionTokens: 0.25,
      cachedInputPerMillionTokens: 0.025,
      outputPerMillionTokens: 2.0,
    },
    providerOptions: {
      openai: {
        reasoningEffort: "minimal",
      } satisfies OpenAIResponsesProviderOptions,
    },
  },
};

/**
 * Default judge model ID
 */
export const DEFAULT_JUDGE_MODEL_ID = "gpt-5-mini";

/**
 * Get a judge model by ID
 */
export function getJudgeModel(modelId: string): LanguageModel {
  const config = JUDGE_MODELS[modelId];
  if (!config) {
    console.warn(`Unknown judge model ID: ${modelId}, falling back to default`);
    return JUDGE_MODELS[DEFAULT_JUDGE_MODEL_ID].getModel();
  }
  return config.getModel();
}

/**
 * Get all available judge model IDs
 */
export function getAvailableJudgeModelIds(): string[] {
  return Object.keys(JUDGE_MODELS);
}

/**
 * Get judge model config by ID
 */
export function getJudgeModelConfig(modelId: string): JudgeModelConfig | undefined {
  return JUDGE_MODELS[modelId];
}

/**
 * Calculate cost for token usage based on model pricing
 */
export function calculateJudgeCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens: number = 0
): number {
  const config = JUDGE_MODELS[modelId];
  if (!config?.cost) {
    return 0; // No cost data available
  }

  const { inputPerMillionTokens, cachedInputPerMillionTokens, outputPerMillionTokens } = config.cost;

  // Calculate costs
  const inputCost = (inputTokens / 1_000_000) * inputPerMillionTokens;
  const cachedInputCost = (cachedInputTokens / 1_000_000) * cachedInputPerMillionTokens;
  const outputCost = (outputTokens / 1_000_000) * outputPerMillionTokens;

  return inputCost + cachedInputCost + outputCost;
}
