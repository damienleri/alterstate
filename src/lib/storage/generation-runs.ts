import { uuidv7 } from "uuidv7";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface JudgeResult {
  score: number;
  selectedAreasChanged: number;
  selectedAreasCorrect: number;
  nothingElseChanged: number;
  blueBorderRemoved: boolean;
  reasoning: string;
  usage?: TokenUsage;
  durationMs?: number;
}

export interface GenerationData {
  generationId: string;
  imageBuffer: Buffer;
  imageUrl: string;
  status: "generating" | "completed" | "judging" | "judged";
  usage?: TokenUsage;
  judgeResult?: JudgeResult;
  imageGenerationDurationMs?: number;
  judgeDurationMs?: number;
  completedAt?: Date;
}

export interface GenerationRun {
  runId: string;
  originalImageBuffer: Buffer;
  prompt: string;
  selectedCells: string[];
  settings: {
    gridRows?: number;
    gridCols?: number;
    judgeModelId: string;
    selectAllMode: boolean;
    originalFilename: string;
  };
  generations: Map<string, GenerationData>;
  createdAt: Date;
}

// In-memory storage for active generation runs
const activeRuns = new Map<string, GenerationRun>();

// Cleanup runs older than 1 hour
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const RUN_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

function cleanupOldRuns() {
  const now = Date.now();
  for (const [runId, run] of activeRuns.entries()) {
    const age = now - run.createdAt.getTime();
    if (age > RUN_MAX_AGE_MS) {
      activeRuns.delete(runId);
      console.log(`[Storage] Cleaned up old run: ${runId}`);
    }
  }
}

// Run cleanup every hour
setInterval(cleanupOldRuns, CLEANUP_INTERVAL_MS);

export function createRun(
  originalImageBuffer: Buffer,
  prompt: string,
  selectedCells: string[],
  settings: GenerationRun["settings"],
  runId?: string
): string {
  const actualRunId = runId || uuidv7();
  
  // Check if run already exists (handles race conditions)
  if (activeRuns.has(actualRunId)) {
    console.log(`[Storage] Run already exists: ${actualRunId}`);
    return actualRunId;
  }
  
  const run: GenerationRun = {
    runId: actualRunId,
    originalImageBuffer,
    prompt,
    selectedCells,
    settings,
    generations: new Map(),
    createdAt: new Date(),
  };
  activeRuns.set(actualRunId, run);
  console.log(`[Storage] Created new run: ${actualRunId}`);
  return actualRunId;
}

export function getRun(runId: string): GenerationRun | undefined {
  return activeRuns.get(runId);
}

export function addGeneration(
  runId: string,
  generationId: string,
  imageBuffer: Buffer,
  imageUrl: string,
  usage?: TokenUsage,
  durationMs?: number,
  status: GenerationData["status"] = "completed"
): void {
  const run = activeRuns.get(runId);
  if (!run) {
    throw new Error(`Run not found: ${runId}`);
  }

  const generationData: GenerationData = {
    generationId,
    imageBuffer,
    imageUrl,
    status,
    usage,
    imageGenerationDurationMs: durationMs,
    completedAt: status === "completed" ? new Date() : undefined,
  };

  run.generations.set(generationId, generationData);
  console.log(`[Storage] Added generation ${generationId} to run ${runId} with status ${status}`);
}

export function updateGenerationStatus(
  runId: string,
  generationId: string,
  status: GenerationData["status"]
): void {
  const run = activeRuns.get(runId);
  if (!run) {
    throw new Error(`Run not found: ${runId}`);
  }

  const generation = run.generations.get(generationId);
  if (!generation) {
    throw new Error(`Generation not found: ${generationId}`);
  }

  generation.status = status;
}

export function addJudgeResult(
  runId: string,
  generationId: string,
  judgeResult: JudgeResult
): void {
  const run = activeRuns.get(runId);
  if (!run) {
    throw new Error(`Run not found: ${runId}`);
  }

  const generation = run.generations.get(generationId);
  if (!generation) {
    throw new Error(`Generation not found: ${generationId}`);
  }

  generation.judgeResult = judgeResult;
  generation.judgeDurationMs = judgeResult.durationMs;
  generation.status = "judged";
  console.log(`[Storage] Added judge result for generation ${generationId} in run ${runId}`);
}

export function deleteRun(runId: string): void {
  activeRuns.delete(runId);
  console.log(`[Storage] Deleted run: ${runId}`);
}

