import { generateText } from "ai";
import { getJudgeModel, DEFAULT_JUDGE_MODEL_ID, calculateJudgeCost } from "./models";

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

  const judgeSystemPrompt = `You are an image modification judge. Evaluate whether a modified image correctly follows the user's instructions.

${borderDescription} Compare the original image (first image) with the modified image (second image).

Evaluate THREE criteria and respond with a JSON object:
- "selectedAreasChanged" (1-10): ${selectedAreasChangedDesc}
- "selectedAreasCorrect" (1-10): Do the changes match what was requested in the prompt?
- "nothingElseChanged" (1-10): ${nothingElseChangedDesc}
- "score": Average of the three scores (rounded to nearest integer)
- "reasoning": Brief explanation covering all three criteria`;

  try {
    const result = await generateText({
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
    });

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
    };
  }
}
