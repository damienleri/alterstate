import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'

interface ImageCanvasProps {
  imageUrl: string
  gridRows?: number
  gridCols?: number
  selectedCells: Set<string>
  onCellsSelected: (cells: Set<string>) => void
  showGrid: boolean
  selectAllMode?: boolean
}

export interface ImageCanvasRef {
  getImageWithBorders: (skipBorders?: boolean) => string | null
}

const ImageCanvasComponent = forwardRef<ImageCanvasRef, ImageCanvasProps>(
  ({ imageUrl, gridRows = 5, gridCols = 5, selectedCells, onCellsSelected, showGrid, selectAllMode = false }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [image, setImage] = useState<HTMLImageElement | null>(null)
    const [cellSize, setCellSize] = useState({ width: 0, height: 0 })

    useEffect(() => {
      const img = new Image()
      img.crossOrigin = 'anonymous' // Enable CORS for local images
      img.onload = () => {
        setImage(img)
        drawCanvas(img)
      }
      img.src = imageUrl
    }, [imageUrl])

    useEffect(() => {
      if (image) {
        drawCanvas(image)
      }
    }, [image, selectedCells, showGrid, gridRows, gridCols, selectAllMode])

    const drawCanvas = (img: HTMLImageElement) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Set canvas size to match image
      canvas.width = img.width
      canvas.height = img.height

      // Draw image
      ctx.drawImage(img, 0, 0)

      // Calculate cell size
      const cellW = img.width / gridCols
      const cellH = img.height / gridRows
      setCellSize({ width: cellW, height: cellH })

      if (showGrid) {
        // Draw grid
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
        ctx.lineWidth = 2

        // Draw vertical lines (columns)
        for (let i = 0; i <= gridCols; i++) {
          ctx.beginPath()
          ctx.moveTo(i * cellW, 0)
          ctx.lineTo(i * cellW, img.height)
          ctx.stroke()
        }

        // Draw horizontal lines (rows)
        for (let i = 0; i <= gridRows; i++) {
          ctx.beginPath()
          ctx.moveTo(0, i * cellH)
          ctx.lineTo(img.width, i * cellH)
          ctx.stroke()
        }

        // Highlight selected cells (skip if selectAllMode is enabled)
        if (!selectAllMode) {
          ctx.fillStyle = 'rgba(59, 130, 246, 0.3)'
          ctx.strokeStyle = 'rgb(59, 130, 246)'
          ctx.lineWidth = 3

          selectedCells.forEach((cellId) => {
            const [row, col] = cellId.split('-').map(Number)
            ctx.fillRect(col * cellW, row * cellH, cellW, cellH)
            ctx.strokeRect(col * cellW, row * cellH, cellW, cellH)
          })
        }
      }
    }

    // Expose method to get image with borders drawn
    useImperativeHandle(ref, () => ({
      getImageWithBorders: (skipBorders: boolean = false) => {
        if (typeof document === 'undefined') return null // SSR guard
        if (!image || !canvasRef.current) return null

        const tempCanvas = document.createElement('canvas')
        const tempCtx = tempCanvas.getContext('2d')
        if (!tempCtx) return null

        tempCanvas.width = image.width
        tempCanvas.height = image.height

        // Draw original image
        tempCtx.drawImage(image, 0, 0)

        // Draw borders around selected cells (skip if selectAllMode or skipBorders is true)
        if (!skipBorders && !selectAllMode) {
          const cellW = image.width / gridCols
          const cellH = image.height / gridRows

          tempCtx.strokeStyle = 'rgb(59, 130, 246)'
          tempCtx.lineWidth = Math.max(4, Math.min(image.width, image.height) * 0.01)

          selectedCells.forEach((cellId) => {
            const [row, col] = cellId.split('-').map(Number)
            tempCtx.strokeRect(col * cellW, row * cellH, cellW, cellH)
          })
        }

        return tempCanvas.toDataURL('image/png')
      },
    }))

    const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!showGrid || !image || selectAllMode) return // Disable cell clicking in select-all mode

      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height

      const x = (e.clientX - rect.left) * scaleX
      const y = (e.clientY - rect.top) * scaleY

      const col = Math.floor(x / cellSize.width)
      const row = Math.floor(y / cellSize.height)

      const cellId = `${row}-${col}`

      const newSelectedCells = new Set(selectedCells)
      if (newSelectedCells.has(cellId)) {
        newSelectedCells.delete(cellId)
      } else {
        newSelectedCells.add(cellId)
      }

      onCellsSelected(newSelectedCells)
    }

    return (
      <div className="relative inline-block">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="max-w-full h-auto border border-gray-300 rounded-lg cursor-crosshair"
        />
      </div>
    )
  }
)

ImageCanvasComponent.displayName = 'ImageCanvas'

export const ImageCanvas = ImageCanvasComponent
