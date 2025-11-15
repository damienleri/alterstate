import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { saveUploadedImage } from '~/utils/storage'

export const Route = createFileRoute('/api/upload')({
  beforeLoad: async ({ request }) => {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }
  },
  loader: async ({ request }) => {
    if (request.method !== 'POST') {
      throw new Response('Method not allowed', { status: 405 })
    }

    try {
      const formData = await request.formData()
      const file = formData.get('file') as File

      if (!file) {
        throw json({ error: 'No file provided' }, { status: 400 })
      }

      const filename = await saveUploadedImage(file)

      return json({
        success: true,
        filename,
        url: `/api/images/${filename}`
      })
    } catch (error) {
      console.error('Upload error:', error)
      throw json({ error: 'Upload failed' }, { status: 500 })
    }
  },
})
