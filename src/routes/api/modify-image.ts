import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { saveModifiedImage } from "~/utils/storage";
import { formatCellsForPrompt } from "~/utils/imageProcessing";
import { promises as fs } from "fs";
import path from "path";

export const Route = createFileRoute("/api/modify-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const { imageDataUrl, selectedCells, prompt, originalFilename } = body;

          if (!imageDataUrl || !selectedCells || !prompt) {
            return json({ error: "Missing required fields" }, { status: 400 });
          }

          // Get API key from environment
          const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

          if (!apiKey) {
            return json(
              {
                error: "GOOGLE_GENERATIVE_AI_API_KEY not configured. Please add it to .env file",
              },
              { status: 500 }
            );
          }

          // Convert data URL to buffer
          const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
          const imageBuffer = Buffer.from(base64Data, "base64");

          // Save debug copy of image with borders
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const debugFilename = `debug-${timestamp}.png`;
          const debugPath = path.join(process.cwd(), "temp", debugFilename);
          await fs.writeFile(debugPath, imageBuffer);

          // Create system prompt with cell information
          const cellCount = selectedCells.length;
          const cellInfo = formatCellsForPrompt(selectedCells);

          // Log debug information
          console.log(`\n[DEBUG] Image modification request:`);
          console.log(`  - Image with borders: temp/${debugFilename}`);
          console.log(`  - Selected cells: ${JSON.stringify(selectedCells)}`);
          console.log(`  - ${cellInfo}`);
          console.log(`  - User prompt: "${prompt}"\n`);

          const systemPrompt = `You are helping to modify specific regions of an image.
The user has selected ${cellCount} cell(s) in a 6x6 grid overlay on the image.
${cellInfo}

These cells are marked with blue borders in the image.

Modify ONLY the content within the blue-bordered cells according to the user's instructions.
Keep the rest of the image unchanged.
Maintain the same image dimensions and overall style.`;

          // Call Gemini to modify the image using generateText with image attachment
          const model = google("gemini-2.5-flash-image-preview");
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
                    image: imageBuffer,
                    mediaType: "image/png",
                  },
                ],
              },
            ],
          });

          // Extract the modified image from result.files
          const imageFile = result.files?.find((file) => file.mediaType.startsWith("image/"));

          if (!imageFile) {
            throw new Error("No image was generated in the response");
          }

          // Convert the image data to buffer
          const modifiedBuffer = Buffer.from(imageFile.uint8Array);

          // Save the modified image
          const modifiedFilename = await saveModifiedImage(modifiedBuffer, originalFilename || "image.png");

          return json({
            success: true,
            imageUrl: `/api/images-modified/${modifiedFilename}`,
          });
        } catch (error) {
          console.error("Image modification error:", error);
          return json(
            {
              error: error instanceof Error ? error.message : "Image modification failed",
            },
            { status: 500 }
          );
        }
      },
    },
  },
});
