import { generateObject } from "ai";
import { z } from "zod";
import { getJudgeModel, DEFAULT_JUDGE_MODEL_ID, calculateJudgeCost, getJudgeModelConfig } from "./models";

const judgeResponseSchema = z.object({
  selectedAreasChanged: z
    .number()
    .int()
    .min(1)
    .max(10)
    .describe("Score 1-10: Were the selected (blue border) areas changed?"),
  selectedAreasCorrect: z
    .number()
    .int()
    .min(1)
    .max(10)
    .describe("Score 1-10: Were the selected areas changed correctly according to the prompt?"),
  nothingElseChanged: z
    .number()
    .int()
    .min(1)
    .max(10)
    .describe("Score 1-10: Was nothing else changed (preservation of non-selected areas)?"),
  blueBorderRemoved: z
    .boolean()
    .describe(
      "Were the blue borders successfully removed from the modified image? This is a requirement but does not affect the other scores."
    ),
  reasoning: z
    .string()
    .describe("Brief explanation covering all criteria, including any issues or shortcomings identified"),
});

export interface JudgeResult {
  score: number; // Overall score (average of the three component scores)
  selectedAreasChanged: number; // Score 1-10: Were the selected (blue border) areas changed?
  selectedAreasCorrect: number; // Score 1-10: Were the selected areas changed correctly according to the prompt?
  nothingElseChanged: number; // Score 1-10: Was nothing else changed (preservation of non-selected areas)?
  blueBorderRemoved: boolean; // Were the blue borders successfully removed? (requirement, doesn't affect other scores)
  reasoning: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cachedInputTokens?: number;
  };
  cost?: number; // Cost in USD
  durationMs?: number;
}

/**
 * Judge evaluates a modified image based on adherence to the user's prompt.
 * Returns three component scores (1-10 each) plus an overall score and reasoning.
 */
export async function judgeImage(
  originalImageBuffer: Buffer,
  modifiedImageBuffer: Buffer,
  userPrompt: string,
  modelId: string = DEFAULT_JUDGE_MODEL_ID,
  selectAllMode: boolean = false
): Promise<JudgeResult> {
  const model = getJudgeModel(modelId);

  const borderDescription = selectAllMode
    ? `The user requested modifications to be applied to the entire image.`
    : `The original image (first image) contains blue borders marking areas selected for modification. The modified image (second image) should have those borders removed and the selected areas changed.`;

  const selectedAreasChangedDesc = selectAllMode
    ? `Was the image actually changed? (In select-all mode, this should be 10 as the entire image is being modified)`
    : `Were the blue-bordered areas actually changed?`;

  const nothingElseChangedDesc = selectAllMode
    ? `Is the overall structure and style of the image preserved? (Should be high if only requested changes were made)`
    : `Were non-selected areas preserved?`;

  const borderRemovalNote = selectAllMode
    ? ""
    : `IMPORTANT: The original image contains blue borders marking selected areas. The modified image MUST have these blue borders completely removed. This is a basic requirement - evaluate "blueBorderRemoved" as true only if NO blue borders remain in the modified image. However, this requirement does NOT affect the three main scores (selectedAreasChanged, selectedAreasCorrect, nothingElseChanged).`;

  const judgeSystemPrompt = `You are a CRITICAL and STRICT image modification judge. Your role is to carefully evaluate whether a modified image truly and completely satisfies the user's intent. Be skeptical and thorough - do not give high scores unless the request was FULLY and ACCURATELY implemented.

${borderDescription} Compare the original image (first image) with the modified image (second image).

${borderRemovalNote}

CRITICAL EVALUATION GUIDELINES:
- Think deeply about the user's INTENT, not just literal compliance. What were they really trying to achieve?
- Be STRICT: Partial implementations, subtle failures, or incomplete changes should receive LOW scores (1-5)
- Only give HIGH scores (8-10) when the request is COMPLETELY and ACCURATELY satisfied
- Look for subtle issues: wrong colors, incorrect styles, missing details, incomplete transformations
- Consider context: Does the result make sense? Would the user be satisfied?
- Be particularly critical of "selectedAreasCorrect" - this is the most important criterion

SCORING RULES (CRITICAL):
- If the user's request was NOT fully satisfied (e.g., "remove pillar" but pillar is still visible, "change color to red" but it's pink, "add object" but it's missing), then "selectedAreasCorrect" MUST be 1-5, and the overall "score" MUST be 1-6 (low)
- The overall "score" should be heavily weighted by "selectedAreasCorrect". If "selectedAreasCorrect" is low (1-5), the overall score MUST be low (1-6), regardless of other scores
- Only if "selectedAreasCorrect" is 8-10 should the overall score be 7-10
- Formula: If selectedAreasCorrect <= 5, then score = min(6, average of all three scores). Otherwise, score = average of all three scores (rounded to nearest integer)
- "blueBorderRemoved" is a separate boolean requirement that does NOT affect the three main scores. Set it to true only if all blue borders are completely removed from the modified image.

Evaluate the following criteria:
- "selectedAreasChanged" (1-10): ${selectedAreasChangedDesc} Be strict: only score high if changes are clearly visible and substantial.
- "selectedAreasCorrect" (1-10): Do the changes match what was requested in the prompt? This is CRITICAL - be very strict here. Score low (1-5) if the changes don't accurately reflect the user's intent, even if something changed. Examples: If user says "remove pillar" but pillar is still visible = 1-3. If user says "change to red" but it's pink = 2-4. If user says "add object" but it's missing = 1-3.
- "nothingElseChanged" (1-10): ${nothingElseChangedDesc} Be strict: any unintended changes should lower this score significantly.
- "blueBorderRemoved" (boolean): ${selectAllMode ? "N/A in select-all mode" : "Were all blue borders completely removed from the modified image? This is a requirement but does not affect other scores."}
- "reasoning": Detailed explanation covering all criteria, including any issues or shortcomings you identified`;

  try {
    const startTime = Date.now();

    const modelConfig = getJudgeModelConfig(modelId);

    const generateObjectOptions: Parameters<typeof generateObject>[0] = {
      model,
      schema: judgeResponseSchema,
      system: judgeSystemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `User's modification instructions: "${userPrompt}"`,
            },
            {
              type: "image",
              image: originalImageBuffer,
              mediaType: "image/png",
            },
            {
              type: "image",
              image: modifiedImageBuffer,
              mediaType: "image/png",
            },
          ],
        },
      ],
    };

    // Use providerOptions from model config if available
    if (modelConfig?.providerOptions) {
      generateObjectOptions.providerOptions = modelConfig.providerOptions;
    }

    console.log(`Judge is ${modelId}`, {
      reasoningEffort: modelConfig?.providerOptions?.openai?.reasoningEffort,
    });

    const result = await generateObject(generateObjectOptions);
    const durationMs = Date.now() - startTime;

    // Extract structured data from result - result.object is typed based on the schema
    const judgeData = result.object as z.infer<typeof judgeResponseSchema>;

    // Ensure all scores are within valid range
    const selectedAreasChanged = Math.max(1, Math.min(10, Math.round(judgeData.selectedAreasChanged)));
    const selectedAreasCorrect = Math.max(1, Math.min(10, Math.round(judgeData.selectedAreasCorrect)));
    const nothingElseChanged = Math.max(1, Math.min(10, Math.round(judgeData.nothingElseChanged)));
    const blueBorderRemoved = judgeData.blueBorderRemoved;

    // Calculate base score (average of three components)
    const averageScore = Math.round((selectedAreasChanged + selectedAreasCorrect + nothingElseChanged) / 3);

    // Apply strict rule: if selectedAreasCorrect is low (<=5), cap the overall score at 6
    // This ensures incomplete implementations get low scores regardless of other metrics
    let score = averageScore;

    // Enforce the rule: if the user's intent wasn't fully satisfied, cap the score
    if (selectedAreasCorrect <= 5) {
      score = Math.min(6, score);
    }

    const finalJudgeData: JudgeResult = {
      score,
      selectedAreasChanged,
      selectedAreasCorrect,
      nothingElseChanged,
      blueBorderRemoved,
      reasoning: judgeData.reasoning || "Could not parse reasoning from judge response",
    };

    // Extract token usage if available
    const usage = result.usage
      ? {
          inputTokens: result.usage.inputTokens ?? 0,
          outputTokens: result.usage.outputTokens ?? 0,
          totalTokens: result.usage.totalTokens ?? 0,
          cachedInputTokens: result.usage.cachedInputTokens ?? 0,
        }
      : undefined;

    // Calculate cost if usage data is available
    const cost = usage
      ? calculateJudgeCost(modelId, usage.inputTokens, usage.outputTokens, usage.cachedInputTokens)
      : undefined;

    return {
      ...finalJudgeData,
      usage,
      cost,
      durationMs,
    };
  } catch (error) {
    console.error("Judge evaluation error:", error);
    // Return a default score on error
    return {
      score: 5,
      selectedAreasChanged: 5,
      selectedAreasCorrect: 5,
      nothingElseChanged: 5,
      blueBorderRemoved: false,
      reasoning: "Judge evaluation failed. Using default score.",
      usage: undefined,
      durationMs: undefined,
    };
  }
}
