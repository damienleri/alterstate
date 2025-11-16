import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { promises as fs } from "fs";
import path from "path";

export const Route = createFileRoute("/api/list-history")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const uploadsDir = path.join(process.cwd(), "uploads");
          
          // Read all files in uploads directory
          const files = await fs.readdir(uploadsDir);
          
          // Filter for JSON files that start with "run-"
          const historyFiles = files.filter((file) => file.startsWith("run-") && file.endsWith(".json"));
          
          // Read and parse each JSON file
          const historyData = await Promise.all(
            historyFiles.map(async (filename) => {
              try {
                const filePath = path.join(uploadsDir, filename);
                const fileContent = await fs.readFile(filePath, "utf-8");
                const data = JSON.parse(fileContent);
                
                // Get file stats for sorting
                const stats = await fs.stat(filePath);
                
                return {
                  filename,
                  timestamp: data.timestamp || stats.mtime.toISOString(),
                  data,
                };
              } catch (error) {
                console.error(`Error reading history file ${filename}:`, error);
                return null;
              }
            })
          );
          
          // Filter out nulls and sort by timestamp (newest first)
          const validHistory = historyData
            .filter((item): item is NonNullable<typeof item> => item !== null)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          
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

