# Practice whale: image provenance

Created and verified on 2026-10-04. This is an explicitly synthetic practice drawing, not a child's submitted artwork or a customer testimonial.

## Files and method

- `public/practice-whale-drawing-v1.webp`: 1254 × 1254, 427,094 bytes. One original image made with the built-in image-generation tool, prompt-only, one call, no reference image or retries. The delivered source PNG was saved as `ai-sample-sky-blue-whale-oct4.png` in the task's `2026-10-04/image-assets` directory. The tool delivered 1254 × 1254 despite the requested 1024 × 1024.
- `public/practice-whale-result-v1.webp`: 1024 × 1024, 195,862 bytes. Actual approved response from this app's local `/api/character` route, using the drawing above, plush style and the dated `gpt-image-2.5-flare-2026-09-08` image model. The source response was saved as `outputs/ai-sample-whale-flare-oct4.png`. The request completed in 28.6 seconds and passed the model reviewer with score 94. Neither the timing nor the score is a promise about other drawings, children, or service availability.
- `scripts/build-practice-assets.mjs` compressed both source PNGs to WebP with quality 90 and alpha quality 100. No resizing, cropping, recoloring, compositing, background change or other content edit was applied. The original transparency of the generated result is retained.

The landing page labels the drawing as AI practice material and the paired character as a real service result. Loading the practice drawing fetches only a bundled local asset. It does not call an AI provider; generation requires the separate, explicit creation button and guardian notice.

## Exact image-generation prompt for the practice drawing

```text
Use case: illustration-story
Asset type: exactly one original synthetic sample drawing for a Korean children's drawing-to-cute-character app; this will be labelled AI sample in the app.
Primary request: Generate one 1024 by 1024 square PNG of a simple friendly sky-blue flying whale drawn in a charming, unpolished, childlike crayon style. This is a new original synthetic drawing, not a reproduction of an existing child's artwork.
Scene/backdrop: plain ivory drawing paper filling the square canvas, subtle natural paper grain; no scenery.
Subject: exactly one whale with one large rounded oval body/head as a single continuous shape, never a separate humanoid head and body. Two little pectoral fins, a small split tail on the right, two imperfect dark round eyes facing the viewer in a mild three-quarter pose, a little smiling mouth, one small yellow star on its belly, and a tiny water spout just above its head.
Style/medium: wobbly dark crayon outline, visible rough blue crayon fill strokes with small paper gaps, naive hand-drawn asymmetry. Deliberately simple and unpolished, like an imaginative early child's sketch, not professional illustration and not 3D.
Composition/framing: entire whale, both fins, tail, and spout are visible and unclipped; centered on the square paper with approximately 15 percent empty margin all around the complete subject.
Constraints: original design, one image only, no variants, no hands or feet, no humanoid anatomy, no extra characters, no objects beyond the specified whale and spout, no scenery, no text, no logo, no watermark.
```

The approved plush result is not a separate manually fabricated advertising image. Its prompt assembly, structural fidelity requirements, preference handling, transparency checks and review thresholds live in `app/api/character/route.ts` and `app/character-quality.ts`.
