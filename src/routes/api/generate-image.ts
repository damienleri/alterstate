import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { uuidv7 } from "uuidv7";
import { resizeImageForAI, formatCellsForPrompt } from "~/utils/imageProcessing";
import { modifyImage } from "~/lib/ai/modify-image";
import { saveGeneratedImage, saveAnnotatedImage, addImagesToIndex } from "~/utils/storage";
import { createRun, addGeneration, getRun, type GenerationRun } from "~/lib/storage/generation-runs";

export const Route = createFileRoute("/api/generate-image")({
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
            gridRows,
            gridCols,
            judgeModelId,
            selectAllMode = false,
            runId, // Optional: if provided, use existing run, otherwise create new
          } = body;

          if (!imageDataUrl || !selectedCells || !prompt) {
            return json({ error: "Missing required fields" }, { status: 400 });
          }

          // Validate API keys
          const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
          if (!googleApiKey) {
            return json(
              {
                error: "GOOGLE_GENERATIVE_AI_API_KEY not configured. Please add it to .env file",
              },
              { status: 500 }
            );
          }

          // Convert data URL to buffer (image with borders/annotations)
          const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
          const annotatedImageBuffer = Buffer.from(base64Data, "base64");

          // Get or create run first to have runId for annotated image
          let run: GenerationRun;
          let actualRunId: string;

          if (runId) {
            // Check if run exists, if not create it (handles race conditions for parallel requests)
            const existingRun = getRun(runId);
            if (existingRun) {
              run = existingRun;
              actualRunId = runId;
            } else {
              // Run doesn't exist yet, create it (first request to arrive with this runId)
              actualRunId = createRun(
                Buffer.alloc(0), // Placeholder, will be updated after resize
                prompt,
                Array.from(selectedCells),
                {
                  gridRows,
                  gridCols,
                  judgeModelId: judgeModelId || "gpt-4o",
                  selectAllMode,
                  originalFilename: originalFilename || "image.png",
                },
                runId
              );
              run = getRun(actualRunId)!;
            }
          } else {
            // Create new run
            actualRunId = createRun(
              Buffer.alloc(0), // Placeholder, will be updated after resize
              prompt,
              Array.from(selectedCells),
              {
                gridRows,
                gridCols,
                judgeModelId: judgeModelId || "gpt-4o",
                selectAllMode,
                originalFilename: originalFilename || "image.png",
              }
            );
            run = getRun(actualRunId)!;
          }

          // Save annotated image (with borders) to data/annotated using runId
          await saveAnnotatedImage(annotatedImageBuffer, originalFilename || "image.png", actualRunId);

          // Resize image before processing
          const originalImageBuffer = await resizeImageForAI(annotatedImageBuffer);

          // Update run with the actual image buffer
          run.originalImageBuffer = originalImageBuffer;

          // Generate LLM call ID (shared across all images from this invocation)
          const llmCallId = uuidv7();

          // Log request details
          const cellInfo = formatCellsForPrompt(selectedCells);
          console.log(
            `[Generate] LLM call ${llmCallId} for run ${actualRunId}: ${cellInfo}, prompt: "${prompt.substring(0, 50)}..."`
          );

          // Generate modified images (returns array of IMAGES_PER_LLM_CALL images)
          const startTime = Date.now();
          const modifyResult = await modifyImage(originalImageBuffer, prompt, selectAllMode);
          const durationMs = Date.now() - startTime;

          const imageBuffers = modifyResult.imageBuffers;
          if (imageBuffers.length === 0) {
            throw new Error("No images were generated");
          }

          console.log(`[Generate] LLM call ${llmCallId} returned ${imageBuffers.length} images`);

          // Process all images from this LLM call
          const generations = await Promise.all(
            imageBuffers.map(async (imageBuffer, imageIndex) => {
              const generationId = uuidv7();

              // Save the modified image (index will be updated via batch addImagesToIndex)
              const modifiedFilename = await saveGeneratedImage(imageBuffer, originalFilename || "image.png");

              const imageUrl = `/api/images/${modifiedFilename}`;

              // Extract token usage (split across all images from this call)
              const usage = modifyResult.usage
                ? {
                    // Divide by number of images since usage is shared across all images from one call
                    inputTokens: Math.round(modifyResult.usage.inputTokens / imageBuffers.length),
                    outputTokens: Math.round(modifyResult.usage.outputTokens / imageBuffers.length),
                    totalTokens: Math.round(modifyResult.usage.totalTokens / imageBuffers.length),
                  }
                : undefined;

              // Add generation to storage
              addGeneration(
                actualRunId,
                generationId,
                imageBuffer,
                imageUrl,
                usage,
                durationMs,
                "completed",
                llmCallId,
                imageIndex
              );

              return {
                generationId,
                imageUrl,
                usage,
                imageIndex,
                filename: modifiedFilename,
              };
            })
          );

          // Batch add all images to index at once (more efficient and prevents race conditions)
          await addImagesToIndex(
            generations.map((gen) => ({
              filename: gen.filename,
              type: "generated" as const,
            }))
          );

          return json({
            success: true,
            runId: actualRunId,
            llmCallId,
            generations,
            durationMs,
          });
        } catch (error) {
          console.error("Image generation error:", error);
          return json(
            {
              error: error instanceof Error ? error.message : "Image generation failed",
            },
            { status: 500 }
          );
        }
      },
    },
  },
});
