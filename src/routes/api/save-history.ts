import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { promises as fs } from "fs";
import path from "path";

export const Route = createFileRoute("/api/save-history")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const data = await request.json();

          // Generate filename from timestamp
          const timestamp = data.timestamp || new Date().toISOString();
          const historyFilename = `run-${timestamp.replace(/[:.]/g, "-")}.json`;
          const historyPath = path.join(process.cwd(), "uploads", historyFilename);

          // Save to JSON file
          await fs.writeFile(historyPath, JSON.stringify(data, null, 2));

          return json({ success: true, filename: historyFilename });
        } catch (error) {
          console.error("Save history error:", error);
          return json(
            {
              error: error instanceof Error ? error.message : "Failed to save history",
            },
            { status: 500 }
          );
        }
      },
    },
  },
});
