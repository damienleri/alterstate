import { google } from "@ai-sdk/google";
import { generateText } from "ai";

// Cost per million tokens
export const COST_PER_MILLION_INPUT_TOKENS = 0.3; // $0.30 per million input tokens
export const COST_PER_MILLION_OUTPUT_TOKENS = 2.5; // $2.50 per million output tokens

export interface ModifyImageResult {
  imageBuffer: Buffer;
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
    ? `Modify the image according to the user's instructions.`
    : `Modify ONLY the content within the blue-bordered cells according to the user's instructions. Remove all blue borders in your response. Keep the rest of the image unchanged. Maintain the same image dimensions and overall style.`;

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
            text: prompt,
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

  // Extract the modified image from result.files
  const imageFile = result.files?.find((file) => file.mediaType.startsWith("image/"));

  if (!imageFile) {
    throw new Error("No image was generated in the response");
  }

  // Convert the image data to buffer
  const modifiedBuffer = Buffer.from(imageFile.uint8Array);

  // Extract token usage if available
  const usage = result.usage
    ? {
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
        totalTokens: result.usage.totalTokens ?? 0,
      }
    : undefined;

  return {
    imageBuffer: modifiedBuffer,
    usage,
    durationMs,
  };
}
