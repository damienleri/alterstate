import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { getRun, updateGenerationStatus, addJudgeResult } from "~/lib/storage/generation-runs";
import { judgeImage } from "~/lib/ai/judge";
import { getJudgeModelConfig } from "~/lib/ai/judge/models";

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

          // Judge the image
          const startTime = Date.now();
          const judgeResult = await judgeImage(
            run.originalImageBuffer,
            generation.imageBuffer,
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

