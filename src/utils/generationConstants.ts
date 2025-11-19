export const DEFAULT_GENERATION_MODEL_ID = "gemini-2.5-flash-image";
// export const DEFAULT_GENERATION_MODEL_ID = "gemini-3-pro-preview"; // Gemini 3 does not support native image generation yet
// Model list: https://aistudio.google.com/usage?timeRange=last-28-days&project=gen-lang-client-0606405840&tab=rate-limit
export const IMAGES_PER_LLM_CALL = 1;

/**
 * Default number of LLM calls per run.
 * Each run makes this many parallel LLM calls.
 * Can be overridden via VITE_DEFAULT_LLM_CALLS_PER_RUN environment variable.
 * Works in both server and client contexts.
 */
export const DEFAULT_LLM_CALLS_PER_RUN = (() => {
  // Use VITE_ prefix for both server and client (works in both contexts)
  let envValue: string | undefined;

  // Try import.meta.env first (works in both server and client with Vite)
  if (typeof import.meta !== "undefined" && import.meta.env) {
    envValue = import.meta.env.VITE_DEFAULT_LLM_CALLS_PER_RUN;
  }

  // Fallback to process.env for server-side (Nitro also exposes VITE_ vars via process.env)
  if (!envValue && typeof process !== "undefined" && process.env) {
    envValue = process.env.VITE_DEFAULT_LLM_CALLS_PER_RUN;
  }

  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      console.log(
        `[generationConstants] Using DEFAULT_LLM_CALLS_PER_RUN=${parsed} from VITE_DEFAULT_LLM_CALLS_PER_RUN`
      );
      return parsed;
    }
  }
  console.log(
    `[generationConstants] Using default DEFAULT_LLM_CALLS_PER_RUN=1 (VITE_DEFAULT_LLM_CALLS_PER_RUN not set or invalid)`
  );
  return 1; // default
})();

/**
 * Default total number of images generated per run.
 * Calculated as: DEFAULT_LLM_CALLS_PER_RUN * IMAGES_PER_LLM_CALL
 */
export const DEFAULT_IMAGES_PER_RUN = (() => {
  const value = DEFAULT_LLM_CALLS_PER_RUN * IMAGES_PER_LLM_CALL;
  console.log(
    `[generationConstants] DEFAULT_IMAGES_PER_RUN = ${DEFAULT_LLM_CALLS_PER_RUN} * ${IMAGES_PER_LLM_CALL} = ${value}`
  );
  return value;
})();

/**
 * Minimum number of LLM calls allowed per run.
 */
export const MIN_LLM_CALLS_PER_RUN = 1;

/**
 * Maximum number of LLM calls allowed per run.
 */
export const MAX_LLM_CALLS_PER_RUN = 10;

/**
 * Calculate the number of LLM calls needed to generate a given number of images.
 * @param imageCount - Desired number of images
 * @returns Number of LLM calls needed
 */
export function calculateLLMCallsNeeded(imageCount: number): number {
  return Math.ceil(imageCount / IMAGES_PER_LLM_CALL);
}

/**
 * Calculate the total number of images that will be generated for a given number of LLM calls.
 * @param llmCallCount - Number of LLM calls
 * @returns Total number of images (may be more than requested if not evenly divisible)
 */
export function calculateTotalImages(llmCallCount: number): number {
  return llmCallCount * IMAGES_PER_LLM_CALL;
}
