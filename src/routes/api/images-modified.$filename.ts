import { createFileRoute } from '@tanstack/react-router'
import { createAPIFileRoute } from '@tanstack/react-start/api'
import { getImage } from '~/utils/storage'

export const Route = createAPIFileRoute('/api/images-modified/$filename')({
  GET: async ({ params }) => {
    try {
      const imageBuffer = await getImage(params.filename, 'modified')

      return new Response(imageBuffer, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=31536000',
        },
      })
    } catch (error) {
      return new Response('Image not found', { status: 404 })
    }
  },
})
