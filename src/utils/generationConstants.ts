/**
 * Constants for image generation runs.
 * These are shared between frontend and backend to ensure consistency.
 */

export const IMAGES_PER_LLM_CALL = 2;

/**
 * Default number of LLM calls per run.
 * Each run makes this many parallel LLM calls.
 */
export const DEFAULT_LLM_CALLS_PER_RUN = 2;

/**
 * Default total number of images generated per run.
 * Calculated as: DEFAULT_LLM_CALLS_PER_RUN * IMAGES_PER_LLM_CALL
 */
export const DEFAULT_IMAGES_PER_RUN = DEFAULT_LLM_CALLS_PER_RUN * IMAGES_PER_LLM_CALL;

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
