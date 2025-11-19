import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { DEFAULT_GENERATION_MODEL_ID, IMAGES_PER_LLM_CALL } from "~/utils/generationConstants";

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

// Instructions for combining multiple images
const MULTI_IMAGE_INSTRUCTIONS = `You are provided with multiple images. Your task is to create ONE completely new image that combines elements from all provided images while incorporating the user's change request.

WORKFLOW:
1. Analyze all provided images to understand their content, style, and key elements
2. Use the FIRST image as the primary foundation/base for your new composition
3. Incorporate relevant elements, features, or inspiration from the other image(s) to enhance the composition
4. Apply the user's requested changes to create the final result
5. Ensure the output is a cohesive, unified new image (not a collage or side-by-side arrangement)

CRITICAL REQUIREMENTS:
- You MUST return ONLY ONE new image - do NOT return any of the input images
- Create a BRAND NEW image from scratch that synthesizes elements from all images
- The result should maintain visual consistency with lighting, shadows, textures, and color grading
- The output must be a completely new creation, not a copy or modification of any input image

NOTE ABOUT BLUE BORDERS: If you see blue borders on any images, they are annotations indicating regions of interest or areas the user wants to emphasize. They are NOT boundaries to modify within. Use them as visual guides to understand what elements are important, but create your new image freely without being constrained by these borders. The blue borders should NOT appear in your final output.`;

// Base instructions shared by both bordered and selectAll modes
const BASE_INSTRUCTIONS = `Modify the image according to the user's instructions.

When the user requests "removing" an item or object, interpret this as replacing it with inferred background that seamlessly blends with the surrounding area. 
Infer what the background should look like based on the context around the item and generate appropriate background content to fill the space.

Maintain the same image dimensions and overall style as the original image. 
Pay attention to lighting, shadows, textures, and color grading to ensure modifications blend naturally with the existing image.`;

// Variation instructions phrase (inserted when IMAGES_PER_LLM_CALL > 1)
const VARIATION_INSTRUCTIONS =
  IMAGES_PER_LLM_CALL > 1
    ? `Generate ${IMAGES_PER_LLM_CALL} different variations of the modified image, each with creative variations in how the modifications are applied.

When generating variations, ensure each one interprets the instructions with creative differences while still following them accurately. 
Each variation should be distinct from the others while maintaining the core requirements of the user's request.`
    : "";

// Border-specific instructions phrase (inserted when not in selectAllMode)
const BORDER_INSTRUCTIONS = `⚠️ ABSOLUTE REQUIREMENT - BLUE BORDER BOUNDARIES ⚠️

You are STRICTLY FORBIDDEN from modifying ANY pixels outside the blue-bordered regions. The blue borders are ABSOLUTE, NON-NEGOTIABLE boundaries that define the ONLY areas you may modify.

CRITICAL RULES - THESE ARE MANDATORY:
1. ONLY modify pixels that are INSIDE the blue-bordered cells - this is the ONLY area you can touch
2. DO NOT modify ANY content outside the blue borders - keep it EXACTLY as it appears in the original image, pixel-perfect
3. The blue borders define ABSOLUTE boundaries - you MUST respect them with 100% precision
4. If the user's instructions seem to require changes outside the borders, you MUST interpret them to apply ONLY within the bordered regions
5. MANDATORY: You MUST completely remove ALL blue borders from your final output image. The output image must have ZERO blue borders - they are visual guides only and must be completely absent from the final result
6. Keep EVERYTHING outside the blue borders completely unchanged - no modifications, no adjustments, no alterations whatsoever

WORKFLOW:
1. Identify all blue-bordered regions in the image
2. Apply the user's instructions ONLY to content within those blue-bordered regions
3. Leave ALL content outside the borders completely untouched - it must be identical to the original
4. Remove all blue borders from your output - the final image must have no blue borders at all

${IMAGES_PER_LLM_CALL > 1 ? "All variations must strictly respect the blue border boundaries and remove them completely. " : ""}Remember: The blue borders are your ONLY workspace. Everything outside them is OFF-LIMITS and must remain exactly as it was in the original image.`;

/**
 * Modifies an image based on the user's prompt.
 * When multiple images are provided, combines them into a new image incorporating the user's changes.
 * Returns the modified image buffer and token usage.
 */
export async function modifyImage(
  originalImageBuffers: Buffer[],
  prompt: string,
  selectAllMode: boolean = false
): Promise<ModifyImageResult> {
  // Always expect an array (single image is just array with one element)
  const isMultiImage = originalImageBuffers.length > 1;

  // Build system prompt by combining base instructions with conditional phrases
  const parts: string[] = [];

  // Add multi-image instructions first if combining images
  if (isMultiImage) {
    parts.push(MULTI_IMAGE_INSTRUCTIONS);
    // In multi-image mode, skip border instructions (borders are just annotations)
    // and use a modified base instruction that emphasizes creating new images
    parts.push(
      `When creating the new composite image, apply the user's instructions creatively. The result should be a fresh, original composition that feels natural and cohesive.`
    );
  } else {
    // Single image mode: use border instructions if not in selectAllMode
    if (!selectAllMode) {
      parts.push(BORDER_INSTRUCTIONS);
    }
    parts.push(BASE_INSTRUCTIONS);
  }

  if (VARIATION_INSTRUCTIONS) {
    parts.push(VARIATION_INSTRUCTIONS);
  }
  const systemPrompt = parts.join("\n\n");

  // Prepare model
  const model = google(DEFAULT_GENERATION_MODEL_ID);
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

  // Build user prompt content
  const userContent: any[] = [];

  // Add text prompt with multi-image instructions if needed
  let promptText = prompt;
  if (isMultiImage) {
    const imageCount = originalImageBuffers.length;
    promptText = `Create a new image by combining elements from the ${imageCount} provided images and applying this change: ${prompt}

The first image should serve as the primary foundation/base. Use elements from the other image(s) to enhance the composition. The result should be a single, cohesive new image that incorporates the requested changes.`;
  }

  if (IMAGES_PER_LLM_CALL > 1) {
    promptText += `\n\nPlease generate ${IMAGES_PER_LLM_CALL} different variations of this modification, each with creative variations in how the changes are applied.`;
  }

  userContent.push({
    type: "text",
    text: promptText,
  });

  // Add all images to the prompt with labels for multi-image mode
  originalImageBuffers.forEach((buffer, index) => {
    if (isMultiImage) {
      if (index === 0) {
        userContent.push({
          type: "text",
          text: `Image ${index + 1} (BASE - use as primary foundation):`,
        });
      } else {
        userContent.push({
          type: "text",
          text: `Image ${index + 1} (REFERENCE - incorporate elements from this):`,
        });
      }
    }
    userContent.push({
      type: "image",
      image: buffer,
      mediaType: "image/png",
    });
  });

  // Generate modified image
  // Request varied image attempts via prompt
  const startTime = Date.now();
  const result = await generateText({
    model,
    system: systemPrompt,
    prompt: [
      {
        role: "user",
        content: userContent,
      },
    ],
    providerOptions: {
      google: {
        responseModalities: ["IMAGE"],
      },
    },
  });
  console.log("[DEBUG] generateText result keys:", Object.keys(result));
  console.log(
    "[DEBUG] generateText files metadata:",
    result.files?.map((file) => ({
      mediaType: file.mediaType,
      hasUint8Array: !!file.uint8Array,
      byteLength: file.uint8Array?.length ?? 0,
    }))
  );
  console.log("[DEBUG] generateText usage:", result.usage);
  const durationMs = Date.now() - startTime;

  // Extract all images returned
  const allImageFiles = result.files?.filter((file) => file.mediaType.startsWith("image/")) || [];
  console.log(
    `[DEBUG] Requested ${IMAGES_PER_LLM_CALL} varied images via prompt, received ${allImageFiles.length} images`
  );

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
