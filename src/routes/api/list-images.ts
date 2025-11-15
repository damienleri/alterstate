import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { listOriginalImages } from "~/utils/storage";

export const Route = createFileRoute("/api/list-images")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const images = await listOriginalImages();

          return json({
            images: images.map((filename) => ({
              filename,
              url: `/api/images/${filename}`,
            })),
          });
        } catch (error) {
          console.error("List images error:", error);
          return json({ error: "Failed to list images" }, { status: 500 });
        }
      },
    },
  },
});
