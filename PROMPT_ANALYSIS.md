# Prompt Analysis for Image Generation

## Current Prompt Structure

### Example 1: Single Image with Borders (selectAllMode = false)

**System Prompt:**

```
CRITICAL: You must ONLY modify the content within the blue-bordered cells. The blue borders clearly indicate the exact regions you are allowed to modify.

IMPORTANT RULES:
- ONLY modify pixels that are inside the blue-bordered cells
- DO NOT modify ANY content outside the blue borders - keep it exactly as it appears in the original
- The blue borders define strict boundaries - respect them precisely
- MANDATORY: You MUST completely remove ALL blue borders from your final output image. The output image must have NO blue borders whatsoever - they are only visual guides for you to identify the regions to modify, but they must be completely absent from the final result
- Keep the rest of the image completely unchanged

Follow the user's instructions, but ONLY apply them to the content within the blue-bordered regions. Everything outside the blue borders must remain untouched. Remember: the blue borders must be completely removed - your output should show no trace of them.

Modify the image according to the user's instructions.

When the user requests "removing" an item or object, interpret this as replacing it with inferred background that seamlessly blends with the surrounding area.
Infer what the background should look like based on the context around the item and generate appropriate background content to fill the space.

Maintain the same image dimensions and overall style as the original image.
Pay attention to lighting, shadows, textures, and color grading to ensure modifications blend naturally with the existing image.
```

**User Prompt:**

```
[User's prompt text]

[Image with blue borders]
```

---

### Example 2: Two Images (Multi-Image Mode)

**System Prompt:**

```
You are provided with multiple images. Your task is to combine these images into a single new image that incorporates the user's change request.

IMPORTANT:
- Create a new composite image that seamlessly blends elements from all provided images
- The result should be a cohesive, unified image that incorporates the user's requested changes
- Maintain visual consistency and natural blending between elements from different images
- The output should look like a single, coherent image, not a collage or side-by-side arrangement
- Pay attention to lighting, shadows, textures, and color grading to ensure all elements blend naturally

CRITICAL: You must ONLY modify the content within the blue-bordered cells. The blue borders clearly indicate the exact regions you are allowed to modify.

IMPORTANT RULES:
- ONLY modify pixels that are inside the blue-bordered cells
- DO NOT modify ANY content outside the blue borders - keep it exactly as it appears in the original
- The blue borders define strict boundaries - respect them precisely
- MANDATORY: You MUST completely remove ALL blue borders from your final output image. The output image must have NO blue borders whatsoever - they are only visual guides for you to identify the regions to modify, but they must be completely absent from the final result
- Keep the rest of the image completely unchanged

Follow the user's instructions, but ONLY apply them to the content within the blue-bordered regions. Everything outside the blue borders must remain untouched. Remember: the blue borders must be completely removed - your output should show no trace of them.

Modify the image according to the user's instructions.

When the user requests "removing" an item or object, interpret this as replacing it with inferred background that seamlessly blends with the surrounding area.
Infer what the background should look like based on the context around the item and generate appropriate background content to fill the space.

Maintain the same image dimensions and overall style as the original image.
Pay attention to lighting, shadows, textures, and color grading to ensure modifications blend naturally with the existing image.
```

**User Prompt:**

```
Combine the provided 2 images into a single new image that incorporates the following changes: [User's prompt text]

[Image 1 with blue borders]
[Image 2 with blue borders]
```

---

## Areas for Improvement

### 1. **Multi-Image Instructions Conflict with Border Instructions**

**Problem:** When combining 2 images, the system prompt says:

- "combine these images into a single new image" (multi-image instructions)
- "ONLY modify content within blue-bordered cells" (border instructions)

This creates confusion: Should the AI combine both images OR only modify the bordered regions? The border instructions don't make sense when combining images.

**Solution:** When in multi-image mode, the border instructions should be different or removed. The AI should:

- Combine elements from both images
- Apply the user's changes to the combined result
- Not be constrained by borders when combining (borders are for single-image edits)

### 2. **Redundant Instructions**

**Problem:** The prompt repeats similar concepts:

- "Maintain visual consistency" appears in both multi-image and base instructions
- "Pay attention to lighting, shadows, textures" is mentioned multiple times
- Border removal is emphasized 3+ times

**Solution:** Consolidate and structure instructions more hierarchically.

### 3. **Missing Context About Image Relationships**

**Problem:** When combining 2 images, the AI doesn't know:

- Which image is the "base" vs "reference"
- What relationship the images have (are they variations? different angles? completely different?)
- How to prioritize elements when combining

**Solution:** Add context about image relationships or let the user specify.

### 4. **Border Instructions Don't Apply to Multi-Image**

**Problem:** Border instructions assume a single image with selectable regions. When combining 2 images, borders on both images create confusion about what to combine vs what to modify.

**Solution:**

- Option A: Disable borders in multi-image mode (selectAllMode = true)
- Option B: Clarify that borders indicate regions to extract/combine, not regions to modify
- Option C: Use different instructions for multi-image mode

### 5. **User Prompt Could Be More Specific**

**Problem:** "Combine the provided 2 images into a single new image that incorporates the following changes: [prompt]" is vague.

**Solution:** More specific guidance:

- "Analyze both images and create a new composite that..."
- "Use elements from Image 1 as the base and incorporate features from Image 2..."
- "Blend the best aspects of both images while applying: [prompt]"

### 6. **No Guidance on Output Dimensions**

**Problem:** When combining 2 images of different sizes, the output dimensions aren't specified.

**Solution:** Add instruction about maintaining aspect ratio or using the larger image's dimensions.

### 7. **Variation Instructions Are Generic**

**Problem:** If `IMAGES_PER_LLM_CALL > 1`, the variation instructions are generic and don't specify what should vary.

**Solution:** More specific variation guidance:

- "Vary the composition, color palette, or style while maintaining the core changes"
- "Create variations that explore different interpretations of the user's request"
