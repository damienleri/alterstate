import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ImageUpload } from "../components/ImageUpload";
import { ImageGallery } from "../components/ImageGallery";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | "uploaded" | "generated">("all");
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
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-start mb-6">
          <Tabs defaultValue="gallery" className="w-full">
            <TabsList className="h-8">
              <TabsTrigger value="gallery" className="text-xs px-3 py-1">
                Gallery
              </TabsTrigger>
              <TabsTrigger value="history" className="text-xs px-3 py-1" onClick={() => navigate({ to: "/history" })}>
                History
              </TabsTrigger>
              <TabsTrigger value="redesign" className="text-xs px-3 py-1" onClick={() => navigate({ to: "/redesign" })}>
                Redesign (3D)
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

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
