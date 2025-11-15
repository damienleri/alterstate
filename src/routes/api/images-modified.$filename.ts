import { createFileRoute } from '@tanstack/react-router'
import { getImage } from '~/utils/storage'

export const Route = createFileRoute('/api/images-modified/$filename')({
  loader: async ({ params }) => {
    try {
      const imageBuffer = await getImage(params.filename, 'modified')

      return new Response(imageBuffer, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=31536000',
        },
      })
    } catch (error) {
      throw new Response('Image not found', { status: 404 })
    }
  },
})
