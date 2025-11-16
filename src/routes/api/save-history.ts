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

          if (!data.runId) {
            return json({ error: "runId is required" }, { status: 400 });
          }

          const historyFilename = `run-${data.runId}.json`;
          const dataDir = path.join(process.cwd(), "data");
          
          // Ensure data directory exists
          await fs.mkdir(dataDir, { recursive: true });
          
          const historyPath = path.join(dataDir, historyFilename);

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
