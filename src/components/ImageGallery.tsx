import { useEffect, useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs'

interface ImageGalleryProps {
  onImageSelected: (url: string, filename: string) => void
}

interface ImageItem {
  filename: string
  url: string
}

export function ImageGallery({ onImageSelected }: ImageGalleryProps) {
  const [generatedImages, setGeneratedImages] = useState<ImageItem[]>([])
  const [uploadedImages, setUploadedImages] = useState<ImageItem[]>([])
  const [loadingGenerated, setLoadingGenerated] = useState(true)
  const [loadingUploaded, setLoadingUploaded] = useState(true)

  useEffect(() => {
    loadGeneratedImages()
    loadUploadedImages()
  }, [])

  const loadGeneratedImages = async () => {
    try {
      const response = await fetch('/api/list-modified-images')
      const data = await response.json()
      setGeneratedImages(data.images || [])
    } catch (error) {
      console.error('Failed to load generated images:', error)
    } finally {
      setLoadingGenerated(false)
    }
  }

  const loadUploadedImages = async () => {
    try {
      const response = await fetch('/api/list-images')
      const data = await response.json()
      setUploadedImages(data.images || [])
    } catch (error) {
      console.error('Failed to load uploaded images:', error)
    } finally {
      setLoadingUploaded(false)
    }
  }

  const renderImageGrid = (images: ImageItem[]) => {
    if (images.length === 0) {
      return <div className="text-gray-500 text-sm">No images found</div>
    }

    return (
      <div className="grid grid-cols-3 gap-4">
        {images.map((image) => (
          <button
            key={image.filename}
            onClick={() => onImageSelected(image.url, image.filename)}
            className="relative aspect-square overflow-hidden rounded-lg border-2 border-gray-200 hover:border-blue-500 transition-colors"
          >
            <img
              src={image.url}
              alt={image.filename}
              className="w-full h-full object-cover"
            />
          </button>
        ))}
      </div>
    )
  }

  const hasAnyImages = generatedImages.length > 0 || uploadedImages.length > 0
  const isLoading = loadingGenerated && loadingUploaded

  if (isLoading) {
    return <div className="text-gray-600">Loading images...</div>
  }

  if (!hasAnyImages && !isLoading) {
    return null
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="generated" className="w-full">
        <TabsList>
          <TabsTrigger value="generated">Generated images</TabsTrigger>
          <TabsTrigger value="uploaded">Uploaded images</TabsTrigger>
        </TabsList>
        <TabsContent value="generated" className="mt-4">
          {loadingGenerated ? (
            <div className="text-gray-600">Loading generated images...</div>
          ) : (
            renderImageGrid(generatedImages)
          )}
        </TabsContent>
        <TabsContent value="uploaded" className="mt-4">
          {loadingUploaded ? (
            <div className="text-gray-600">Loading uploaded images...</div>
          ) : (
            renderImageGrid(uploadedImages)
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
