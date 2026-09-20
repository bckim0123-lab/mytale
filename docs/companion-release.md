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

Game state persists in the same browser only; there is no cross-device account sync. Illustrations in books are existing story assets, not generated screenshots of the user's exact companion. No production API response was asserted from fallback smoke tests.

## Verification

- `npm run typecheck`
- `npm run test:companion`: 974 collision-safe navigation routes; both story routes and eight ending combinations; guarded/idempotent progression; save validation, corruption, quota and privacy allowlists.
- `npm run test:adventure` and `npm run test:generation`: existing experience regression tests.
- `TEST_BASE_URL=http://localhost:4173 npm run test:safety`: safety redirects/urgent messages/empty input passed; normal API reply was a clearly identified fallback in the local environment.
- Both Sites (`npm run build`) and Vercel (`NITRO_PRESET=vercel npm run build:vercel`) production builds.
- Actual browser playthrough: desktop river/listen/sky ending; 390px mobile garden/invite/home ending, including a wrong melody note and successful retry. Two distinct books and both accessory rewards appeared.
- Reload restored nickname, bunny appearance, peach palette, books and unfinished forest. Mobile camera framing, scene occlusion and offscreen navigation were corrected during visual review.
- Browser WebGL shader compilation: no console errors observed after art refinements.

## Structure

`companion-experience.tsx` owns UI/save orchestration; `companion-world.tsx` owns renderer lifecycle and input wrapper; `companion-world-runtime.ts` owns 3D rendering/navigation; `creature-rig.ts` owns character geometry/animation; `forest-story.ts` is a deterministic reducer; `companion-save.ts` is the storage/privacy boundary.
