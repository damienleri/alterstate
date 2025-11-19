import { useEffect, useState } from "react";
import { Edit } from "lucide-react";
import type { Image } from "../utils/storage";

interface ImageGalleryProps {
  onEditSelected?: (imageIds: string[]) => void;
  filter?: "all" | "uploaded" | "generated";
  onFilterChange?: (filter: "all" | "uploaded" | "generated") => void;
  refreshKey?: number; // Force refresh when this changes
}

export function ImageGallery({ onEditSelected, filter = "all", onFilterChange, refreshKey = 0 }: ImageGalleryProps) {
  const [images, setImages] = useState<Image[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadImages();
  }, [refreshKey]);

  const loadImages = async () => {
    try {
      const response = await fetch("/api/list-images");
      const data = await response.json();
      setImages(data.images || []);
    } catch (error) {
      console.error("Failed to load images:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        if (newSet.size < 2) {
          newSet.add(id);
        }
      }
      return newSet;
    });
  };

  const handleEdit = () => {
    if (selectedIds.size > 0 && onEditSelected) {
      onEditSelected(Array.from(selectedIds));
    }
  };

  const filteredImages = filter === "all" ? images : images.filter((img) => img.type === filter);

  if (loading) {
    return <div className="text-gray-600 dark:text-gray-400">Loading images...</div>;
  }

  if (images.length === 0) {
    return <div className="text-gray-500 dark:text-gray-400 text-sm">No images found</div>;
  }

  return (
    <div className="space-y-4">
      {/* Filter UI */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onFilterChange?.("all")}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            filter === "all" ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          All
        </button>
        <button
          onClick={() => onFilterChange?.("uploaded")}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            filter === "uploaded" ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          Uploaded
        </button>
        <button
          onClick={() => onFilterChange?.("generated")}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            filter === "generated" ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          Generated
        </button>
      </div>

      {/* Edit Button */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-end">
          <button
            onClick={handleEdit}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Edit className="w-4 h-4" />
            Edit {selectedIds.size} image{selectedIds.size > 1 ? "s" : ""}
          </button>
        </div>
      )}

      {/* Image Grid */}
      {filteredImages.length === 0 ? (
        <div className="text-gray-500 dark:text-gray-400 text-sm">No {filter === "all" ? "" : filter} images found</div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {filteredImages.map((image) => {
            const isSelected = selectedIds.has(image.id);
            return (
              <button
                key={image.id}
                onClick={() => toggleSelection(image.id)}
                className={`relative aspect-square overflow-hidden rounded-lg border-2 transition-colors ${
                  isSelected ? "border-blue-500 ring-2 ring-blue-300 dark:ring-blue-700" : "border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500"
                }`}
              >
                <img src={image.url} alt={image.filename} className="w-full h-full object-cover" />
                {/* Type Badge */}
                <div className="absolute top-2 right-2">
                  <div
                    className={`px-2 py-0.5 text-xs font-semibold rounded ${
                      image.type === "uploaded" ? "bg-green-500 text-white" : "bg-purple-500 text-white"
                    }`}
                  >
                    {image.type === "uploaded" ? "U" : "G"}
                  </div>
                </div>
                {/* Selection Checkmark */}
                {isSelected && (
                  <div className="absolute top-2 left-2">
                    <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
