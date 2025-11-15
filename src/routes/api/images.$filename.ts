import { createFileRoute } from '@tanstack/react-router'
import { getImage } from '~/utils/storage'

export const Route = createFileRoute('/api/images/$filename')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const imageBuffer = await getImage(params.filename)

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
    },
  },
})
