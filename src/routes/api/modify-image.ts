import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { saveModifiedImage, saveAnnotatedImage } from "~/utils/storage";
import { formatCellsForPrompt, resizeImageForAI } from "~/utils/imageProcessing";
import { promises as fs } from "fs";
import path from "path";
import { judgeImage } from "~/lib/ai/judge";
import { modifyImage } from "~/lib/ai/modify-image";
import { DEFAULT_JUDGE_MODEL_ID, getJudgeModelConfig } from "~/lib/ai/judge/models";
import { uuidv7 } from "uuidv7";

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
            maxAttempts = 2,
            gridRows,
            gridCols,
            judgeModelId = DEFAULT_JUDGE_MODEL_ID,
            selectAllMode = false,
            runId, // Optional: if provided, use for filename and annotated image
          } = body;

          if (!imageDataUrl || !selectedCells || !prompt) {
            return json({ error: "Missing required fields" }, { status: 400 });
          }

          // Validate maxAttempts
          const numAttempts = Math.max(1, Math.min(10, Math.round(maxAttempts)));

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

          // Convert data URL to buffer (image with borders/annotations)
          const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
          const annotatedImageBuffer = Buffer.from(base64Data, "base64");

          // Generate runId if not provided
          const actualRunId = runId || uuidv7();

          // Save annotated image (with borders) to data/annotated using runId
          const annotatedFilename = await saveAnnotatedImage(
            annotatedImageBuffer,
            originalFilename || "image.png",
            actualRunId
          );

          // Resize image before processing to reduce token usage
          const originalImageBuffer = await resizeImageForAI(annotatedImageBuffer);

          // Log debug information
          const cellInfo = formatCellsForPrompt(selectedCells);
          console.log(`\n[DEBUG] Image modification request:`);
          console.log(`  - Annotated image: data/annotated/${annotatedFilename}`);
          console.log(`  - Selected cells: ${JSON.stringify(selectedCells)}`);
          console.log(`  - ${cellInfo}`);
          console.log(`  - User prompt: "${prompt}"`);
          console.log(`  - Max LLM calls: ${numAttempts} (each requesting 3 varied images)`);
          console.log(`  - Judge model: ${judgeModelId}`);
          console.log(`  - Select-all mode: ${selectAllMode}\n`);

          // Store all attempts with full data
          interface Attempt {
            imageUrl: string;
            judgeScore: number;
            judgeSelectedAreasChanged: number;
            judgeSelectedAreasCorrect: number;
            judgeNothingElseChanged: number;
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
            imageGenerationDurationMs?: number;
            judgeDurationMs?: number;
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

          // Loop through LLM calls (each call requests 3 varied images)
          let globalAttemptCounter = 1;
          for (let llmCallNumber = 1; llmCallNumber <= numAttempts; llmCallNumber++) {
            console.log(`[DEBUG] LLM Call ${llmCallNumber}/${numAttempts} (requesting 3 varied images)`);

            // Generate modified images (returns array of 3 images)
            let modifyResult;
            try {
              modifyResult = await modifyImage(originalImageBuffer, prompt, selectAllMode);
            } catch (error) {
              console.error(`[DEBUG] LLM Call ${llmCallNumber}: Image modification failed`, error);
              continue;
            }

            const imageBuffers = modifyResult.imageBuffers;
            console.log(`[DEBUG] LLM Call ${llmCallNumber}: Received ${imageBuffers.length} images`);

            // Process each image returned from this LLM call
            for (let imageIndex = 0; imageIndex < imageBuffers.length; imageIndex++) {
              const modifiedBuffer = imageBuffers[imageIndex];
              const currentAttemptNumber = globalAttemptCounter++;

              // Judge the modified image
              console.log(
                `[DEBUG] Attempt ${currentAttemptNumber}: Judging image ${imageIndex + 1}/${imageBuffers.length} from LLM Call ${llmCallNumber}...`
              );
              const judgeResult = await judgeImage(
                originalImageBuffer,
                modifiedBuffer,
                prompt,
                judgeModelId,
                selectAllMode
              );
              console.log(
                `[DEBUG] Attempt ${currentAttemptNumber}: Score = ${judgeResult.score} (Changed: ${judgeResult.selectedAreasChanged}, Correct: ${judgeResult.selectedAreasCorrect}, Preserved: ${judgeResult.nothingElseChanged}, BorderRemoved: ${judgeResult.blueBorderRemoved}), Reasoning: ${judgeResult.reasoning}`
              );

              // Save the modified image
              const modifiedFilename = await saveModifiedImage(modifiedBuffer, originalFilename || "image.png");

              // Accumulate image generation token usage (split across all images from this call)
              const attemptUsage = modifyResult.usage
                ? {
                    // Divide usage by number of images since it's shared across all images from one call
                    inputTokens: Math.round(modifyResult.usage.inputTokens / imageBuffers.length),
                    outputTokens: Math.round(modifyResult.usage.outputTokens / imageBuffers.length),
                    totalTokens: Math.round(modifyResult.usage.totalTokens / imageBuffers.length),
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
                judgeSelectedAreasChanged: judgeResult.selectedAreasChanged,
                judgeSelectedAreasCorrect: judgeResult.selectedAreasCorrect,
                judgeNothingElseChanged: judgeResult.nothingElseChanged,
                judgeReasoning: judgeResult.reasoning,
                attemptNumber: currentAttemptNumber,
                usage: attemptUsage,
                judgeUsage: attemptJudgeUsage,
                imageGenerationDurationMs: modifyResult.durationMs
                  ? Math.round(modifyResult.durationMs / imageBuffers.length)
                  : undefined,
                judgeDurationMs: judgeResult.durationMs,
              };

              allAttempts.push(attempt);
            }
          }

          // All images have been processed and judged
          console.log(`[DEBUG] Completed processing ${allAttempts.length} images from ${numAttempts} LLM calls`);

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
            gridRows: gridRows || undefined,
            gridCols: gridCols || undefined,
            judgeModelId,
            runId: actualRunId,
            timestamp: new Date().toISOString(),
          };

          // Save to JSON file for historical tracking using runId
          const historyFilename = `run-${actualRunId}.json`;
          const dataDir = path.join(process.cwd(), "data");
          await fs.mkdir(dataDir, { recursive: true });
          const historyPath = path.join(dataDir, historyFilename);
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
