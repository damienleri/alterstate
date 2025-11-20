import { google } from "@ai-sdk/google";
import { openai, OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import {
  DEFAULT_JUDGE_MODEL_ID as BASE_DEFAULT_JUDGE_MODEL_ID,
  JUDGE_MODEL_SUMMARY,
  type JudgeModelSummary,
} from "~/utils/constants";

export const DEFAULT_JUDGE_MODEL_ID = BASE_DEFAULT_JUDGE_MODEL_ID;

export interface JudgeModelConfig extends JudgeModelSummary {
  getModel: () => LanguageModel;
  providerOptions?: {
    openai?: OpenAIResponsesProviderOptions;
  };
}

type JudgeModelFactory = {
  getModel: () => LanguageModel;
  providerOptions?: {
    openai?: OpenAIResponsesProviderOptions;
  };
};

const JUDGE_MODEL_FACTORIES: Record<string, JudgeModelFactory> = {
  "gemini-2.5-flash": {
    getModel: () => {
      const model = google("gemini-2.5-flash");
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
    getModel: () => openai("gpt-5-mini"),
    providerOptions: {
      openai: {
        reasoningEffort: "minimal",
      } satisfies OpenAIResponsesProviderOptions,
    },
  },
  "gemini-3-pro-preview": {
    getModel: () => google("gemini-3-pro-preview"),
  },
};

// Validate that all judge models in constants have factories
const missingFactories = Object.keys(JUDGE_MODEL_SUMMARY).filter((modelId) => !(modelId in JUDGE_MODEL_FACTORIES));
if (missingFactories.length > 0) {
  throw new Error(
    `Missing factory definitions for judge models: ${missingFactories.join(", ")}. ` +
      `Please add factory entries in src/lib/ai/judge/models.ts for all models defined in src/utils/constants.ts`
  );
}

export function getJudgeModel(modelId: string): LanguageModel {
  const factory = JUDGE_MODEL_FACTORIES[modelId];
  if (!factory) {
    const availableModels = Object.keys(JUDGE_MODEL_SUMMARY).join(", ");
    throw new Error(
      `Judge model "${modelId}" is not available. No factory found for this model ID. ` +
        `Available models: ${availableModels}. ` +
        `Please add a factory entry in src/lib/ai/judge/models.ts or use one of the available models.`
    );
  }
  return factory.getModel();
}

export function getAvailableJudgeModelIds(): string[] {
  // Return all judge models from constants (validation ensures they all have factories)
  return Object.keys(JUDGE_MODEL_SUMMARY);
}

export function getJudgeModelConfig(modelId: string): JudgeModelConfig | undefined {
  const summary = JUDGE_MODEL_SUMMARY[modelId];
  const factory = JUDGE_MODEL_FACTORIES[modelId];
  if (!summary || !factory) {
    return undefined;
  }
  return {
    ...summary,
    getModel: factory.getModel,
    providerOptions: factory.providerOptions,
  };
}

export function calculateJudgeCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens: number = 0
): number {
  const summary = JUDGE_MODEL_SUMMARY[modelId];
  if (!summary) {
    return 0;
  }

  const { inputPerMillionTokens, cachedInputPerMillionTokens, outputPerMillionTokens } = summary.pricing;

  const inputCost = (inputTokens / 1_000_000) * inputPerMillionTokens;
  const cachedInputCost = (cachedInputTokens / 1_000_000) * cachedInputPerMillionTokens;
  const outputCost = (outputTokens / 1_000_000) * outputPerMillionTokens;

  return inputCost + cachedInputCost + outputCost;
}
