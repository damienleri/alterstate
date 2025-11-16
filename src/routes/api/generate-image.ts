import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { randomUUID } from "crypto";
import { resizeImageForAI } from "~/utils/imageProcessing";
import { modifyImage } from "~/lib/ai/modify-image";
import { saveModifiedImage } from "~/utils/storage";
import {
  createRun,
  addGeneration,
  getRun,
  type GenerationRun,
} from "~/lib/storage/generation-runs";

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

          // Convert data URL to buffer
          const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
          const rawImageBuffer = Buffer.from(base64Data, "base64");

          // Resize image before processing
          const originalImageBuffer = await resizeImageForAI(rawImageBuffer);

          // Get or create run
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
                originalImageBuffer,
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
            // Create new run (backward compatibility)
            actualRunId = createRun(
              originalImageBuffer,
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

          // Generate unique generation ID
          const generationId = randomUUID();

          // Generate modified image
          const startTime = Date.now();
          const modifyResult = await modifyImage(originalImageBuffer, prompt, selectAllMode);
          const durationMs = Date.now() - startTime;

          // Save the modified image
          const modifiedFilename = await saveModifiedImage(
            modifyResult.imageBuffer,
            originalFilename || "image.png"
          );

          const imageUrl = `/api/images-modified/${modifiedFilename}`;

          // Extract token usage
          const usage = modifyResult.usage
            ? {
                inputTokens: modifyResult.usage.inputTokens,
                outputTokens: modifyResult.usage.outputTokens,
                totalTokens: modifyResult.usage.totalTokens,
              }
            : undefined;

          // Update generation with results
          addGeneration(
            actualRunId,
            generationId,
            modifyResult.imageBuffer,
            imageUrl,
            usage,
            durationMs
          );

          return json({
            success: true,
            runId: actualRunId,
            generationId,
            imageUrl,
            usage,
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

