import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { promises as fs } from "fs";
import path from "path";

export const Route = createFileRoute("/api/get-history-for-image")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const filename = url.searchParams.get("filename");
          
          if (!filename) {
            return json({ error: "Filename parameter is required" }, { status: 400 });
          }

          const dataDir = path.join(process.cwd(), "data");
          
          // Ensure data directory exists
          await fs.mkdir(dataDir, { recursive: true });
          
          // Read all files in data directory
          const files = await fs.readdir(dataDir);
          
          // Filter for JSON files that start with "run-"
          const historyFiles = files.filter((file) => file.startsWith("run-") && file.endsWith(".json"));
          
          // Read and parse each JSON file
          const matchingHistory: Array<{
            filename: string;
            timestamp: string;
            data: any;
          }> = [];

          for (const historyFile of historyFiles) {
            try {
              const filePath = path.join(dataDir, historyFile);
              const fileContent = await fs.readFile(filePath, "utf-8");
              const data = JSON.parse(fileContent);
              
              // Check if this history entry matches the image:
              // 1. Check if originalFilename matches
              // 2. Check if any attempt's imageUrl contains the filename
              const matchesOriginal = data.originalFilename === filename;
              const matchesAttempt = data.attempts?.some((attempt: any) => {
                // Extract filename from imageUrl like "/api/images-modified/filename.png"
                const urlFilename = attempt.imageUrl?.split("/").pop();
                return urlFilename === filename;
              });

              if ((matchesOriginal || matchesAttempt) && data.runId) {
                const stats = await fs.stat(filePath);
                matchingHistory.push({
                  filename: historyFile,
                  timestamp: data.timestamp || stats.mtime.toISOString(),
                  runId: data.runId,
                  data,
                });
              }
            } catch (error) {
              console.error(`Error reading history file ${historyFile}:`, error);
              // Continue to next file
            }
          }
          
          // Sort by runId (uuidv7 is time-ordered, newest first)
          matchingHistory.sort((a, b) => b.runId.localeCompare(a.runId));
          
          return json({
            history: matchingHistory,
          });
        } catch (error) {
          console.error("Get history for image error:", error);
          return json({ error: "Failed to get history for image" }, { status: 500 });
        }
      },
    },
  },
});

