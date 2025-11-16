import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { promises as fs } from "fs";
import path from "path";

export const Route = createFileRoute("/api/list-history")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const dataDir = path.join(process.cwd(), "data");
          
          // Ensure data directory exists
          await fs.mkdir(dataDir, { recursive: true });
          
          // Read all files in data directory
          const files = await fs.readdir(dataDir);
          
          // Filter for JSON files that start with "run-"
          const historyFiles = files.filter((file) => file.startsWith("run-") && file.endsWith(".json"));
          
          // Read and parse each JSON file
          const historyData = await Promise.all(
            historyFiles.map(async (filename) => {
              try {
                const filePath = path.join(dataDir, filename);
                const fileContent = await fs.readFile(filePath, "utf-8");
                const data = JSON.parse(fileContent);
                
                // Get file stats for sorting
                const stats = await fs.stat(filePath);
                
                return {
                  filename,
                  timestamp: data.timestamp || stats.mtime.toISOString(),
                  runId: data.runId,
                  data,
                };
              } catch (error) {
                console.error(`Error reading history file ${filename}:`, error);
                return null;
              }
            })
          );
          
          // Filter out nulls and sort by runId (uuidv7 is time-ordered, newest first)
          const validHistory = historyData
            .filter((item): item is NonNullable<typeof item> => item !== null && item.data.runId)
            .sort((a, b) => b.data.runId.localeCompare(a.data.runId));
          
          return json({
            history: validHistory,
          });
        } catch (error) {
          console.error("List history error:", error);
          return json({ error: "Failed to list history" }, { status: 500 });
        }
      },
    },
  },
});

