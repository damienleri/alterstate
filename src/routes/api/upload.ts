import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { saveUploadedImage, getImageId, getImageById } from '~/utils/storage'
import { resizeImageForAI } from '~/utils/imageProcessing'

export const Route = createFileRoute('/api/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const formData = await request.formData()
          const file = formData.get('file') as File

          if (!file) {
            return json({ error: 'No file provided' }, { status: 400 })
          }

          // Resize image before saving to reduce token usage
          const fileBuffer = Buffer.from(await file.arrayBuffer())
          const resizedBuffer = await resizeImageForAI(fileBuffer)
          
          // Create a new File object with resized buffer
          const resizedFile = new File([resizedBuffer], file.name, { type: 'image/png' })
          const filename = await saveUploadedImage(resizedFile)
          
          // Get full Image object (saveUploadedImage already added to index with createdAt)
          const imageId = getImageId(filename)
          const image = await getImageById(imageId)
          
          if (!image) {
            return json({ error: 'Failed to retrieve uploaded image' }, { status: 500 })
          }
          
          return json({
            success: true,
            image
          })
        } catch (error) {
          console.error('Upload error:', error)
          return json({ error: 'Upload failed' }, { status: 500 })
        }
      },
    },
  },
})
