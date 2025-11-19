import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { promises as fs } from "fs";
import { join } from "path";
import { getRun, updateGenerationStatus, addJudgeResult } from "~/lib/storage/generation-runs";
import { judgeImage } from "~/lib/ai/judge";
import { getJudgeModelConfig } from "~/lib/ai/judge/models";
import { resizeImageForJudge } from "~/utils/imageProcessing";

export const Route = createFileRoute("/api/judge-generation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const { runId, generationId } = body;

          if (!runId || !generationId) {
            return json({ error: "Missing runId or generationId" }, { status: 400 });
          }

          // Get the run
          const run = getRun(runId);
          if (!run) {
            return json({ error: "Run not found" }, { status: 404 });
          }

          // Validate API keys based on selected judge model
          const judgeModelId = run.settings.judgeModelId;
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
          } else {
            // Google models always need Google API key
            const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
            if (!googleApiKey) {
              return json(
                {
                  error: "GOOGLE_GENERATIVE_AI_API_KEY not configured. Please add it to .env file",
                },
                { status: 500 }
              );
            }
          }

          // Get the generation
          const generation = run.generations.get(generationId);
          if (!generation) {
            return json({ error: "Generation not found" }, { status: 404 });
          }

          if (generation.status !== "completed") {
            return json(
              { error: `Generation not ready for judging. Status: ${generation.status}` },
              { status: 400 }
            );
          }

          // Update status to judging
          updateGenerationStatus(runId, generationId, "judging");

          // Create thumbnails for judge evaluation
          const originalThumbnail = await resizeImageForJudge(run.originalImageBuffer);
          const modifiedThumbnail = await resizeImageForJudge(generation.imageBuffer);

          // Save thumbnails for debugging
          try {
            const thumbnailDir = join(process.cwd(), "data", "judge-thumbnails", runId, generationId);
            await fs.mkdir(thumbnailDir, { recursive: true });
            await fs.writeFile(join(thumbnailDir, "original.png"), originalThumbnail);
            await fs.writeFile(join(thumbnailDir, "modified.png"), modifiedThumbnail);
            console.log(`[DEBUG] Saved judge thumbnails to ${thumbnailDir}`);
          } catch (error) {
            console.warn("[DEBUG] Failed to save judge thumbnails:", error);
            // Non-blocking - continue even if save fails
          }

          // Judge the image using thumbnails
          const startTime = Date.now();
          const judgeResult = await judgeImage(
            originalThumbnail,
            modifiedThumbnail,
            run.prompt,
            run.settings.judgeModelId,
            run.settings.selectAllMode
          );
          const durationMs = Date.now() - startTime;

          // Add judge result
          const finalJudgeResult = {
            score: judgeResult.score,
            selectedAreasChanged: judgeResult.selectedAreasChanged,
            selectedAreasCorrect: judgeResult.selectedAreasCorrect,
            nothingElseChanged: judgeResult.nothingElseChanged,
            blueBorderRemoved: judgeResult.blueBorderRemoved,
            reasoning: judgeResult.reasoning,
            usage: judgeResult.usage
              ? {
                  inputTokens: judgeResult.usage.inputTokens,
                  outputTokens: judgeResult.usage.outputTokens,
                  totalTokens: judgeResult.usage.totalTokens,
                }
              : undefined,
            durationMs,
          };

          addJudgeResult(runId, generationId, finalJudgeResult);

          return json({
            success: true,
            runId,
            generationId,
            judgeResult: finalJudgeResult,
          });
        } catch (error) {
          console.error("Judge error:", error);
          return json(
            {
              error: error instanceof Error ? error.message : "Judge evaluation failed",
            },
            { status: 500 }
          );
        }
      },
    },
  },
});

