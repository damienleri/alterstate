import { generateText } from "ai";
import { getJudgeModel, DEFAULT_JUDGE_MODEL_ID } from "./models";

export interface JudgeResult {
  score: number;
  reasoning: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

/**
 * Judge evaluates a modified image based on adherence to the user's prompt.
 * Returns a score from 1-10 and reasoning.
 */
export async function judgeImage(
  originalImageBuffer: Buffer,
  modifiedImageBuffer: Buffer,
  userPrompt: string,
  modelId: string = DEFAULT_JUDGE_MODEL_ID
): Promise<JudgeResult> {
  const model = getJudgeModel(modelId);

  const judgeSystemPrompt = `You are a highly critical and meticulous image quality judge. Your task is to rigorously evaluate how well a modified image adheres to the user's modification instructions.

You must think critically and examine the images with extreme scrutiny. Do not be lenient. Look for flaws, imperfections, and any deviations from the requirements.

Compare the original image with the modified image and the user's prompt. You must critically analyze:
1. Whether the modifications match what was requested in the prompt - examine every detail, not just the general concept
2. Whether ALL blue cell borders have been COMPLETELY removed from the modified image - check every pixel, every edge, every corner
3. Whether the modified regions blend PERFECTLY with the background - look for ANY visible borders, lines, artifacts, color mismatches, texture inconsistencies, or blending issues
4. Whether the overall quality is maintained - check for distortions, artifacts, or degradation introduced by the modifications

Provide your evaluation as a JSON object with:
- "score": A number from 1-10 where 10 means PERFECT adherence with ZERO flaws, and 1 means complete failure
- "reasoning": A detailed explanation of your score (3-5 sentences) that specifically identifies any flaws, imperfections, or areas where the modification falls short

Be EXTREMELY strict. Only give high scores (8-10) if:
- The modifications PERFECTLY and COMPLETELY match the user's instructions with no ambiguity
- ALL blue borders have been COMPLETELY removed with ZERO traces remaining
- The background is PERFECTLY seamless with NO visible artifacts, borders, lines, color mismatches, or blending issues whatsoever
- The image quality is maintained at the same or higher level than the original

Be skeptical. Look for problems. If you find ANY flaw, imperfection, or deviation, you MUST reflect this in a lower score. A score of 10 should be reserved for truly perfect results that exceed expectations.`;

  const judgePrompt = `User's modification instructions: "${userPrompt}"

You must critically evaluate how well the modified image (second image) adheres to these instructions compared to the original image (first image).

THINK CRITICALLY. Examine the images with extreme care and skepticism. Look for problems, not just what's right.

MANDATORY CRITICAL CHECKS - Be thorough and demanding:
1. Verify that ALL blue cell borders have been COMPLETELY removed in the modified image - examine every pixel, every edge, every corner. Are there ANY traces, remnants, or partial removals? Even a single pixel of blue border remaining is a failure.
2. Verify that the modified regions blend PERFECTLY with the background - scrutinize for ANY visible borders, lines, artifacts, color mismatches, texture inconsistencies, or blending issues where the blue borders were located. Is the blending truly seamless or are there subtle imperfections?
3. Verify that the modifications match the user's instructions EXACTLY - not just generally, but precisely. Are there any deviations, misinterpretations, or incomplete implementations?
4. Check for quality degradation - has the modification introduced any distortions, artifacts, or quality issues that weren't present in the original?
5. Look for edge cases and subtle problems - examine the entire image, not just the obvious areas. Are there any overlooked issues?

Be harsh but fair. If you find ANY flaw, imperfection, or deviation from perfection, you MUST reflect this in your score. A perfect score (10) should only be given if the result is truly flawless and exceeds expectations.

Respond with a JSON object containing "score" (1-10, where 10 is reserved for perfect results) and "reasoning" (detailed explanation of 3-5 sentences that specifically identifies any flaws, imperfections, or areas where the modification falls short).`;

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
    let judgeData: JudgeResult;

    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        judgeData = JSON.parse(jsonMatch[0]);
      } catch {
        // If JSON parsing fails, try to extract score from text
        const scoreMatch = text.match(/["']?score["']?\s*[:=]\s*(\d+(?:\.\d+)?)/i);
        const score = scoreMatch ? Math.max(1, Math.min(10, Math.round(parseFloat(scoreMatch[1])))) : 5;
        judgeData = {
          score,
          reasoning: text.substring(0, 200) || "Could not parse reasoning from judge response",
        };
      }
    } else {
      // Fallback: try to extract score from text
      const scoreMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:out\s*of\s*10|\/10|score)/i) || text.match(/\b(\d+)\b/);
      const score = scoreMatch ? Math.max(1, Math.min(10, Math.round(parseFloat(scoreMatch[1])))) : 5;
      judgeData = {
        score,
        reasoning: text.substring(0, 200) || "Could not parse reasoning from judge response",
      };
    }

    // Ensure score is within valid range
    judgeData.score = Math.max(1, Math.min(10, Math.round(judgeData.score)));

    // Extract token usage if available
    const usage = result.usage
      ? {
          inputTokens: result.usage.inputTokens ?? 0,
          outputTokens: result.usage.outputTokens ?? 0,
          totalTokens: result.usage.totalTokens ?? 0,
        }
      : undefined;

    return {
      ...judgeData,
      usage,
    };
  } catch (error) {
    console.error("Judge evaluation error:", error);
    // Return a default score on error
    return {
      score: 5,
      reasoning: "Judge evaluation failed. Using default score.",
      usage: undefined,
    };
  }
}
