import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/history")({
  component: History,
});

function History() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-bold text-gray-900">History</h1>
          <Link to="/" className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">
            Back to Home
          </Link>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-8 text-center">
          <p className="text-2xl text-gray-600">Coming soon</p>
        </div>
      </div>
    </div>
  );
}
