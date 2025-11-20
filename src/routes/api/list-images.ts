import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { getAllImagesAsObjects } from "~/utils/storage";

export const Route = createFileRoute("/api/list-images")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const images = await getAllImagesAsObjects();

          // Filter out deleted images
          const activeImages = images.filter((img) => !img.deletedAt);

          // Sort by createdAt (newest first)
          activeImages.sort((a, b) => {
            const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return bTime - aTime;
          });

          return json({
            images: activeImages,
          });
        } catch (error) {
          console.error("List images error:", error);
          return json({ error: "Failed to list images" }, { status: 500 });
        }
      },
    },
  },
});
