import { Link } from "@tanstack/react-router";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "../hooks/useTheme";

export default function Header() {
  const { theme, toggleTheme, mounted } = useTheme();

  return (
    <header className="p-4 flex items-center justify-between bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <nav className="flex items-center gap-6">
        <Link
          to="/"
          className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          activeProps={{
            className: "text-sm text-gray-900 dark:text-gray-100 font-medium",
          }}
        >
          Gallery
        </Link>
        <Link
          to="/history"
          className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          activeProps={{
            className: "text-sm text-gray-900 dark:text-gray-100 font-medium",
          }}
        >
          History
        </Link>
      </nav>
      <button
        onClick={toggleTheme}
        className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
        aria-label="Toggle theme"
      >
        {mounted && theme === "light" ? (
          <Moon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
        ) : mounted && theme === "dark" ? (
          <Sun className="h-5 w-5 text-gray-600 dark:text-gray-400" />
        ) : (
          <Moon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
        )}
      </button>
    </header>
  );
}
