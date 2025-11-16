import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { getAllImages, getImageId } from "~/utils/storage";

export const Route = createFileRoute("/api/list-images")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const index = await getAllImages();

          const images = Object.entries(index).map(([id, metadata]) => ({
            id,
            filename: metadata.filename,
            url: `/api/images/${metadata.filename}`,
            type: metadata.type,
            createdAt: metadata.createdAt,
          }));

          // Sort by createdAt (newest first)
          images.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

          return json({
            images,
          });
        } catch (error) {
          console.error("List images error:", error);
          return json({ error: "Failed to list images" }, { status: 500 });
        }
      },
    },
  },
});
