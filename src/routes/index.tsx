import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ImageUpload } from "../components/ImageUpload";
import { ImageGallery } from "../components/ImageGallery";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | "uploaded" | "generated" | "favorites">("all");
  const [refreshKey, setRefreshKey] = useState(0);

  const handleImageUploaded = (_url: string, _filename: string) => {
    // Refresh the gallery by incrementing refreshKey
    setRefreshKey((prev) => prev + 1);
  };

  const handleEditSelected = (imageIds: string[]) => {
    // Navigate to edit route with selected image IDs
    navigate({
      to: "/edit",
      search: {
        images: imageIds,
      },
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="space-y-6">
          <ImageUpload onImageUploaded={handleImageUploaded} />
          <ImageGallery
            onEditSelected={handleEditSelected}
            filter={filter}
            onFilterChange={setFilter}
            refreshKey={refreshKey}
          />
        </div>
      </div>
    </div>
  );
}
