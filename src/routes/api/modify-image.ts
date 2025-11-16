import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { saveModifiedImage } from "~/utils/storage";
import { formatCellsForPrompt } from "~/utils/imageProcessing";
import { promises as fs } from "fs";
import path from "path";
import { judgeImage } from "~/lib/ai/judge";
import { modifyImage } from "~/lib/ai/modify-image";
import { DEFAULT_JUDGE_MODEL_ID, getJudgeModelConfig } from "~/lib/ai/judge/models";

export const Route = createFileRoute("/api/modify-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const {
            imageDataUrl,
            selectedCells,
            prompt,
            originalFilename,
            maxAttempts = 3,
            scoreThreshold = 8,
            gridRows,
            gridCols,
            judgeModelId = DEFAULT_JUDGE_MODEL_ID,
          } = body;

          if (!imageDataUrl || !selectedCells || !prompt) {
            return json({ error: "Missing required fields" }, { status: 400 });
          }

          // Validate maxAttempts and scoreThreshold
          const numAttempts = Math.max(1, Math.min(10, Math.round(maxAttempts)));
          const threshold = Math.max(1, Math.min(10, Math.round(scoreThreshold)));

          // Validate API keys based on selected judge model
          // Note: modifyImage always uses Google, so we always need GOOGLE_GENERATIVE_AI_API_KEY
          const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
          if (!googleApiKey) {
            return json(
              {
                error: "GOOGLE_GENERATIVE_AI_API_KEY not configured. Please add it to .env file",
              },
              { status: 500 }
            );
          }

          // Check OpenAI API key if using OpenAI judge model
          const judgeModelConfig = getJudgeModelConfig(judgeModelId);
          if (judgeModelConfig?.provider === "openai") {
            const openaiApiKey = process.env.OPENAI_API_KEY;
            if (!openaiApiKey) {
              return json(
                {
                  error: "OPENAI_API_KEY not configured. Please add it to .env file to use OpenAI judge models",
                },
                { status: 500 }
              );
            }
          }

          // Convert data URL to buffer (original image)
          const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
          const originalImageBuffer = Buffer.from(base64Data, "base64");

          // Save debug copy of image with borders
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const debugFilename = `debug-${timestamp}.png`;
          const debugPath = path.join(process.cwd(), "temp", debugFilename);
          await fs.writeFile(debugPath, originalImageBuffer);

          // Log debug information
          const cellInfo = formatCellsForPrompt(selectedCells);
          console.log(`\n[DEBUG] Image modification request:`);
          console.log(`  - Image with borders: temp/${debugFilename}`);
          console.log(`  - Selected cells: ${JSON.stringify(selectedCells)}`);
          console.log(`  - ${cellInfo}`);
          console.log(`  - User prompt: "${prompt}"`);
          console.log(`  - Max attempts: ${numAttempts}, Score threshold: ${threshold}`);
          console.log(`  - Judge model: ${judgeModelId}\n`);

          // Store all attempts with full data
          interface Attempt {
            imageUrl: string;
            judgeScore: number;
            judgeReasoning: string;
            attemptNumber: number;
            usage: {
              inputTokens: number;
              outputTokens: number;
              totalTokens: number;
            } | null;
            judgeUsage: {
              inputTokens: number;
              outputTokens: number;
              totalTokens: number;
            } | null;
          }

          const allAttempts: Attempt[] = [];
          let totalImageGenerationUsage = {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
          };
          let totalJudgeUsage = {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
          };

          // Loop through attempts
          for (let attemptNumber = 1; attemptNumber <= numAttempts; attemptNumber++) {
            console.log(`[DEBUG] Attempt ${attemptNumber}/${numAttempts}`);

            // Generate modified image
            let modifyResult;
            try {
              modifyResult = await modifyImage(originalImageBuffer, selectedCells, prompt);
            } catch (error) {
              console.error(`[DEBUG] Attempt ${attemptNumber}: Image modification failed`, error);
              continue;
            }

            const modifiedBuffer = modifyResult.imageBuffer;

            // Judge the modified image
            console.log(`[DEBUG] Attempt ${attemptNumber}: Judging image...`);
            const judgeResult = await judgeImage(originalImageBuffer, modifiedBuffer, prompt, judgeModelId);
            console.log(
              `[DEBUG] Attempt ${attemptNumber}: Score = ${judgeResult.score}, Reasoning: ${judgeResult.reasoning}`
            );

            // Save the modified image
            const modifiedFilename = await saveModifiedImage(modifiedBuffer, originalFilename || "image.png");

            // Accumulate image generation token usage
            const attemptUsage = modifyResult.usage
              ? {
                  inputTokens: modifyResult.usage.inputTokens,
                  outputTokens: modifyResult.usage.outputTokens,
                  totalTokens: modifyResult.usage.totalTokens,
                }
              : null;

            if (attemptUsage) {
              totalImageGenerationUsage.inputTokens += attemptUsage.inputTokens;
              totalImageGenerationUsage.outputTokens += attemptUsage.outputTokens;
              totalImageGenerationUsage.totalTokens += attemptUsage.totalTokens;
            }

            // Accumulate judge token usage
            const attemptJudgeUsage = judgeResult.usage
              ? {
                  inputTokens: judgeResult.usage.inputTokens,
                  outputTokens: judgeResult.usage.outputTokens,
                  totalTokens: judgeResult.usage.totalTokens,
                }
              : null;

            if (attemptJudgeUsage) {
              totalJudgeUsage.inputTokens += attemptJudgeUsage.inputTokens;
              totalJudgeUsage.outputTokens += attemptJudgeUsage.outputTokens;
              totalJudgeUsage.totalTokens += attemptJudgeUsage.totalTokens;
            }

            const attempt: Attempt = {
              imageUrl: `/api/images-modified/${modifiedFilename}`,
              judgeScore: judgeResult.score,
              judgeReasoning: judgeResult.reasoning,
              attemptNumber,
              usage: attemptUsage,
              judgeUsage: attemptJudgeUsage,
            };

            allAttempts.push(attempt);

            // If score meets threshold, prepare response and save history
            if (judgeResult.score >= threshold) {
              console.log(
                `[DEBUG] Attempt ${attemptNumber}: Score ${judgeResult.score} meets threshold ${threshold}. Returning.`
              );

              // Sort attempts by score (highest first) before returning
              allAttempts.sort((a, b) => b.judgeScore - a.judgeScore);

              // Calculate total usage (image generation + judge)
              const totalUsage = {
                inputTokens: totalImageGenerationUsage.inputTokens + totalJudgeUsage.inputTokens,
                outputTokens: totalImageGenerationUsage.outputTokens + totalJudgeUsage.outputTokens,
                totalTokens: totalImageGenerationUsage.totalTokens + totalJudgeUsage.totalTokens,
              };

              // Prepare response data
              const responseData = {
                success: true,
                attempts: allAttempts,
                totalUsage,
                imageGenerationUsage: totalImageGenerationUsage,
                judgeUsage: totalJudgeUsage,
                selectedCells: Array.from(selectedCells),
                prompt,
                originalFilename: originalFilename || "image.png",
                maxAttempts: numAttempts,
                scoreThreshold: threshold,
                gridRows: gridRows || undefined,
                gridCols: gridCols || undefined,
                judgeModelId,
                timestamp: new Date().toISOString(),
              };

              // Save to JSON file for historical tracking
              const historyFilename = `run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
              const historyPath = path.join(process.cwd(), "uploads", historyFilename);
              await fs.writeFile(historyPath, JSON.stringify(responseData, null, 2));

              return json(responseData);
            }
          }

          // All attempts failed to meet threshold
          console.log(`[DEBUG] All ${allAttempts.length} attempts failed to meet threshold ${threshold}`);

          // Sort attempts by score (highest first)
          allAttempts.sort((a, b) => b.judgeScore - a.judgeScore);

          // Calculate total usage (image generation + judge)
          const totalUsage = {
            inputTokens: totalImageGenerationUsage.inputTokens + totalJudgeUsage.inputTokens,
            outputTokens: totalImageGenerationUsage.outputTokens + totalJudgeUsage.outputTokens,
            totalTokens: totalImageGenerationUsage.totalTokens + totalJudgeUsage.totalTokens,
          };

          // Prepare response data
          const responseData = {
            success: true,
            attempts: allAttempts,
            totalUsage,
            imageGenerationUsage: totalImageGenerationUsage,
            judgeUsage: totalJudgeUsage,
            selectedCells: Array.from(selectedCells),
            prompt,
            originalFilename: originalFilename || "image.png",
            maxAttempts: numAttempts,
            scoreThreshold: threshold,
            gridRows: gridRows || undefined,
            gridCols: gridCols || undefined,
            judgeModelId,
            timestamp: new Date().toISOString(),
          };

          // Save to JSON file for historical tracking
          const historyFilename = `run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
          const historyPath = path.join(process.cwd(), "uploads", historyFilename);
          await fs.writeFile(historyPath, JSON.stringify(responseData, null, 2));

          return json(responseData);
        } catch (error) {
          console.error("Image modification error:", error);
          return json(
            {
              error: error instanceof Error ? error.message : "Image modification failed",
            },
            { status: 500 }
          );
        }
      },
    },
  },
});
