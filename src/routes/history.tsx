import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";

interface HistoryRun {
  filename: string;
  timestamp: string;
  data: {
    success: boolean;
    attempts: Array<{
      imageUrl: string;
      judgeScore: number;
      judgeReasoning: string;
      attemptNumber: number;
      usage: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
      } | null;
      judgeUsage?: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
      } | null;
      imageGenerationDurationMs?: number;
      judgeDurationMs?: number;
    }>;
    totalUsage: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    };
    imageGenerationUsage?: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    };
    judgeUsage?: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    };
    selectedCells: string[];
    prompt: string;
    originalFilename: string;
    maxAttempts: number;
    scoreThreshold: number;
    timestamp: string;
  };
}

// Cost per million tokens (same as in index.tsx)
const COST_PER_MILLION_INPUT_TOKENS = 0.3;
const COST_PER_MILLION_OUTPUT_TOKENS = 2.5;

function calculateCost(usage: { inputTokens: number; outputTokens: number; totalTokens: number } | null) {
  if (!usage) {
    return null;
  }
  return {
    inputCost: (usage.inputTokens / 1_000_000) * COST_PER_MILLION_INPUT_TOKENS,
    outputCost: (usage.outputTokens / 1_000_000) * COST_PER_MILLION_OUTPUT_TOKENS,
    totalCost:
      (usage.inputTokens / 1_000_000) * COST_PER_MILLION_INPUT_TOKENS +
      (usage.outputTokens / 1_000_000) * COST_PER_MILLION_OUTPUT_TOKENS,
  };
}

// Helper function to format duration in milliseconds to a readable string (e.g., "1.2s")
function formatDuration(durationMs: number | undefined): string | null {
  if (durationMs === undefined || durationMs === null) {
    return null;
  }
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
}

export const Route = createFileRoute("/history")({
  component: History,
});

function History() {
  const [history, setHistory] = useState<HistoryRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function fetchHistory() {
      try {
        const response = await fetch("/api/list-history");
        const data = await response.json();
        
        if (data.error) {
          setError(data.error);
        } else {
          setHistory(data.history || []);
        }
      } catch (err) {
        console.error("Failed to fetch history:", err);
        setError("Failed to load history");
      } finally {
        setLoading(false);
      }
    }
    
    fetchHistory();
  }, []);

  const formatDate = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return timestamp;
    }
  };

  const getBestScore = (run: HistoryRun) => {
    if (run.data.attempts.length === 0) return null;
    return Math.max(...run.data.attempts.map((a) => a.judgeScore));
  };

  const getTotalCost = (run: HistoryRun) => {
    return calculateCost(run.data.totalUsage);
  };

  // Calculate totals across all runs
  const totals = history.reduce(
    (acc, run) => {
      const usage = run.data.totalUsage;
      acc.totalInputTokens += usage.inputTokens;
      acc.totalOutputTokens += usage.outputTokens;
      acc.totalTokens += usage.totalTokens;
      return acc;
    },
    { totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0 }
  );

  const totalCost = calculateCost({
    inputTokens: totals.totalInputTokens,
    outputTokens: totals.totalOutputTokens,
    totalTokens: totals.totalTokens,
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold text-gray-900 mb-8">History</h1>
          <p className="text-gray-600">Loading history...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold text-gray-900 mb-8">History</h1>
          <p className="text-red-600">Error: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-bold text-gray-900">History</h1>
          <Link
            to="/"
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Back to Home
          </Link>
        </div>

        {history.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Total Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Total Tokens</p>
                <p className="text-2xl font-bold text-gray-900">{totals.totalTokens.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Input Tokens</p>
                <p className="text-2xl font-bold text-gray-900">{totals.totalInputTokens.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Output Tokens</p>
                <p className="text-2xl font-bold text-gray-900">{totals.totalOutputTokens.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Total Cost</p>
                <p className="text-2xl font-bold text-gray-900">
                  {totalCost ? `$${totalCost.totalCost.toFixed(4)}` : "-"}
                </p>
              </div>
            </div>
            {totalCost && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Input Cost</p>
                    <p className="text-gray-900 font-medium">${totalCost.inputCost.toFixed(6)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Output Cost</p>
                    <p className="text-gray-900 font-medium">${totalCost.outputCost.toFixed(6)}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {history.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <p className="text-gray-600">No history found. Run some image modifications to see them here.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Timestamp
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Prompt
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Attempts
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Best Score
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Tokens
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Cost
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {history.map((run) => {
                    const bestScore = getBestScore(run);
                    const cost = getTotalCost(run);
                    
                    return (
                      <tr key={run.filename} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatDate(run.timestamp)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 max-w-md">
                          <div className="truncate" title={run.data.prompt}>
                            {run.data.prompt}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {run.data.attempts.length} / {run.data.maxAttempts}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {bestScore !== null ? (
                            <span className={`font-semibold ${
                              bestScore >= run.data.scoreThreshold
                                ? "text-green-600"
                                : "text-yellow-600"
                            }`}>
                              {bestScore}/10
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {run.data.totalUsage.totalTokens.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {cost ? `$${cost.totalCost.toFixed(6)}` : "-"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={() => {
                              setExpandedRuns((prev) => {
                                const next = new Set(prev);
                                if (next.has(run.filename)) {
                                  next.delete(run.filename);
                                } else {
                                  next.add(run.filename);
                                }
                                return next;
                              });
                            }}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            {expandedRuns.has(run.filename) ? "Hide Details" : "View Details"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Detailed view for each run */}
        {history.map((run) => {
          if (!expandedRuns.has(run.filename)) {
            return null;
          }
          
          const cost = getTotalCost(run);
          
          return (
            <div
              key={`details-${run.filename}`}
              className="mt-4 bg-white rounded-lg shadow-sm p-6"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Run Details</h3>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <p className="text-sm font-medium text-gray-500">Original Filename</p>
                  <p className="text-sm text-gray-900">{run.data.originalFilename}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Selected Cells</p>
                  <p className="text-sm text-gray-900">{run.data.selectedCells.length} cells</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Score Threshold</p>
                  <p className="text-sm text-gray-900">{run.data.scoreThreshold}/10</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Max Attempts</p>
                  <p className="text-sm text-gray-900">{run.data.maxAttempts}</p>
                </div>
              </div>

              <div className="mb-6">
                <p className="text-sm font-medium text-gray-500 mb-2">Full Prompt</p>
                <p className="text-sm text-gray-900 bg-gray-50 p-3 rounded">{run.data.prompt}</p>
              </div>

              <div className="mb-6">
                <p className="text-sm font-medium text-gray-500 mb-3">Token Usage</p>
                
                {/* Total Usage */}
                <div className="mb-4">
                  <p className="text-xs font-semibold text-gray-700 mb-2">Total</p>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">Input Tokens</p>
                      <p className="text-gray-900 font-medium">{run.data.totalUsage.inputTokens.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Output Tokens</p>
                      <p className="text-gray-900 font-medium">{run.data.totalUsage.outputTokens.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Total Tokens</p>
                      <p className="text-gray-900 font-medium">{run.data.totalUsage.totalTokens.toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                {/* Image Generation Usage */}
                {run.data.imageGenerationUsage && (
                  <div className="mb-4 pt-3 border-t border-gray-200">
                    <p className="text-xs font-semibold text-gray-700 mb-2">Image Generation</p>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">Input Tokens</p>
                        <p className="text-gray-900 font-medium">{run.data.imageGenerationUsage.inputTokens.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Output Tokens</p>
                        <p className="text-gray-900 font-medium">{run.data.imageGenerationUsage.outputTokens.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Total Tokens</p>
                        <p className="text-gray-900 font-medium">{run.data.imageGenerationUsage.totalTokens.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Judge Usage */}
                {run.data.judgeUsage && (
                  <div className="mb-4 pt-3 border-t border-gray-200">
                    <p className="text-xs font-semibold text-gray-700 mb-2">Judge</p>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">Input Tokens</p>
                        <p className="text-gray-900 font-medium">{run.data.judgeUsage.inputTokens.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Output Tokens</p>
                        <p className="text-gray-900 font-medium">{run.data.judgeUsage.outputTokens.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Total Tokens</p>
                        <p className="text-gray-900 font-medium">{run.data.judgeUsage.totalTokens.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {cost && (
                <div className="mb-6">
                  <p className="text-sm font-medium text-gray-500 mb-3">Cost Breakdown</p>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">Input Cost</p>
                      <p className="text-gray-900 font-medium">${cost.inputCost.toFixed(6)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Output Cost</p>
                      <p className="text-gray-900 font-medium">${cost.outputCost.toFixed(6)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Total Cost</p>
                      <p className="text-gray-900 font-semibold">${cost.totalCost.toFixed(6)}</p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <p className="text-sm font-medium text-gray-500 mb-3">All Attempts</p>
                <div className="space-y-3">
                  {run.data.attempts.map((attempt) => {
                    const attemptCost = calculateCost(attempt.usage);
                    
                    return (
                      <div
                        key={attempt.attemptNumber}
                        className="border border-gray-200 rounded-lg p-4"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-900">
                              Attempt {attempt.attemptNumber}
                            </span>
                            <span className={`text-sm font-semibold ${
                              attempt.judgeScore >= run.data.scoreThreshold
                                ? "text-green-600"
                                : "text-yellow-600"
                            }`}>
                              Score: {attempt.judgeScore}/10
                            </span>
                            {attempt.imageGenerationDurationMs !== undefined && (
                              <span className="text-xs text-gray-500">
                                Image: {formatDuration(attempt.imageGenerationDurationMs) || "—"}
                              </span>
                            )}
                            {attempt.judgeDurationMs !== undefined && (
                              <span className="text-xs text-gray-500">
                                Judge: {formatDuration(attempt.judgeDurationMs) || "—"}
                              </span>
                            )}
                          </div>
                          {attemptCost && (
                            <span className="text-sm text-gray-600">
                              Cost: ${attemptCost.totalCost.toFixed(6)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{attempt.judgeReasoning}</p>
                        <div className="flex items-center gap-4">
                          <img
                            src={attempt.imageUrl}
                            alt={`Attempt ${attempt.attemptNumber}`}
                            className="w-32 h-32 object-cover rounded border border-gray-200"
                          />
                          <div className="text-xs text-gray-500 space-y-1">
                            {attempt.usage && (
                              <div>
                                <p className="font-medium text-gray-700">Image Generation:</p>
                                <p>Tokens: {attempt.usage.totalTokens.toLocaleString()}</p>
                                <p>Input: {attempt.usage.inputTokens.toLocaleString()}</p>
                                <p>Output: {attempt.usage.outputTokens.toLocaleString()}</p>
                                {attempt.imageGenerationDurationMs !== undefined && (
                                  <p>Duration: {formatDuration(attempt.imageGenerationDurationMs) || "—"}</p>
                                )}
                              </div>
                            )}
                            {attempt.judgeUsage && (
                              <div className="mt-2">
                                <p className="font-medium text-gray-700">Judge:</p>
                                <p>Tokens: {attempt.judgeUsage.totalTokens.toLocaleString()}</p>
                                <p>Input: {attempt.judgeUsage.inputTokens.toLocaleString()}</p>
                                <p>Output: {attempt.judgeUsage.outputTokens.toLocaleString()}</p>
                                {attempt.judgeDurationMs !== undefined && (
                                  <p>Duration: {formatDuration(attempt.judgeDurationMs) || "—"}</p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

