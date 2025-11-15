import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { google } from '@ai-sdk/google'
import { experimental_generateImage as generateImage } from 'ai'
import { saveModifiedImage } from '~/utils/storage'
import { formatCellsForPrompt } from '~/utils/imageProcessing'
import { promises as fs } from 'fs'
import path from 'path'

export const Route = createFileRoute('/api/modify-image')({
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
      const body = await request.json()
      const { imageDataUrl, selectedCells, prompt, originalFilename } = body

      if (!imageDataUrl || !selectedCells || !prompt) {
        throw json({ error: 'Missing required fields' }, { status: 400 })
      }

      // Get API key from environment
      const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY

      if (!apiKey) {
        throw json({
          error: 'GOOGLE_GENERATIVE_AI_API_KEY not configured. Please add it to .env file'
        }, { status: 500 })
      }

      // Convert data URL to buffer
      const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, '')
      const imageBuffer = Buffer.from(base64Data, 'base64')

      // Save debug copy of image with borders
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const debugFilename = `debug-${timestamp}.png`
      const debugPath = path.join(process.cwd(), 'temp', debugFilename)
      await fs.writeFile(debugPath, imageBuffer)

      // Create system prompt with cell information
      const cellCount = selectedCells.length
      const cellInfo = formatCellsForPrompt(selectedCells)

      // Log debug information
      console.log(`\n[DEBUG] Image modification request:`)
      console.log(`  - Image with borders: temp/${debugFilename}`)
      console.log(`  - Selected cells: ${JSON.stringify(selectedCells)}`)
      console.log(`  - ${cellInfo}`)
      console.log(`  - User prompt: "${prompt}"\n`)

      const systemPrompt = `You are helping to modify specific regions of an image.
The user has selected ${cellCount} cell(s) in a 6x6 grid overlay on the image.
${cellInfo}

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
        image: imageBuffer,
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
      const modifiedFilename = await saveModifiedImage(
        modifiedBuffer,
        originalFilename || 'image.png'
      )

      return json({
        success: true,
        imageUrl: `/api/images-modified/${modifiedFilename}`,
      })
    } catch (error) {
      console.error('Image modification error:', error)
      throw json({
        error: error instanceof Error ? error.message : 'Image modification failed'
      }, { status: 500 })
    }
  },
})
