import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

const DATA_DIR = path.join(process.cwd(), "data");
const UPLOADED_DIR = path.join(DATA_DIR, "uploaded");
const ANNOTATED_DIR = path.join(DATA_DIR, "annotated");
const GENERATED_DIR = path.join(DATA_DIR, "generated");

// Ensure directories exist
async function ensureDirectories() {
  await fs.mkdir(UPLOADED_DIR, { recursive: true });
  await fs.mkdir(ANNOTATED_DIR, { recursive: true });
  await fs.mkdir(GENERATED_DIR, { recursive: true });
}

export async function saveUploadedImage(file: File): Promise<string> {
  await ensureDirectories();
  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = `${randomUUID()}${path.extname(file.name)}`;
  const filepath = path.join(UPLOADED_DIR, filename);

  await fs.writeFile(filepath, buffer);
  return filename;
}

export async function saveAnnotatedImage(imageData: Buffer, originalFilename: string, runId: string): Promise<string> {
  await ensureDirectories();
  const filename = `${runId}-annotated${path.extname(originalFilename)}`;
  const filepath = path.join(ANNOTATED_DIR, filename);

  await fs.writeFile(filepath, imageData);
  return filename;
}

export async function saveGeneratedImage(imageData: Buffer, originalFilename: string): Promise<string> {
  await ensureDirectories();
  const filename = `${randomUUID()}-generated${path.extname(originalFilename)}`;
  const filepath = path.join(GENERATED_DIR, filename);

  await fs.writeFile(filepath, imageData);
  return filename;
}

// Legacy function name for backward compatibility
export async function saveModifiedImage(imageData: Buffer, originalFilename: string): Promise<string> {
  return saveGeneratedImage(imageData, originalFilename);
}

export async function getImagePath(
  filename: string,
  type: "uploaded" | "annotated" | "generated" = "uploaded"
): Promise<string> {
  await ensureDirectories();
  const dir = type === "uploaded" ? UPLOADED_DIR : type === "annotated" ? ANNOTATED_DIR : GENERATED_DIR;
  return path.join(dir, filename);
}

export async function getImage(
  filename: string,
  type: "uploaded" | "annotated" | "generated" = "uploaded"
): Promise<Buffer> {
  const filepath = await getImagePath(filename, type);
  return fs.readFile(filepath);
}

export async function listOriginalImages(): Promise<string[]> {
  await ensureDirectories();
  const files = await fs.readdir(UPLOADED_DIR);
  return files.filter((f) => !f.startsWith("."));
}
