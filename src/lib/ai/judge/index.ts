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
  modelId: string = DEFAULT_JUDGE_MODEL_ID
): Promise<JudgeResult> {
  const model = getJudgeModel(modelId);

  const judgeSystemPrompt = `You are an image modification judge. Your task is to evaluate whether a modified image correctly follows the user's instructions.

The original image (first image) contains blue borders marking specific areas that were selected for modification.
The modified image (second image) should have those blue borders removed and the selected areas changed according to the user's prompt.

You must evaluate THREE specific criteria:

1. SELECTED AREAS CHANGED (selectedAreasChanged): Were the areas marked with blue borders in the original image actually changed in the modified image? 
   - Score 10: The selected areas are clearly and visibly different from the original
   - Score 1: The selected areas appear identical or nearly identical to the original (no change detected)

2. SELECTED AREAS CORRECT (selectedAreasCorrect): Were the selected areas changed correctly according to the user's prompt?
   - Score 10: The changes perfectly match what was requested in the prompt
   - Score 5: The changes partially match but miss some aspects or have minor deviations
   - Score 1: The changes do not match the prompt at all or are completely wrong

3. NOTHING ELSE CHANGED (nothingElseChanged): Were all non-selected areas preserved exactly as they were?
   - Score 10: All areas outside the blue borders are completely unchanged
   - Score 5: Minor unintended changes in non-selected areas
   - Score 1: Significant unintended changes in non-selected areas

Provide your evaluation as a JSON object with:
- "selectedAreasChanged": A number from 1-10
- "selectedAreasCorrect": A number from 1-10
- "nothingElseChanged": A number from 1-10
- "score": The average of the three scores above (rounded to nearest integer)
- "reasoning": A clear explanation (2-4 sentences) covering all three criteria

Be thorough but fair. Examine the images carefully to identify the blue-bordered areas in the original and verify each criterion independently.`;

  const judgePrompt = `User's modification instructions: "${userPrompt}"

Compare the original image (first image, with blue borders marking selected areas) with the modified image (second image, with blue borders removed).

Evaluate the modification on these three criteria:

1. SELECTED AREAS CHANGED: Look at the areas marked with blue borders in the original image. Are these same areas visibly different in the modified image? The blue borders should be gone, and the content within those areas should be changed.

2. SELECTED AREAS CORRECT: Do the changes in the selected areas match what the user requested? Compare what was asked for in the prompt with what actually appears in the modified image.

3. NOTHING ELSE CHANGED: Compare all areas outside the blue borders between the two images. Are they identical? Any unintended changes to non-selected areas should be noted.

Respond with a JSON object containing:
- "selectedAreasChanged": 1-10
- "selectedAreasCorrect": 1-10  
- "nothingElseChanged": 1-10
- "score": average of the three scores (rounded)
- "reasoning": brief explanation covering all three criteria`;

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
              text: judgePrompt,
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
