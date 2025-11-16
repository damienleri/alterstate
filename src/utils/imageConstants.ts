/**
 * Maximum image dimensions for AI processing.
 * Larger images consume more tokens, so we limit dimensions to save costs.
 *
 * These dimensions maintain aspect ratio while ensuring the image fits within
 * the specified maximum width and height.
 */
export const MAX_IMAGE_WIDTH = 1024;
export const MAX_IMAGE_HEIGHT = 1024;
