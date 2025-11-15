import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { promises as fs } from "fs";
import path from "path";

const MODIFIED_DIR = path.join(process.cwd(), "uploads", "modified");

export const Route = createFileRoute("/api/list-modified-images")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const files = await fs.readdir(MODIFIED_DIR);
          const images = files.filter((f) => !f.startsWith("."));

          return json({
            images: images.map((filename) => ({
              filename,
              url: `/api/images-modified/${filename}`,
            })),
          });
        } catch (error) {
          console.error("List modified images error:", error);
          return json({ error: "Failed to list modified images" }, { status: 500 });
        }
      },
    },
  },
});
