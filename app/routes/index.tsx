import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef } from 'react'
import { ImageUpload } from '~/components/ImageUpload'
import { ImageCanvas, ImageCanvasRef } from '~/components/ImageCanvas'
import { PromptInput } from '~/components/PromptInput'
import { ImageGallery } from '~/components/ImageGallery'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const canvasRef = useRef<ImageCanvasRef>(null)
  const [currentImage, setCurrentImage] = useState<{
    url: string
    filename: string
  } | null>(null)
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set())
  const [showGrid, setShowGrid] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [modifiedImage, setModifiedImage] = useState<string | null>(null)

  const handleImageSelected = (url: string, filename: string) => {
    setCurrentImage({ url, filename })
    setSelectedCells(new Set())
    setShowGrid(true)
    setModifiedImage(null)
  }

  const handlePromptSubmit = async (prompt: string) => {
    if (!currentImage || selectedCells.size === 0) {
      alert('Please select at least one cell to modify')
      return
    }

    // Get image with borders drawn
    const imageDataUrl = canvasRef.current?.getImageWithBorders()
    if (!imageDataUrl) {
      alert('Failed to prepare image')
      return
    }

    setProcessing(true)

    try {
      const response = await fetch('/api/modify-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageDataUrl,
          selectedCells: Array.from(selectedCells),
          prompt,
          originalFilename: currentImage.filename,
        }),
      })

      const data = await response.json()

      if (data.success) {
        setModifiedImage(data.imageUrl)
        setShowGrid(false)
      } else {
        alert('Modification failed: ' + data.error)
      }
    } catch (error) {
      console.error('Modification error:', error)
      alert('Modification failed')
    } finally {
      setProcessing(false)
    }
  }

  const handleToggleGrid = () => {
    setShowGrid(!showGrid)
    if (!showGrid) {
      // When turning grid back on, use the modified image if available
      if (modifiedImage) {
        setCurrentImage({ url: modifiedImage, filename: currentImage?.filename || '' })
        setModifiedImage(null)
      }
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">
          AlterState
        </h1>
        <p className="text-gray-600 mb-8">
          Iterative image modification with AI
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Image Display */}
          <div className="lg:col-span-2 space-y-4">
            {!currentImage ? (
              <div className="space-y-6">
                <ImageUpload onImageUploaded={handleImageSelected} />
                <ImageGallery onImageSelected={handleImageSelected} />
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">
                    {modifiedImage ? 'Modified Image' : 'Original Image'}
                  </h2>
                  <div className="space-x-2">
                    {modifiedImage && (
                      <button
                        onClick={handleToggleGrid}
                        className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                      >
                        {showGrid ? 'Hide Grid' : 'Continue Editing'}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setCurrentImage(null)
                        setSelectedCells(new Set())
                        setShowGrid(false)
                        setModifiedImage(null)
                      }}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                    >
                      New Image
                    </button>
                  </div>
                </div>
                <ImageCanvas
                  ref={canvasRef}
                  imageUrl={modifiedImage || currentImage.url}
                  selectedCells={selectedCells}
                  onCellsSelected={setSelectedCells}
                  showGrid={showGrid}
                />
                {selectedCells.size > 0 && showGrid && (
                  <p className="text-sm text-gray-600">
                    {selectedCells.size} cell{selectedCells.size !== 1 ? 's' : ''}{' '}
                    selected
                  </p>
                )}
              </>
            )}
          </div>

          {/* Right Column - Controls */}
          {currentImage && showGrid && (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-lg shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Modify Selected Cells
                </h3>
                <PromptInput
                  onSubmit={handlePromptSubmit}
                  disabled={processing || selectedCells.size === 0}
                />
              </div>

              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">
                  How it works:
                </h4>
                <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                  <li>Click cells on the grid to select them</li>
                  <li>Enter instructions for modifications</li>
                  <li>Submit to generate modified image</li>
                  <li>Toggle grid to continue editing</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
