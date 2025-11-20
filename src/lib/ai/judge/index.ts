import { generateObject } from "ai";
import { z } from "zod";
import { getJudgeModel, DEFAULT_JUDGE_MODEL_ID, calculateJudgeCost, getJudgeModelConfig } from "./models";

// Schema for select-all mode (entire image modification)
const judgeResponseSchemaSelectAll = z.object({
  changesCorrect: z
    .number()
    .int()
    .min(1)
    .max(10)
    .describe(
      "Score 1-10: Were the changes made correctly according to the prompt? This is the most important criterion."
    ),
  preservation: z
    .number()
    .int()
    .min(1)
    .max(10)
    .describe(
      "Score 1-10: Is the overall structure and style of the image preserved? (Should be high if only requested changes were made)"
    ),
  proposedPrompt: z
    .string()
    .describe(
      "A prompt to use with the ORIGINAL image (first image) in the next attempt, not the modified image being judged. If the user's prompt could have been improved, suggest a better prompt. If the prompt was good, provide the same prompt or a minor refinement."
    ),
});

// Schema for normal mode (selected areas only)
const judgeResponseSchemaNormal = z.object({
  changesCorrect: z
    .number()
    .int()
    .min(1)
    .max(10)
    .describe(
      "Score 1-10: Were the changes made correctly according to the prompt? This is the most important criterion."
    ),
  preservation: z.number().int().min(1).max(10).describe("Score 1-10: Were non-selected areas preserved?"),
  blueBorderRemoved: z
    .boolean()
    .describe(
      "Were the blue borders successfully removed from the modified image? This is a requirement but does not affect the other scores."
    ),
  proposedPrompt: z
    .string()
    .describe(
      "A prompt to use with the ORIGINAL image (first image) in the next attempt, not the modified image being judged. If the user's prompt could have been improved, suggest a better prompt. If the prompt was good, provide the same prompt or a minor refinement."
    ),
});

export interface JudgeResult {
  score: number; // Overall score (based on changesCorrect, with preservation as secondary factor)
  changesCorrect: number; // Score 1-10: Were the changes made correctly according to the prompt?
  preservation: number; // Score 1-10: Preservation score (meaning differs by mode)
  blueBorderRemoved?: boolean; // Were the blue borders successfully removed? (Only present in normal mode)
  proposedPrompt: string; // A better prompt that should have been used instead
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cachedInputTokens?: number;
  };
  cost: number; // Cost in USD
  durationMs?: number;
}

/**
 * Judge evaluates a modified image based on adherence to the user's prompt.
 * Returns a simplified scoring system with changesCorrect as the primary metric,
 * optional preservation score, and an optional proposedPrompt for improvement suggestions.
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

  const borderRemovalNote = selectAllMode
    ? ""
    : `IMPORTANT: The original image contains blue borders marking selected areas. The modified image MUST have these blue borders completely removed. This is a basic requirement - evaluate "blueBorderRemoved" as true only if NO blue borders remain in the modified image. However, this requirement does NOT affect the main score.`;

  const judgeSystemPrompt = `You are a CRITICAL and STRICT image modification judge. Your role is to carefully evaluate whether a modified image truly and completely satisfies the user's intent. Be skeptical and thorough - do not give high scores unless the request was FULLY and ACCURATELY implemented.

${borderDescription} Compare the original image (first image) with the modified image (second image).

${borderRemovalNote}

CRITICAL EVALUATION GUIDELINES:
- Think deeply about the user's INTENT, not just literal compliance. What were they really trying to achieve?
- Be STRICT: Partial implementations, subtle failures, or incomplete changes should receive LOW scores (1-5)
- Only give HIGH scores (8-10) when the request is COMPLETELY and ACCURATELY satisfied
- Look for subtle issues: wrong colors, incorrect styles, missing details, incomplete transformations
- Consider context: Does the result make sense? Would the user be satisfied?
- Be particularly critical of "changesCorrect" - this is the most important criterion

SCORING RULES (CRITICAL):
- If the user's request was NOT fully satisfied (e.g., "remove pillar" but pillar is still visible, "change color to red" but it's pink, "add object" but it's missing), then "changesCorrect" MUST be 1-5
- Be very strict with "changesCorrect" - this is the most important criterion. Only give high scores (8-10) when the request is COMPLETELY and ACCURATELY satisfied
${selectAllMode ? "" : '- "blueBorderRemoved" is a separate boolean requirement that does NOT affect the other scores. Set it to true only if all blue borders are completely removed from the modified image.'}

Evaluate the following criteria:
- "changesCorrect" (1-10, REQUIRED): Do the changes match what was requested in the prompt? This is CRITICAL - be very strict here. Score low (1-5) if the changes don't accurately reflect the user's intent, even if something changed. Examples: If user says "remove pillar" but pillar is still visible = 1-3. If user says "change to red" but it's pink = 2-4. If user says "add object" but it's missing = 1-3.
- "preservation" (1-10, REQUIRED): ${selectAllMode ? "Is the overall structure and style of the image preserved? (Should be high if only requested changes were made)" : "Were non-selected areas preserved?"} Be strict: any unintended changes should lower this score significantly.
${selectAllMode ? "" : '- "blueBorderRemoved" (boolean, REQUIRED): Were all blue borders completely removed from the modified image? This is a requirement but does not affect other scores.'}
- "proposedPrompt" (string, REQUIRED): Provide a prompt to use with the ORIGINAL image (first image) in the next attempt, not the modified image being judged. If the user's prompt could have been improved, suggest a better prompt. If the original prompt was good, provide the same prompt or a minor refinement.`;

  // Select the appropriate schema based on mode
  const judgeResponseSchema = selectAllMode ? judgeResponseSchemaSelectAll : judgeResponseSchemaNormal;

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
      provider: modelConfig?.provider,
      providerOptions: modelConfig?.providerOptions,
    });

    const result = await generateObject(generateObjectOptions);
    const durationMs = Date.now() - startTime;

    // Extract structured data from result - result.object is typed based on the schema
    const judgeData = result.object as z.infer<typeof judgeResponseSchema>;

    // Ensure all scores are within valid range
    const changesCorrect = Math.max(1, Math.min(10, Math.round(judgeData.changesCorrect)));
    const preservation = Math.max(1, Math.min(10, Math.round(judgeData.preservation)));
    const blueBorderRemoved = selectAllMode
      ? undefined
      : (judgeData as z.infer<typeof judgeResponseSchemaNormal>).blueBorderRemoved;
    const proposedPrompt = judgeData.proposedPrompt.trim();

    // Calculate score based on simplified schema
    // If changesCorrect is low (<=5), cap the overall score at 6
    // Otherwise, average changesCorrect and preservation
    let score: number;
    if (changesCorrect <= 5) {
      score = Math.min(6, changesCorrect);
    } else {
      score = Math.round((changesCorrect + preservation) / 2);
    }

    // Extract token usage (always provide, defaulting to 0 if not available)
    const usage = {
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      totalTokens: result.usage?.totalTokens ?? 0,
      cachedInputTokens: result.usage?.cachedInputTokens ?? 0,
    };

    // Calculate cost (always provide, defaulting to 0 if usage is 0)
    const cost = calculateJudgeCost(modelId, usage.inputTokens, usage.outputTokens, usage.cachedInputTokens);

    const finalJudgeData: JudgeResult = {
      score,
      changesCorrect,
      preservation,
      ...(selectAllMode ? {} : { blueBorderRemoved }),
      proposedPrompt,
      usage,
      cost,
      durationMs,
    };

    return finalJudgeData;
  } catch (error) {
    console.error("Judge evaluation error:", error);
    // Return a default score on error
    return {
      score: 5,
      changesCorrect: 5,
      preservation: 5,
      proposedPrompt: userPrompt, // Use original prompt as fallback
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cachedInputTokens: 0,
      },
      cost: 0,
      durationMs: undefined,
    };
  }
}
