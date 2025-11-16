import { promises as fs } from "fs";
import path from "path";
import { uuidv7 } from "uuidv7";

const DATA_DIR = path.join(process.cwd(), "data");
const IMAGES_DIR = path.join(DATA_DIR, "images");
const ANNOTATED_DIR = path.join(DATA_DIR, "annotated");
const INDEX_FILE = path.join(IMAGES_DIR, "index.json");

export interface ImageMetadata {
  filename: string;
  type: "uploaded" | "generated";
  createdAt: string;
}

export interface ImageIndex {
  [id: string]: ImageMetadata;
}

// Ensure directories exist
async function ensureDirectories() {
  await fs.mkdir(IMAGES_DIR, { recursive: true });
  await fs.mkdir(ANNOTATED_DIR, { recursive: true });
}

// Get image ID from filename (remove extension)
export function getImageId(filename: string): string {
  return filename.replace(/\.[^/.]+$/, "");
}

// Read JSON index file
async function readIndex(): Promise<ImageIndex> {
  try {
    await ensureDirectories();
    const indexContent = await fs.readFile(INDEX_FILE, "utf-8");
    return JSON.parse(indexContent);
  } catch (error) {
    // If index doesn't exist, return empty object
    return {};
  }
}

// Write JSON index file
async function writeIndex(index: ImageIndex): Promise<void> {
  await ensureDirectories();
  await fs.writeFile(INDEX_FILE, JSON.stringify(index, null, 2));
}

// Batch add multiple images to index at once
export async function addImagesToIndex(
  images: Array<{ filename: string; type: "uploaded" | "generated" }>
): Promise<void> {
  const index = await readIndex();
  const now = new Date().toISOString();
  for (const { filename, type } of images) {
    const id = getImageId(filename);
    index[id] = {
      filename,
      type,
      createdAt: now,
    };
  }
  await writeIndex(index);
}

export async function saveUploadedImage(file: File): Promise<string> {
  await ensureDirectories();
  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = `${uuidv7()}.png`;
  const filepath = path.join(IMAGES_DIR, filename);

  await fs.writeFile(filepath, buffer);
  await addImagesToIndex([{ filename, type: "uploaded" }]);
  return filename;
}

export async function saveAnnotatedImage(
  imageData: Buffer,
  originalFilename: string,
  runId: string,
  index?: number
): Promise<string> {
  await ensureDirectories();
  const suffix = index !== undefined && index > 0 ? `-${index}` : "";
  const filename = `${runId}${suffix}-annotated${path.extname(originalFilename)}`;
  const filepath = path.join(ANNOTATED_DIR, filename);

  await fs.writeFile(filepath, imageData);
  return filename;
}

export async function saveGeneratedImage(imageData: Buffer, _originalFilename: string): Promise<string> {
  await ensureDirectories();
  const filename = `${uuidv7()}.png`;
  const filepath = path.join(IMAGES_DIR, filename);

  await fs.writeFile(filepath, imageData);
  // Note: Index is updated separately via batch addImagesToIndex() call
  return filename;
}

export async function getImagePath(filename: string): Promise<string> {
  await ensureDirectories();
  return path.join(IMAGES_DIR, filename);
}

export async function getImage(filename: string): Promise<Buffer> {
  const filepath = await getImagePath(filename);
  return fs.readFile(filepath);
}

export async function getAllImages(): Promise<ImageIndex> {
  return readIndex();
}

export async function getImageMetadata(id: string): Promise<ImageMetadata | null> {
  const index = await readIndex();
  return index[id] || null;
}
