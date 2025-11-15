import { promises as fs } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

const UPLOAD_DIR = path.join(process.cwd(), 'uploads')
const ORIGINAL_DIR = path.join(UPLOAD_DIR, 'original')
const MODIFIED_DIR = path.join(UPLOAD_DIR, 'modified')

export async function saveUploadedImage(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer())
  const filename = `${randomUUID()}${path.extname(file.name)}`
  const filepath = path.join(ORIGINAL_DIR, filename)

  await fs.writeFile(filepath, buffer)
  return filename
}

export async function saveModifiedImage(
  imageData: Buffer,
  originalFilename: string
): Promise<string> {
  const filename = `${randomUUID()}-modified${path.extname(originalFilename)}`
  const filepath = path.join(MODIFIED_DIR, filename)

  await fs.writeFile(filepath, imageData)
  return filename
}

export async function getImagePath(filename: string, type: 'original' | 'modified' = 'original'): Promise<string> {
  const dir = type === 'original' ? ORIGINAL_DIR : MODIFIED_DIR
  return path.join(dir, filename)
}

export async function getImage(filename: string, type: 'original' | 'modified' = 'original'): Promise<Buffer> {
  const filepath = await getImagePath(filename, type)
  return fs.readFile(filepath)
}

export async function listOriginalImages(): Promise<string[]> {
  const files = await fs.readdir(ORIGINAL_DIR)
  return files.filter(f => !f.startsWith('.'))
}
