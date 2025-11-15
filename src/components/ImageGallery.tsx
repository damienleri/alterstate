import { useEffect, useState } from 'react'

interface ImageGalleryProps {
  onImageSelected: (url: string, filename: string) => void
}

interface ImageItem {
  filename: string
  url: string
}

export function ImageGallery({ onImageSelected }: ImageGalleryProps) {
  const [images, setImages] = useState<ImageItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadImages()
  }, [])

  const loadImages = async () => {
    try {
      const response = await fetch('/api/list-images')
      const data = await response.json()
      setImages(data.images || [])
    } catch (error) {
      console.error('Failed to load images:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="text-gray-600">Loading images...</div>
  }

  if (images.length === 0) {
    return null
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">
        Previous Uploads
      </h3>
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
    </div>
  )
}
