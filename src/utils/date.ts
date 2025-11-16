/**
 * Format a timestamp string to a localized date/time string
 * @param timestamp ISO timestamp string
 * @returns Formatted date string or original timestamp if parsing fails
 */
export function formatDate(timestamp: string): string {
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return timestamp;
  }
}

