import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export interface JudgeModelConfig {
  id: string;
  name: string;
  provider: "google" | "openai";
  modelId: string;
  getModel: () => LanguageModel;
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
  },
};

/**
 * Default judge model ID
 */
export const DEFAULT_JUDGE_MODEL_ID = "gemini-2.5-flash";

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
