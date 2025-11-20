import { useEffect, useState } from "react";
import { Edit, ChevronLeft, ChevronRight, Trash2, Star } from "lucide-react";
import type { Image } from "../utils/storage";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { Label } from "./ui/label";
import { Button } from "./ui/button";

interface ImageGalleryProps {
  onEditSelected?: (imageIds: string[]) => void;
  filter?: "all" | "uploaded" | "generated" | "favorites";
  onFilterChange?: (filter: "all" | "uploaded" | "generated" | "favorites") => void;
  refreshKey?: number; // Force refresh when this changes
}

export function ImageGallery({ onEditSelected, filter = "all", onFilterChange, refreshKey = 0 }: ImageGalleryProps) {
  const [images, setImages] = useState<Image[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMultipleMode, setSelectMultipleMode] = useState(false);
  const [imageSize, setImageSize] = useState<"small" | "medium" | "large">("small");
  const [currentPage, setCurrentPage] = useState(1);
  const [hoveredImageId, setHoveredImageId] = useState<string | null>(null);
  const itemsPerPage = 36; // Number of images per page

  useEffect(() => {
    loadImages();
  }, [refreshKey]);

  // Reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter]);

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
      const wasSelected = newSet.has(id);
      if (wasSelected) {
        newSet.delete(id);
      } else {
        if (newSet.size < 2) {
          newSet.add(id);
          // If this is the first image being selected and NOT in select multiple mode, automatically navigate to edit
          if (prev.size === 0 && newSet.size === 1 && onEditSelected && !selectMultipleMode) {
            // Use setTimeout to ensure state update completes before navigation
            setTimeout(() => {
              onEditSelected([id]);
            }, 0);
          }
        }
      }
      return newSet;
    });
  };

  const handleEdit = () => {
    if (selectedIds.size > 0 && onEditSelected) {
      onEditSelected(Array.from(selectedIds));
      // Reset selection mode after navigating
      setSelectMultipleMode(false);
      setSelectedIds(new Set());
    }
  };

  const handleSelectMultipleToggle = () => {
    setSelectMultipleMode((prev) => !prev);
    // Clear selection when toggling mode
    setSelectedIds(new Set());
  };

  // Apply filter (deleted images are already filtered by the API)
  const filteredImages =
    filter === "all"
      ? images
      : filter === "favorites"
        ? images.filter((img) => img.favoritedAt)
        : images.filter((img) => img.type === filter);

  // Calculate pagination
  const totalPages = Math.ceil(filteredImages.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedImages = filteredImages.slice(startIndex, endIndex);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    // Scroll to top of gallery when page changes
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeleteImage = async (e: React.MouseEvent, imageId: string) => {
    e.stopPropagation(); // Prevent triggering the image selection
    try {
      const response = await fetch("/api/update-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageId,
          deletedAt: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to delete image");
      }

      // Update local state - remove the image from the list
      setImages((prev) => prev.filter((img) => img.id !== imageId));
    } catch (error) {
      console.error("Failed to delete image:", error);
    }
  };

  const handleFavoriteImage = async (e: React.MouseEvent, image: Image) => {
    e.stopPropagation(); // Prevent triggering the image selection
    try {
      const newFavoritedAt = image.favoritedAt ? null : new Date().toISOString();
      const response = await fetch("/api/update-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageId: image.id,
          favoritedAt: newFavoritedAt,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to favorite image");
      }

      const data = await response.json();
      // Update local state
      setImages((prev) => prev.map((img) => (img.id === image.id ? data.image : img)));
    } catch (error) {
      console.error("Failed to favorite image:", error);
    }
  };

  if (loading) {
    return <div className="text-gray-600 dark:text-gray-400">Loading images...</div>;
  }

  if (images.length === 0) {
    return <div className="text-gray-500 dark:text-gray-400 text-sm">No images found</div>;
  }

  // Determine grid columns and image styling based on size
  const getGridCols = () => {
    switch (imageSize) {
      case "small":
        return "grid-cols-6";
      case "medium":
        return "grid-cols-3";
      case "large":
        return "grid-cols-2";
      default:
        return "grid-cols-3";
    }
  };

  const getImageClasses = () => {
    switch (imageSize) {
      case "small":
        return "w-full h-full object-cover";
      case "medium":
        return "w-full h-full object-cover";
      case "large":
        return "w-full h-auto max-h-96 object-contain";
      default:
        return "w-full h-full object-cover";
    }
  };

  const getContainerClasses = (isSelected: boolean, canSelect: boolean) => {
    const baseClasses = `relative overflow-hidden rounded-lg border-2 transition-colors ${
      isSelected
        ? "border-blue-500 ring-2 ring-blue-300 dark:ring-blue-700"
        : canSelect
          ? "border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500"
          : "border-gray-200 dark:border-gray-700 opacity-50 cursor-not-allowed"
    }`;

    if (imageSize === "large") {
      return `${baseClasses} w-full flex items-center justify-center bg-gray-50 dark:bg-gray-800`;
    }
    return `${baseClasses} aspect-square`;
  };

  return (
    <div className="space-y-4">
      {/* Filter UI and Size Toggle */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <ToggleGroup
          type="single"
          value={filter}
          onValueChange={(value) => {
            if (value) {
              onFilterChange?.(value as "all" | "uploaded" | "generated" | "favorites");
            }
          }}
          variant="outline"
          size="sm"
          spacing={0}
        >
          <ToggleGroupItem value="all" aria-label="All">
            All
          </ToggleGroupItem>
          <ToggleGroupItem value="uploaded" aria-label="Uploaded">
            Uploaded
          </ToggleGroupItem>
          <ToggleGroupItem value="generated" aria-label="Generated">
            Generated
          </ToggleGroupItem>
          <ToggleGroupItem value="favorites" aria-label="Favorites">
            Favorites
          </ToggleGroupItem>
        </ToggleGroup>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <Label className="text-sm text-gray-700 dark:text-gray-300">Size:</Label>
            <ToggleGroup
              type="single"
              value={imageSize}
              onValueChange={(value) => {
                if (value) {
                  setImageSize(value as "small" | "medium" | "large");
                }
              }}
              variant="outline"
              size="sm"
              spacing={0}
            >
              <ToggleGroupItem value="small" aria-label="Small">
                Small
              </ToggleGroupItem>
              <ToggleGroupItem value="medium" aria-label="Medium">
                Med
              </ToggleGroupItem>
              <ToggleGroupItem value="large" aria-label="Uncropped">
                Uncropped
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <button
            onClick={handleSelectMultipleToggle}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              selectMultipleMode
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            Select Multiple
          </button>
        </div>
      </div>

      {/* Helper message and Edit Button - shown when in select multiple mode */}
      {selectMultipleMode && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {selectedIds.size === 0
              ? "Select up to 2 images to edit"
              : selectedIds.size === 1
                ? "Select 1 more image (up to 2 total)"
                : "2 images selected"}
          </div>
          {selectedIds.size > 0 && (
            <button
              onClick={handleEdit}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <Edit className="w-4 h-4" />
              Edit {selectedIds.size} image{selectedIds.size > 1 ? "s" : ""}
            </button>
          )}
        </div>
      )}

      {/* Image Grid */}
      {filteredImages.length === 0 ? (
        <div className="text-gray-500 dark:text-gray-400 text-sm">
          No {filter === "all" ? "" : filter === "favorites" ? "favorite " : filter + " "}images found
        </div>
      ) : (
        <>
          <div className={`grid ${getGridCols()} gap-4`}>
            {paginatedImages.map((image) => {
              const isSelected = selectedIds.has(image.id);
              const canSelect = selectMultipleMode || selectedIds.size === 0;
              return (
                <div
                  key={image.id}
                  className="relative"
                  onMouseEnter={() => setHoveredImageId(image.id)}
                  onMouseLeave={() => setHoveredImageId(null)}
                >
                  <button
                    onClick={() => {
                      if (selectMultipleMode || selectedIds.size === 0) {
                        toggleSelection(image.id);
                      }
                    }}
                    className={getContainerClasses(isSelected, canSelect)}
                  >
                    <img src={image.url} alt={image.filename} className={getImageClasses()} />
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
                    {/* Hover Buttons */}
                    {hoveredImageId === image.id && (
                      <div className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center gap-3 rounded-lg">
                        <button
                          onClick={(e) => handleDeleteImage(e, image.id)}
                          className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={(e) => handleFavoriteImage(e, image)}
                          className={`p-2 rounded-full transition-colors ${
                            image.favoritedAt
                              ? "bg-yellow-500 hover:bg-yellow-600 text-white"
                              : "bg-gray-700 hover:bg-gray-600 text-white"
                          }`}
                          title={image.favoritedAt ? "Unfavorite" : "Favorite"}
                        >
                          <Star className={`w-5 h-5 ${image.favoritedAt ? "fill-current" : ""}`} />
                        </button>
                      </div>
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>

              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                  // Show first page, last page, current page, and pages around current
                  if (page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1)) {
                    return (
                      <Button
                        key={page}
                        variant={currentPage === page ? "default" : "outline"}
                        size="sm"
                        onClick={() => handlePageChange(page)}
                        className="min-w-10"
                      >
                        {page}
                      </Button>
                    );
                  } else if (page === currentPage - 2 || page === currentPage + 2) {
                    return (
                      <span key={page} className="px-2 text-gray-500 dark:text-gray-400">
                        ...
                      </span>
                    );
                  }
                  return null;
                })}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="flex items-center gap-1"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* Pagination Info */}
          {filteredImages.length > 0 && (
            <div className="text-center text-sm text-gray-600 dark:text-gray-400 mt-2">
              Showing {startIndex + 1}-{Math.min(endIndex, filteredImages.length)} of {filteredImages.length} images
            </div>
          )}
        </>
      )}
    </div>
  );
}
