import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { promises as fs } from "fs";
import path from "path";

const GENERATED_DIR = path.join(process.cwd(), "data", "generated");

export const Route = createFileRoute("/api/list-modified-images")({
  server: {
    handlers: {
      GET: async () => {
        try {
          // Ensure directory exists
          await fs.mkdir(GENERATED_DIR, { recursive: true });
          
          const files = await fs.readdir(GENERATED_DIR);
          const images = files.filter((f) => !f.startsWith("."));

          // Get file stats and sort by modification time (newest first)
          const imagesWithStats = await Promise.all(
            images.map(async (filename) => {
              const filePath = path.join(GENERATED_DIR, filename);
              const stats = await fs.stat(filePath);
              return {
                filename,
                url: `/api/images-modified/${filename}`,
                mtime: stats.mtime.getTime(),
              };
            })
          );

          // Sort by modification time (newest first)
          imagesWithStats.sort((a, b) => b.mtime - a.mtime);

          return json({
            images: imagesWithStats.map(({ filename, url }) => ({
              filename,
              url,
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
