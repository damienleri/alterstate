import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { updateImageMetadata } from "~/utils/storage";

export const Route = createFileRoute("/api/update-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const { imageId, deletedAt, favoritedAt } = body;

          if (!imageId) {
            return json({ error: "Missing imageId" }, { status: 400 });
          }

          // Build updates object - only include fields that are explicitly provided
          const updates: { deletedAt?: string | null; favoritedAt?: string | null } = {};
          if (deletedAt !== undefined) {
            updates.deletedAt = deletedAt;
          }
          if (favoritedAt !== undefined) {
            updates.favoritedAt = favoritedAt;
          }

          if (Object.keys(updates).length === 0) {
            return json({ error: "No updates provided" }, { status: 400 });
          }

          const updatedImage = await updateImageMetadata(imageId, updates);

          if (!updatedImage) {
            return json({ error: "Image not found" }, { status: 404 });
          }

          return json({
            success: true,
            image: updatedImage,
          });
        } catch (error) {
          console.error("Update image error:", error);
          return json({ error: "Failed to update image" }, { status: 500 });
        }
      },
    },
  },
});

