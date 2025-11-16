import { generateText } from "ai";
import { getJudgeModel, DEFAULT_JUDGE_MODEL_ID, calculateJudgeCost, getJudgeModelConfig } from "./models";

export interface JudgeResult {
  score: number; // Overall score (average of the three component scores)
  selectedAreasChanged: number; // Score 1-10: Were the selected (blue border) areas changed?
  selectedAreasCorrect: number; // Score 1-10: Were the selected areas changed correctly according to the prompt?
  nothingElseChanged: number; // Score 1-10: Was nothing else changed (preservation of non-selected areas)?
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

  const judgeSystemPrompt = `You are a CRITICAL and STRICT image modification judge. Your role is to carefully evaluate whether a modified image truly and completely satisfies the user's intent. Be skeptical and thorough - do not give high scores unless the request was FULLY and ACCURATELY implemented.

${borderDescription} Compare the original image (first image) with the modified image (second image).

CRITICAL EVALUATION GUIDELINES:
- Think deeply about the user's INTENT, not just literal compliance. What were they really trying to achieve?
- Be STRICT: Partial implementations, subtle failures, or incomplete changes should receive LOW scores (1-5)
- Only give HIGH scores (8-10) when the request is COMPLETELY and ACCURATELY satisfied
- Look for subtle issues: wrong colors, incorrect styles, missing details, incomplete transformations
- Consider context: Does the result make sense? Would the user be satisfied?
- Be particularly critical of "selectedAreasCorrect" - this is the most important criterion

Evaluate THREE criteria and respond with a JSON object:
- "selectedAreasChanged" (1-10): ${selectedAreasChangedDesc} Be strict: only score high if changes are clearly visible and substantial.
- "selectedAreasCorrect" (1-10): Do the changes match what was requested in the prompt? This is CRITICAL - be very strict here. Score low (1-5) if the changes don't accurately reflect the user's intent, even if something changed.
- "nothingElseChanged" (1-10): ${nothingElseChangedDesc} Be strict: any unintended changes should lower this score significantly.
- "score": Average of the three scores (rounded to nearest integer)
- "reasoning": Detailed explanation covering all three criteria, including any issues or shortcomings you identified`;

  try {
    const startTime = Date.now();

    const modelConfig = getJudgeModelConfig(modelId);

    const generateTextOptions: Parameters<typeof generateText>[0] = {
      model,
      system: judgeSystemPrompt,
      prompt: [
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
      generateTextOptions.providerOptions = modelConfig.providerOptions;
    }

    console.log(`Judge is ${modelId}`, {
      reasoningEffort: modelConfig?.providerOptions?.openai?.reasoningEffort,
    });

    const result = await generateText(generateTextOptions);
    const durationMs = Date.now() - startTime;

    // Try to parse JSON from the response
    const text = result.text.trim();
    let judgeData: Partial<JudgeResult>;

    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        judgeData = parsed;
      } catch {
        // If JSON parsing fails, try to extract scores from text
        const selectedAreasChangedMatch = text.match(/["']?selectedAreasChanged["']?\s*[:=]\s*(\d+(?:\.\d+)?)/i);
        const selectedAreasCorrectMatch = text.match(/["']?selectedAreasCorrect["']?\s*[:=]\s*(\d+(?:\.\d+)?)/i);
        const nothingElseChangedMatch = text.match(/["']?nothingElseChanged["']?\s*[:=]\s*(\d+(?:\.\d+)?)/i);
        const scoreMatch = text.match(/["']?score["']?\s*[:=]\s*(\d+(?:\.\d+)?)/i);

        const selectedAreasChanged = selectedAreasChangedMatch
          ? Math.max(1, Math.min(10, Math.round(parseFloat(selectedAreasChangedMatch[1]))))
          : 5;
        const selectedAreasCorrect = selectedAreasCorrectMatch
          ? Math.max(1, Math.min(10, Math.round(parseFloat(selectedAreasCorrectMatch[1]))))
          : 5;
        const nothingElseChanged = nothingElseChangedMatch
          ? Math.max(1, Math.min(10, Math.round(parseFloat(nothingElseChangedMatch[1]))))
          : 5;
        const score = scoreMatch
          ? Math.max(1, Math.min(10, Math.round(parseFloat(scoreMatch[1]))))
          : Math.round((selectedAreasChanged + selectedAreasCorrect + nothingElseChanged) / 3);

        judgeData = {
          score,
          selectedAreasChanged,
          selectedAreasCorrect,
          nothingElseChanged,
          reasoning: text.substring(0, 200) || "Could not parse reasoning from judge response",
        };
      }
    } else {
      // Fallback: try to extract scores from text
      const selectedAreasChangedMatch = text.match(/["']?selectedAreasChanged["']?\s*[:=]\s*(\d+(?:\.\d+)?)/i);
      const selectedAreasCorrectMatch = text.match(/["']?selectedAreasCorrect["']?\s*[:=]\s*(\d+(?:\.\d+)?)/i);
      const nothingElseChangedMatch = text.match(/["']?nothingElseChanged["']?\s*[:=]\s*(\d+(?:\.\d+)?)/i);
      const scoreMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:out\s*of\s*10|\/10|score)/i) || text.match(/\b(\d+)\b/);

      const selectedAreasChanged = selectedAreasChangedMatch
        ? Math.max(1, Math.min(10, Math.round(parseFloat(selectedAreasChangedMatch[1]))))
        : 5;
      const selectedAreasCorrect = selectedAreasCorrectMatch
        ? Math.max(1, Math.min(10, Math.round(parseFloat(selectedAreasCorrectMatch[1]))))
        : 5;
      const nothingElseChanged = nothingElseChangedMatch
        ? Math.max(1, Math.min(10, Math.round(parseFloat(nothingElseChangedMatch[1]))))
        : 5;
      const score = scoreMatch
        ? Math.max(1, Math.min(10, Math.round(parseFloat(scoreMatch[1]))))
        : Math.round((selectedAreasChanged + selectedAreasCorrect + nothingElseChanged) / 3);

      judgeData = {
        score,
        selectedAreasChanged,
        selectedAreasCorrect,
        nothingElseChanged,
        reasoning: text.substring(0, 200) || "Could not parse reasoning from judge response",
      };
    }

    // Ensure all scores are within valid range and calculate overall score if missing
    const selectedAreasChanged = Math.max(1, Math.min(10, Math.round(judgeData.selectedAreasChanged ?? 5)));
    const selectedAreasCorrect = Math.max(1, Math.min(10, Math.round(judgeData.selectedAreasCorrect ?? 5)));
    const nothingElseChanged = Math.max(1, Math.min(10, Math.round(judgeData.nothingElseChanged ?? 5)));
    const score = judgeData.score
      ? Math.max(1, Math.min(10, Math.round(judgeData.score)))
      : Math.round((selectedAreasChanged + selectedAreasCorrect + nothingElseChanged) / 3);

    const finalJudgeData: JudgeResult = {
      score,
      selectedAreasChanged,
      selectedAreasCorrect,
      nothingElseChanged,
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
      reasoning: "Judge evaluation failed. Using default score.",
      usage: undefined,
      durationMs: undefined,
    };
  }
}
