import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { saveUploadedImage } from '~/utils/storage'

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

          const filename = await saveUploadedImage(file)

          return json({
            success: true,
            filename,
            url: `/api/images/${filename}`
          })
        } catch (error) {
          console.error('Upload error:', error)
          return json({ error: 'Upload failed' }, { status: 500 })
        }
      },
    },
  },
})
