# Image Creation Pipeline

## Overview

Images flow through the system in two ways: **uploaded** (user uploads) and **generated** (AI creates new images). Both paths store images on disk and maintain an index in `data/images/index.json`.

## Pipeline Details

### 1. Image Upload Pipeline

```
Client → POST /api/upload
  ↓
Server: saveUploadedImage()
  ├─ Generates filename: `${uuidv7()}.png`
  ├─ Saves file to: data/images/${filename}
  ├─ Adds to index.json via addImagesToIndex()
  │  └─ Creates entry: { id: filename-without-ext, filename, type: "uploaded", createdAt }
  └─ Returns: { success, filename, url }
     ↓
Client receives: { filename, url } (NOT full Image object)
```

**Note:** Upload API doesn't return a full `Image` object - it only returns `filename` and `url`. The client would need to fetch from `/api/list-images` to get the full `Image` object with `id` and `createdAt`.

### 2. Image Generation Pipeline

```
Client → POST /api/generate-image
  ↓
Server: modifyImage() (AI generates images)
  ↓
For each generated image:
  ├─ saveGeneratedImage()
  │  ├─ Generates filename: `${uuidv7()}.png`
  │  └─ Saves file to: data/images/${filename}
  │     (Does NOT add to index yet)
  │
  ├─ createImageFromFilename(filename, "generated")
  │  └─ Creates Image object: { id, filename, url, type }
  │     (NO createdAt yet - not in index)
  │
  ├─ addGeneration() - stores in memory for run tracking
  │
  └─ Returns: { generationId, image, usage, imageIndex }
     ↓
After all images generated:
  ├─ addImagesToIndex() - batch adds all to index.json
  │  └─ Sets createdAt for all images
  │
  ├─ Updates image objects with createdAt from index
  │
  └─ Returns full Image objects with createdAt
     ↓
Client receives: Full Image[] objects with { id, filename, url, type, createdAt }
```

### 3. Image Retrieval Pipeline

```
Client → GET /api/list-images
  ↓
Server: getAllImagesAsObjects()
  ├─ readIndex() - reads data/images/index.json
  ├─ For each entry in index:
  │  └─ createImageFromMetadata(id, metadata)
  │     └─ Creates Image: { id, filename, url, type, createdAt }
  └─ Returns: Image[]
     ↓
Client receives: Full Image[] objects
```

## Why These Functions Are Server-Only

### `createImageFromMetadata(id, metadata)`

- **Purpose:** Converts stored index metadata → Image object
- **Used by:** `getAllImagesAsObjects()`, `getImageById()` (server-side only)
- **Why not on client:** Client never reads the index file directly - it gets Image objects from API responses

### `createImageFromFilename(filename, type)`

- **Purpose:** Creates Image object for newly generated images (before they're in index)
- **Used by:** `/api/generate-image` (server-side only)
- **Why not on client:** Client never creates images - it only receives them from the server

## Current Issues

1. **Upload API inconsistency:** Returns `{ filename, url }` instead of full `Image` object
2. **Functions are exported but client-only imports the type:** These are internal server utilities and don't need to be in the client bundle

## Recommendations

1. Make these functions internal (remove `export`) or move to a server-only file
2. Update upload API to return full `Image` object for consistency
3. Consider using a server-only marker or separate the storage utilities into server/client files
