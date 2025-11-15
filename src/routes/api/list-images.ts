import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { createAPIFileRoute } from '@tanstack/react-start/api'
import { listOriginalImages } from '~/utils/storage'

export const Route = createAPIFileRoute('/api/list-images')({
  GET: async () => {
    try {
      const images = await listOriginalImages()

      return json({
        images: images.map(filename => ({
          filename,
          url: `/api/images/${filename}`
        }))
      })
    } catch (error) {
      console.error('List images error:', error)
      return json({ error: 'Failed to list images' }, { status: 500 })
    }
  },
})
