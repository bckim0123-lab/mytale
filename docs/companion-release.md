# Playable companion release — 2026-09-21

## What changed

- Four reusable, genuinely volumetric mesh companions (sprout, bunny, cat, bear), with articulated pivots, eye blink, idle breathing, walk, wave, hop and pet reactions. The same source exports portable animated GLB assets. Runtime fur micro-normal shading is an enhancement; exported assets retain standard PBR materials.
- A directly playable forest: tap-to-walk, arrow/WASD controls, accessible mobile joystick, water collision and bridge routing, proximity-triggered interactions.
- Two different paths: collect wood/build a bridge, or collect seeds/plant/water three flower beds. The changes remain in the world.
- Owl conversation changes a 3- or 4-note melody. Both accessible visual order and optional synthesized audio are supported. Mistakes can be retried without penalty.
- Individual lantern progress, dusk, moon-tree landmark and different sky/home-light endings.
- Five-page illustrated storybooks reflect route, owl choice and ending (eight combinations), with accessory rewards and a local bookshelf.
- Browser-local, bounded, schema-validated saves for appearance, nickname, progress and books. Uploaded images and chat are not stored in this record. Quota errors are explained without overwriting the previous save.

## Honest boundaries

The instant 3D mode is curated mesh customization, not arbitrary photo/drawing-to-mesh reconstruction. Local palette extraction applies a picture's colors to one of four shapes. Existing AI drawing conversion remains a separate feature and still depends on the API. The new 3D creation and forest do not require API requests.

Game state persists in the same browser only; there is no cross-device account sync. Book backgrounds are existing story assets, combined with branch-specific decorative art and a render of the saved 3D companion, not screenshots of the actual gameplay. No production API response was asserted from fallback smoke tests.

## Personalization and storybook polish

- Added curved heart/spotted markings and upright/floppy ears, with softer closed cat ears after visual review. Four species × three patterns × two ear styles have geometry/animation checks. Palettes and accessories add further combinations.
- Local extraction now uses two distinct drawing colours when available. Dark neutral pencil drawings get a gentle graphite palette; blank paper and transparent pixels do not become drawing colours. This is palette customization, not reconstruction of a drawing's shape.
- Mobile customization keeps a compact live 3D preview on screen. The forest camera follows more closely. Collection arcs, footprints, bell ripples, water/soil/petal effects, sequential bridge planks, following owl and guiding fireflies make actions visible without additional API calls. Effect pools are bounded and reduced-motion preferences are respected.
- New books snapshot the adventure's hero name, appearance and route/owl/ending choices in the same browser's local bookshelf. The same hero appears in every page, even after later customization. Browser data deletion removes this record; there is no cloud backup. Older books explicitly identify the current appearance as a fallback.
- Full-book print layout includes a cover, every page and parent discussion notes. Optional read-aloud uses an installed local Korean voice only. Without one, it explains the limitation; it never silently sends the book to a remote speech service.
- Parent overview shows actual choices, not scores or claims about the child's personality. Chat has an explicit transmission notice, checkbox and simple guardian prompt; this is not identity verification, age verification or verified parental consent. Deleting local saves requires typing the confirmation word.
- Isolated smoke-test Vite caches after diagnosing test runners overwriting the live development dependency cache (HTTP 504 for React modules).

## Human validation still required

Internal QA is not evidence of child satisfaction, learning outcomes, market ranking or competition success. Before calling this child-validated, observe six child/parent pairs (two each in ages 4–6, 7–9 and 10–12) with guardian permission. Do not record identifying information or upload their drawings without separate consent.

1. Can at least five children recognize their own friend among four examples and explain two choices they made?
2. Can at least five make a purposeful move within 30 seconds and complete the first objective within two minutes without coaching, including on a 390px phone?
3. Can at least five explain a visible difference caused by their route/owl/ending choice, not just repeat the text?
4. Is the hero correct on every page, and do at least five parents find the resulting book personal enough to keep? Confirm full printed output on their actual printer/PDF viewer.
5. Can at least five parents explain local saving versus OpenAI use, resume progress and find consent/revocation controls without assuming cloud backup?

All five real-family checks are pending. Current content remains one forest with branching routes, not a broad library of 3D adventures.

## Verification

- `npm run typecheck`
- `npm run test:companion`: 974 collision-safe navigation routes; both story routes and eight ending combinations; guarded/idempotent progression; save validation, corruption, quota and privacy allowlists.
- `npm run test:adventure` and `npm run test:generation`: existing experience regression tests.
- `TEST_BASE_URL=http://localhost:4173 npm run test:safety`: safety redirects/urgent messages/empty input passed; normal API reply was a clearly identified fallback in the local environment.
- Both Sites (`npm run build`) and Vercel (`NITRO_PRESET=vercel npm run build:vercel`) production builds.
- Current-polish browser playthrough: desktop river/invite/sky ending and 390px mobile garden/listen/home ending. Both completed through reward equip and personalized books. The earlier base-release playthrough separately covered river/listen/sky and garden/invite/home, including an incorrect melody and successful retry.
- Visually reviewed the mobile book's five pages, branch details and portrait; desktop and mobile page one screenshots were saved. Changing the companion afterward did not alter the earlier book's bunny snapshot. Local read-aloud stopped on page change. Book close controls and mobile preview framing were corrected during visual review.
- Reload restored the nickname, cat appearance, peach palette, spotted marking, floppy ears, flower reward and four-book shelf; the home keepsake reopened the latest book. The base-release run also covered unfinished-forest resume.
- Deletion confirmation was tested without deleting: typing the confirmation enabled the button, then cancel/reopen cleared it and disabled deletion again.
- Full-book print styles and the print action are implemented. The in-app browser did not expose a print preview, so actual PDF/printer pagination and clipping remain unverified; do not describe them as print-tested.
- Browser WebGL shader compilation: no console errors observed after art refinements.

## Structure

`companion-experience.tsx` owns UI/save orchestration; `companion-world.tsx` owns renderer lifecycle and input wrapper; `companion-world-runtime.ts` owns 3D rendering/navigation; `creature-rig.ts` owns character geometry/animation; `forest-story.ts` is a deterministic reducer; `companion-save.ts` is the storage/privacy boundary.
