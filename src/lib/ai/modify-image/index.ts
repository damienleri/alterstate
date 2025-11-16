import { google } from "@ai-sdk/google";
import { generateText } from "ai";

// Cost per million tokens
export const COST_PER_MILLION_INPUT_TOKENS = 0.3; // $0.30 per million input tokens
export const COST_PER_MILLION_OUTPUT_TOKENS = 2.5; // $2.50 per million output tokens

export interface ModifyImageResult {
  imageBuffers: Buffer[]; // Changed to array to support multiple images
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  durationMs?: number;
}

/**
 * Modifies an image based on the user's prompt.
 * Returns the modified image buffer and token usage.
 */
export async function modifyImage(
  originalImageBuffer: Buffer,
  prompt: string,
  selectAllMode: boolean = false
): Promise<ModifyImageResult> {
  // Create system prompt
  const systemPrompt = selectAllMode
    ? `Modify the image according to the user's instructions. Generate 3 different variations of the modified image, each with creative variations in how the modifications are applied. Each variation should interpret the instructions slightly differently while still following them accurately.`
    : `CRITICAL: You must ONLY modify the content within the blue-bordered cells. The blue borders clearly indicate the exact regions you are allowed to modify. 

IMPORTANT RULES:
- ONLY modify pixels that are inside the blue-bordered cells
- DO NOT modify ANY content outside the blue borders - keep it exactly as it appears in the original
- The blue borders define strict boundaries - respect them precisely
- MANDATORY: You MUST completely remove ALL blue borders from your final output image. The output image must have NO blue borders whatsoever - they are only visual guides for you to identify the regions to modify, but they must be completely absent from the final result
- Keep the rest of the image completely unchanged
- Maintain the same image dimensions and overall style

CRITICAL: Generate 3 different variations of the modified image. Each variation should:
1. Follow the user's instructions accurately
2. Apply the modifications with creative variation (different approaches, styles, or interpretations)
3. All variations must respect the blue border boundaries and remove them completely
4. Each variation should be distinct from the others while still meeting the requirements

Follow the user's instructions, but ONLY apply them to the content within the blue-bordered regions. Everything outside the blue borders must remain untouched. Remember: the blue borders must be completely removed - your output should show no trace of them.`;

  // Prepare model
  const model = google("gemini-2.5-flash-image");
  console.log("[DEBUG] Model specificationVersion:", model.specificationVersion);
  console.log("[DEBUG] Model provider:", model.provider);
  console.log("[DEBUG] Model modelId:", model.modelId);

  // Workaround: Ensure specificationVersion is v3 (Nitro bundling issue)
  if (model.specificationVersion !== "v3") {
    Object.defineProperty(model, "specificationVersion", {
      value: "v3",
      writable: false,
      enumerable: true,
      configurable: true,
    });
    console.log("[DEBUG] Fixed specificationVersion to v3");
  }

  // Generate modified image
  // Request 3 varied image attempts via prompt
  const startTime = Date.now();
  const result = await generateText({
    model,
    system: systemPrompt,
    prompt: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `${prompt}\n\nPlease generate 3 different variations of this modification, each with creative variations in how the changes are applied.`,
          },
          {
            type: "image",
            image: originalImageBuffer,
            mediaType: "image/png",
          },
        ],
      },
    ],
  });
  const durationMs = Date.now() - startTime;

  // Extract all images returned
  const allImageFiles = result.files?.filter((file) => file.mediaType.startsWith("image/")) || [];
  console.log(`[DEBUG] Requested 3 varied images via prompt, received ${allImageFiles.length} images`);

  if (allImageFiles.length === 0) {
    throw new Error("No images were generated in the response");
  }

  // Convert all image files to buffers
  const imageBuffers = allImageFiles.map((file) => Buffer.from(file.uint8Array));

  // Extract token usage if available
  const usage = result.usage
    ? {
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
        totalTokens: result.usage.totalTokens ?? 0,
      }
    : undefined;

  return {
    imageBuffers,
    usage,
    durationMs,
  };
}
