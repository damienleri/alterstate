export const DEFAULT_GENERATION_MODEL_ID = "gemini-2.5-flash-image";
export const DEFAULT_JUDGE_MODEL_ID = "gemini-3-pro-preview";
// export const DEFAULT_JUDGE_MODEL_ID = "gemini-2.5-flash";
export const IMAGES_PER_LLM_CALL = 1;
export const DEFAULT_LLM_CALLS_PER_RUN = Number(import.meta.env.VITE_DEFAULT_LLM_CALLS_PER_RUN) || 1;
export const DEFAULT_IMAGES_PER_RUN = DEFAULT_LLM_CALLS_PER_RUN * IMAGES_PER_LLM_CALL;
export const USE_JUDGES = import.meta.env.VITE_USE_JUDGES ? Boolean(import.meta.env.VITE_USE_JUDGES) : false;
export const MIN_LLM_CALLS_PER_RUN = 1;
export const MAX_LLM_CALLS_PER_RUN = 10;
export const MAX_IMAGE_WIDTH = 1024;
export const MAX_IMAGE_HEIGHT = 1024;
export const JUDGE_THUMBNAIL_MAX_WIDTH = 320;
export const JUDGE_THUMBNAIL_MAX_HEIGHT = 320;

export type ModelProvider = "google" | "openai";
export type ModelKind = "generation" | "judge";

export type ModelPricing = {
  inputPerMillionTokens: number;
  cachedInputPerMillionTokens: number;
  outputPerMillionTokens: number;
};

export type ModelSummary<TKind extends ModelKind = ModelKind> = {
  id: string;
  name: string;
  provider: ModelProvider;
  kind: TKind;
  pricing: ModelPricing;
};

const MODEL_SUMMARY_LIST: readonly ModelSummary[] = [
  {
    id: "gemini-2.5-flash-image",
    name: "Gemini 2.5 Flash Image",
    provider: "google",
    kind: "generation",
    pricing: {
      inputPerMillionTokens: 0.3,
      cachedInputPerMillionTokens: 0,
      outputPerMillionTokens: 2.5,
    },
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "google",
    kind: "judge",
    pricing: {
      inputPerMillionTokens: 0.3,
      cachedInputPerMillionTokens: 0,
      outputPerMillionTokens: 2.5,
    },
  },
  {
    id: "gpt-5-mini",
    name: "GPT-5 Mini",
    provider: "openai",
    kind: "judge",
    pricing: {
      inputPerMillionTokens: 0.25,
      cachedInputPerMillionTokens: 0.025,
      outputPerMillionTokens: 2.0,
    },
  },
  {
    id: "gemini-3-pro-preview",
    name: "Gemini 3 Pro Preview",
    provider: "google",
    kind: "judge",
    pricing: {
      inputPerMillionTokens: 0.5,
      cachedInputPerMillionTokens: 0,
      outputPerMillionTokens: 1.5,
    },
  },
];

export const MODEL_SUMMARY = Object.fromEntries(
  MODEL_SUMMARY_LIST.map((summary) => [summary.id, summary] as const)
) as Record<string, ModelSummary>;

export type JudgeModelSummary = ModelSummary<"judge">;
export type GenerationModelSummary = ModelSummary<"generation">;

const MODEL_SUMMARIES_BY_KIND = MODEL_SUMMARY_LIST.reduce(
  (acc, summary) => {
    if (summary.kind === "judge") {
      acc.judge[summary.id] = summary as JudgeModelSummary;
    } else {
      acc.generation[summary.id] = summary as GenerationModelSummary;
    }
    return acc;
  },
  {
    judge: {} as Record<string, JudgeModelSummary>,
    generation: {} as Record<string, GenerationModelSummary>,
  }
);

export const JUDGE_MODEL_SUMMARY = MODEL_SUMMARIES_BY_KIND.judge;
export const GENERATION_MODEL_SUMMARY = MODEL_SUMMARIES_BY_KIND.generation;

export const JUDGE_MODEL_IDS = Object.keys(JUDGE_MODEL_SUMMARY);
export const GENERATION_MODEL_IDS = Object.keys(GENERATION_MODEL_SUMMARY);

export function calculateLLMCallsNeeded(imageCount: number): number {
  return Math.ceil(imageCount / IMAGES_PER_LLM_CALL);
}

export function calculateTotalImages(llmCallCount: number): number {
  return llmCallCount * IMAGES_PER_LLM_CALL;
}
