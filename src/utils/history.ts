/**
 * Fetch history entries for a specific image
 * @param filename The filename of the image to fetch history for
 * @returns Promise resolving to history data or null if error
 */
export async function fetchHistoryForImage(
  filename: string
): Promise<Array<{
  filename: string;
  timestamp: string;
  data: {
    selectedCells: string[];
    prompt: string;
    originalFilename: string;
    maxAttempts: number;
    gridRows?: number;
    gridCols?: number;
    judgeModelId?: string;
    attempts: Array<{
      imageUrl: string;
      judgeScore: number;
      judgeReasoning: string;
      attemptNumber: number;
    }>;
  };
}> | null> {
  try {
    const response = await fetch(`/api/get-history-for-image?filename=${encodeURIComponent(filename)}`);
    const data = await response.json();
    if (data.history) {
      return data.history;
    }
    return null;
  } catch (error) {
    console.error("Failed to fetch history:", error);
    return null;
  }
}

