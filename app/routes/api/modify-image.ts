import { json } from '@tanstack/start'
import { createAPIFileRoute } from '@tanstack/start/api'
import { google } from '@ai-sdk/google'
import { experimental_generateImage as generateImage } from 'ai'
import { getImage, saveModifiedImage } from '~/utils/storage'
import { drawBordersOnImage, getCellCoordinates, getCellBounds } from '~/utils/imageProcessing'

export const Route = createAPIFileRoute('/api/modify-image')({
  POST: async ({ request }) => {
    try {
      const { imageUrl, selectedCells, prompt } = await request.json()

      if (!imageUrl || !selectedCells || !prompt) {
        return json({ error: 'Missing required fields' }, { status: 400 })
      }

      // Extract filename from URL (e.g., /api/images/filename.png -> filename.png)
      const filename = imageUrl.split('/').pop()
      if (!filename) {
        return json({ error: 'Invalid image URL' }, { status: 400 })
      }

      // Get the original image
      const imageBuffer = await getImage(filename)

      // Draw borders around selected cells
      const imageWithBorders = await drawBordersOnImage(
        imageBuffer,
        selectedCells
      )

      // Get API key from environment
      const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY

      if (!apiKey) {
        return json({
          error: 'GOOGLE_GENERATIVE_AI_API_KEY not configured. Please add it to .env file'
        }, { status: 500 })
      }

      // Create system prompt
      const cellCount = selectedCells.length
      const systemPrompt = `You are helping to modify specific regions of an image.
The user has selected ${cellCount} cell(s) in a 6x6 grid overlay on the image.
These cells are marked with blue borders in the image.

Modify ONLY the content within the blue-bordered cells according to the user's instructions.
Keep the rest of the image unchanged.
Maintain the same image dimensions and overall style.`

      // Call Gemini to modify the image
      const { image: modifiedImageData } = await generateImage({
        model: google('gemini-2.0-flash-exp', {
          // @ts-ignore - image generation parameters
          numImages: 1,
        }),
        prompt: `${systemPrompt}\n\nUser instruction: ${prompt}`,
        image: imageWithBorders,
      })

      // Convert the image data to buffer
      let modifiedBuffer: Buffer
      if (modifiedImageData instanceof Uint8Array) {
        modifiedBuffer = Buffer.from(modifiedImageData)
      } else if (Buffer.isBuffer(modifiedImageData)) {
        modifiedBuffer = modifiedImageData
      } else if (typeof modifiedImageData === 'string') {
        // If it's a base64 string
        modifiedBuffer = Buffer.from(modifiedImageData, 'base64')
      } else {
        throw new Error('Unexpected image data format')
      }

      // Save the modified image
      const modifiedFilename = await saveModifiedImage(modifiedBuffer, filename)

      return json({
        success: true,
        imageUrl: `/api/images-modified/${modifiedFilename}`,
      })
    } catch (error) {
      console.error('Image modification error:', error)
      return json({
        error: error instanceof Error ? error.message : 'Image modification failed'
      }, { status: 500 })
    }
  },
})
