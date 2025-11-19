import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { uuidv7 } from "uuidv7";
import { resizeImageForAI, formatCellsForPrompt } from "~/utils/imageProcessing";
import { modifyImage } from "~/lib/ai/modify-image";
import { saveGeneratedImage, saveAnnotatedImage, addImagesToIndex, createImageFromFilename } from "~/utils/storage";
import { createRun, addGeneration, getRun, type GenerationRun } from "~/lib/storage/generation-runs";

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const {
            imageDataUrls, // Array of images (always an array, even for single image)
            selectedCellsArrays, // Array of selected cells for each image
            prompt,
            originalFilenames, // Array of filenames for each image
            gridRowsArrays, // Array of grid rows for each image
            gridColsArrays, // Array of grid cols for each image
            judgeModelId,
            selectAllModeArray, // Array of selectAllMode for each image
            runId, // Optional: if provided, use existing run, otherwise create new
          } = body;

          if (!imageDataUrls || !Array.isArray(imageDataUrls) || imageDataUrls.length === 0) {
            return json({ error: "Missing or invalid imageDataUrls array" }, { status: 400 });
          }

          if (!selectedCellsArrays || !Array.isArray(selectedCellsArrays) || selectedCellsArrays.length === 0) {
            return json({ error: "Missing or invalid selectedCellsArrays array" }, { status: 400 });
          }

          if (!prompt) {
            return json({ error: "Missing prompt" }, { status: 400 });
          }

          if (imageDataUrls.length !== selectedCellsArrays.length) {
            return json({ error: "Number of images must match number of selected cells arrays" }, { status: 400 });
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

          // Convert data URLs to buffers (images with borders/annotations)
          const annotatedImageBuffers = imageDataUrls.map((dataUrl: string) => {
            const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
            return Buffer.from(base64Data, "base64");
          });

          // Get or create run first to have runId for annotated images
          // Use first image's data for run metadata
          const firstSelectedCells = selectedCellsArrays[0];
          const firstGridRows = (gridRowsArrays && gridRowsArrays[0]) || 6;
          const firstGridCols = (gridColsArrays && gridColsArrays[0]) || 6;
          const firstSelectAllMode = (selectAllModeArray && selectAllModeArray[0]) || false;
          const firstOriginalFilename = (originalFilenames && originalFilenames[0]) || "image.png";

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
                Array.from(firstSelectedCells),
                {
                  gridRows: firstGridRows,
                  gridCols: firstGridCols,
                  judgeModelId: judgeModelId || "gpt-4o",
                  selectAllMode: firstSelectAllMode,
                  originalFilename: firstOriginalFilename,
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
              Array.from(firstSelectedCells),
              {
                gridRows: firstGridRows,
                gridCols: firstGridCols,
                judgeModelId: judgeModelId || "gpt-4o",
                selectAllMode: firstSelectAllMode,
                originalFilename: firstOriginalFilename,
              }
            );
            run = getRun(actualRunId)!;
          }

          // Save all annotated images (with borders) to data/annotated using runId
          await Promise.all(
            annotatedImageBuffers.map((buffer, index) =>
              saveAnnotatedImage(
                buffer,
                (originalFilenames && originalFilenames[index]) || `image-${index}.png`,
                actualRunId,
                index
              )
            )
          );

          // Resize images before processing
          const originalImageBuffers = await Promise.all(
            annotatedImageBuffers.map((buffer) => resizeImageForAI(buffer))
          );

          // Update run with the actual image buffer (use first image for backward compatibility)
          run.originalImageBuffer = originalImageBuffers[0];

          // Generate LLM call ID (shared across all images from this invocation)
          const llmCallId = uuidv7();

          // Log request details
          const cellInfo = formatCellsForPrompt(firstSelectedCells);
          const imageCount = originalImageBuffers.length;
          console.log(
            `[Generate] LLM call ${llmCallId} for run ${actualRunId}: ${imageCount} image(s), ${cellInfo}, prompt: "${prompt.substring(0, 50)}..."`
          );

          // Generate modified images (returns array of IMAGES_PER_LLM_CALL images)
          // Always pass array to modifyImage (single image is just array with one element)
          const startTime = Date.now();
          const modifyResult = await modifyImage(originalImageBuffers, prompt, firstSelectAllMode);
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
              const modifiedFilename = await saveGeneratedImage(imageBuffer, firstOriginalFilename);

              // Extract token usage (split across all images from this call)
              const usage = modifyResult.usage
                ? {
                    // Divide by number of images since usage is shared across all images from one call
                    inputTokens: Math.round(modifyResult.usage.inputTokens / imageBuffers.length),
                    outputTokens: Math.round(modifyResult.usage.outputTokens / imageBuffers.length),
                    totalTokens: Math.round(modifyResult.usage.totalTokens / imageBuffers.length),
                  }
                : undefined;

              // Create image object (will be added to index below)
              const image = createImageFromFilename(modifiedFilename, "generated");

              // Add generation to storage
              addGeneration(
                actualRunId,
                generationId,
                imageBuffer,
                image.url,
                usage,
                durationMs,
                "completed",
                llmCallId,
                imageIndex
              );

              return {
                generationId,
                image,
                usage,
                imageIndex,
              };
            })
          );

          // Batch add all images to index at once (more efficient and prevents race conditions)
          // addImagesToIndex sets createdAt, so we can use that timestamp directly
          const now = new Date().toISOString();
          await addImagesToIndex(
            generations.map((gen) => ({
              filename: gen.image.filename,
              type: "generated" as const,
            }))
          );

          // Update image objects with createdAt (same timestamp used in addImagesToIndex)
          generations.forEach((gen) => {
            gen.image.createdAt = now;
          });

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
