import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { DEFAULT_GENERATION_MODEL_ID, IMAGES_PER_LLM_CALL, MODEL_SUMMARY } from "~/utils/constants";

const generationPricing = MODEL_SUMMARY[DEFAULT_GENERATION_MODEL_ID]?.pricing;

export const COST_PER_MILLION_INPUT_TOKENS = generationPricing?.inputPerMillionTokens;
export const COST_PER_MILLION_OUTPUT_TOKENS = generationPricing?.outputPerMillionTokens;

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
const MULTI_IMAGE_INSTRUCTIONS = `You are provided with multiple images. Create ONE completely new image that combines elements from all provided images while incorporating the user's change request.

REQUIREMENTS:
- Return ONLY ONE new image - do NOT return any input images
- Create a BRAND NEW image that synthesizes elements from all images
- Maintain visual consistency with lighting, shadows, textures, and color grading
- Output must be a cohesive, unified new image (not a collage or side-by-side arrangement)
- If you see blue borders, they are annotations indicating regions of interest - use them as visual guides, but create your new image freely. Blue borders should NOT appear in your final output.
- The first image in the prompt list is the base image, the following image(s) are reference images. Use the base image as the primary foundation and incorporate elements from the reference images.`;

// Base instructions shared by both bordered and selectAll modes
const BASE_INSTRUCTIONS = `Modify the image according to the user's instructions.

When the user requests "removing" an item or object, interpret this as replacing it with inferred background that seamlessly blends with the surrounding area. 
Infer what the background should look like based on the context around the item and generate appropriate background content to fill the space.

Pay attention to lighting, shadows, textures, and color grading to ensure modifications blend naturally with the existing image.`;

// Variation instructions phrase (inserted when IMAGES_PER_LLM_CALL > 1)
const VARIATION_INSTRUCTIONS =
  IMAGES_PER_LLM_CALL > 1
    ? `Generate ${IMAGES_PER_LLM_CALL} different variations of the modified image, each with creative variations in how the modifications are applied.

When generating variations, ensure each one interprets the instructions with creative differences while still following them accurately. 
Each variation should be distinct from the others while maintaining the core requirements of the user's request.`
    : "";

// Border-specific instructions phrase (inserted when not in selectAllMode)
const BORDER_INSTRUCTIONS = `

RULES FOR BLUE BORDERS:
- ONLY modify pixels INSIDE the blue-bordered cells - this is the ONLY area you can touch
- MANDATORY: Remove ALL blue borders from your final output - they are visual guides only and must be completely absent
- Keep EVERYTHING outside the blue borders completely unchanged - no modifications, adjustments, or alterations

${IMAGES_PER_LLM_CALL > 1 ? "All variations must strictly respect the blue border boundaries and remove them completely. " : ""}Remember: The blue borders are your ONLY workspace. Everything outside them is OFF-LIMITS.`;

// Coordinate point marker removal instructions (inserted when coordinate point markers are rendered visually)
const COORDINATE_POINT_INSTRUCTIONS = `

RULES FOR NUMBERED COORDINATE POINT MARKERS:
- You will see numbered circular markers (blue circles with white numbers) on the image
- These markers indicate reference points that the user may mention in their prompt (e.g., "draw a line from point 1 to point 2")
- MANDATORY: Remove ALL numbered coordinate point markers from your final output - they are visual guides only and must be completely absent
- The markers should be completely removed, leaving no trace of the blue circles or numbers

${IMAGES_PER_LLM_CALL > 1 ? "All variations must remove the coordinate point markers completely. " : ""}Remember: The numbered point markers are visual references only - they must be completely absent from your final output.`;

// Coordinate line marker removal instructions (inserted when coordinate line markers are rendered visually)
const COORDINATE_LINE_INSTRUCTIONS = `

RULES FOR NUMBERED COORDINATE LINE MARKERS:
- You will see numbered line markers (lines with numbers) on the image
- These markers indicate reference lines that the user may mention in their prompt (e.g., "modify along line 1")
- MANDATORY: Remove ALL numbered coordinate line markers from your final output - they are visual guides only and must be completely absent
- The line markers should be completely removed, leaving no trace of the lines or numbers

${IMAGES_PER_LLM_CALL > 1 ? "All variations must remove the coordinate line markers completely. " : ""}Remember: The numbered line markers are visual references only - they must be completely absent from your final output.`;

// Combined coordinate marker instructions (for when both points and lines are present)
const COORDINATE_MARKER_INSTRUCTIONS = `

RULES FOR NUMBERED COORDINATE MARKERS:
- You will see numbered coordinate markers on the image (both circular point markers and line markers)
- These markers indicate reference points and lines that the user may mention in their prompt (e.g., "draw a line from point 1 to point 2" or "modify along line 3")
- MANDATORY: Remove ALL numbered coordinate markers from your final output - they are visual guides only and must be completely absent
- All markers (both points and lines) should be completely removed, leaving no trace of the blue circles, lines, or numbers

${IMAGES_PER_LLM_CALL > 1 ? "All variations must remove all coordinate markers completely. " : ""}Remember: The numbered markers are visual references only - they must be completely absent from your final output.`;

/**
 * Modifies an image based on the user's prompt.
 * When multiple images are provided, combines them into a new image incorporating the user's changes.
 * Returns the modified image buffer and token usage.
 */
export async function modifyImage(
  originalImageBuffers: Buffer[],
  prompt: string,
  selectAllMode: boolean = false,
  hasCoordinateMarkers: boolean = false,
  annotationMode: "grid" | "coords" = "grid",
  hasCoordinatePoints: boolean = false,
  hasCoordinateLines: boolean = false
): Promise<ModifyImageResult> {
  // Always expect an array (single image is just array with one element)
  const isMultiImage = originalImageBuffers.length > 1;

  // Build system prompt by combining base instructions with conditional phrases
  const parts: string[] = [];

  // Add mode-specific instructions
  if (isMultiImage) {
    parts.push(MULTI_IMAGE_INSTRUCTIONS);
  } else {
    // Single image mode: adapt instructions based on annotation mode
    parts.push(BASE_INSTRUCTIONS);
    if (!selectAllMode) {
      if (annotationMode === "grid") {
        // Grid mode: use border instructions for blue-bordered cells
        parts.push(BORDER_INSTRUCTIONS);
      } else if (annotationMode === "coords") {
        // Coords mode: use appropriate coordinate marker instructions
        if (hasCoordinatePoints && hasCoordinateLines) {
          // Both points and lines present
          parts.push(COORDINATE_MARKER_INSTRUCTIONS);
        } else if (hasCoordinatePoints) {
          // Only points (dots)
          parts.push(COORDINATE_POINT_INSTRUCTIONS);
        } else if (hasCoordinateLines) {
          // Only lines
          parts.push(COORDINATE_LINE_INSTRUCTIONS);
        }
      }
    }
  }

  // Legacy support: if hasCoordinateMarkers is true but we haven't added instructions yet
  // (for backward compatibility with old callers)
  if (hasCoordinateMarkers && !parts.some((p) => p.includes("COORDINATE"))) {
    parts.push(COORDINATE_MARKER_INSTRUCTIONS);
  }

  // Add variation instructions if needed (only once)
  if (VARIATION_INSTRUCTIONS) {
    parts.push(VARIATION_INSTRUCTIONS);
  }

  // Add user's query to the system prompt
  parts.push(`USER REQUEST: ${prompt}`);

  const systemPrompt = parts.join("\n\n");

  // Log the final system prompt (without images) for debugging
  console.log("\n[SYSTEM PROMPT]");
  console.log("=".repeat(80));
  console.log(systemPrompt);
  console.log("=".repeat(80));
  console.log();

  // Prepare model
  const model = google(DEFAULT_GENERATION_MODEL_ID);

  // Workaround: Ensure specificationVersion is v3 (Nitro bundling issue)
  if (model.specificationVersion !== "v3") {
    Object.defineProperty(model, "specificationVersion", {
      value: "v3",
      writable: false,
      enumerable: true,
      configurable: true,
    });
  }

  // Build content array for images only (no text, since it's in system prompt)
  // Order: base image (index 0) first, then reference images (indices 1+)
  // This matches MULTI_IMAGE_INSTRUCTIONS: "The first image in the prompt list is the base image, the following image(s) are reference images"
  const imageContent = originalImageBuffers.map((buffer, index) => {
    if (isMultiImage) {
      const role = index === 0 ? "base" : "reference";
      console.log(`[IMAGE ORDER] Image ${index}: ${role} image`);
    }
    return {
      type: "image" as const,
      image: buffer,
      mediaType: "image/png" as const,
    };
  });

  // Generate modified image
  // Since we put the user query in the system prompt, we only pass images (no text in user message)
  const startTime = Date.now();
  const result = await generateText({
    model,
    system: systemPrompt,
    prompt: [
      {
        role: "user",
        content: imageContent,
      },
    ],
    providerOptions: {
      google: {
        responseModalities: ["IMAGE"],
      },
    },
  });
  const durationMs = Date.now() - startTime;

  // Extract all images returned
  const allImageFiles = result.files?.filter((file) => file.mediaType.startsWith("image/")) || [];

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
