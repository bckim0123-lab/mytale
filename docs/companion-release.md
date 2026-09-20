# Playable companion release — 2026-09-21

## What changed

- Four reusable, genuinely volumetric mesh companions (sprout, bunny, cat, bear), with articulated pivots, eye blink, idle breathing, walk, wave, hop and pet reactions. The same source exports portable animated GLB assets. Runtime fur micro-normal shading is an enhancement; exported assets retain standard PBR materials.
- A directly playable forest: tap-to-walk, arrow/WASD controls, accessible mobile joystick, water collision and bridge routing, proximity-triggered interactions.
- Two different paths: collect wood/build a bridge, or collect seeds/plant/water three flower beds. The changes remain in the world.
- Age-recommended play modes change reading length and the melody to two, three/four or five notes. The selected mode stays fixed for an adventure. Both accessible visual order and optional synthesized audio are supported. Mistakes can be retried without penalty.
- Individual lantern progress, dusk, moon-tree landmark and different sky/home-light endings.
- Five-page illustrated storybooks reflect route, owl choice and ending (eight combinations), with accessory rewards and a local bookshelf.
- Browser-local, versioned saves for appearance, nickname, progress and up to 100 books. Explicitly kept, completed AI character PNGs and their personas live in an IndexedDB artwork vault; original uploads and chat are not persisted. Quota, corruption and incompatible-version errors preserve the previous record.

## Honest boundaries

The instant 3D mode is curated mesh customization, not arbitrary photo/drawing-to-mesh reconstruction. Local palette extraction applies a picture's colors to one of four shapes. AI drawing conversion depends on the API. A kept AI image now becomes a closed, shallow, alpha-silhouette mesh (labelled “입체 그림인형”), preserving its face and markings in the forest and books. This is not a fully reconstructed, articulated 360-degree character. Once created, the friend and forest run locally without further generation requests.

Game state persists in the same browser only; there is no account/cloud sync. A validated family backup includes kept character artwork, personas and books and can be manually imported on another device. Book backgrounds combine story assets and branch/world-specific decorative art with the saved hero, not screenshots of actual gameplay. Offline mocked tests are not evidence of a live provider response.

## Personalization and storybook polish

- Added curved heart/spotted markings and upright/floppy ears, with softer closed cat ears after visual review. Four species × three patterns × two ear styles have geometry/animation checks. Palettes and accessories add further combinations.
- Local extraction now uses two distinct drawing colours when available. Dark neutral pencil drawings get a gentle graphite palette; blank paper and transparent pixels do not become drawing colours. This is palette customization, not reconstruction of a drawing's shape.
- Mobile customization keeps a compact live 3D preview on screen. The forest camera follows more closely. Collection arcs, footprints, bell ripples, water/soil/petal effects, sequential bridge planks, following owl and guiding fireflies make actions visible without additional API calls. Effect pools are bounded and reduced-motion preferences are respected.
- New books snapshot the adventure's hero name, appearance and route/owl/ending choices in the same browser's local bookshelf. The same hero appears in every page, even after later customization. Browser data deletion removes this record unless a family backup was downloaded. Older books explicitly identify the current appearance as a fallback.
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

All five real-family checks are pending. Current content remains one 3D forest with branching routes, plus eight illustrated adventure themes, not eight fully playable 3D worlds. Google sign-in and cloud synchronization remain unimplemented.

## Final integration and reliability pass

- Character generation rejects low fidelity, incomplete anatomy, wrong style, unsafe output and non-transparent rectangular backgrounds. One bounded corrective generation is permitted and reviewed again. Reviewer outages return an authenticated, encrypted, five-minute, source/style-bound receipt: retry reviews the same image instead of generating and charging for a new candidate. Unreviewed output is not exposed.
- Chat requires explicit consent server-side and checks current messages, history and persona for private/urgent content, including obfuscated variants. Blocked conversations clear history. Provider context uses unprivileged persona data and `store: false`.
- Same-browser tabs merge non-conflicting saves under a Web Lock. Conflicts, future versions and corrupt saves are surfaced. Reset generations prevent stale requests, imports or tabs from resurrecting old state. Artwork and metadata share the lock and use generation/epoch guards.
- Kept artwork uses strict PNG dimensions, checksums and bounded capacity. Artwork import/selection restores the matching persona. Missing art is identified instead of silently displaying an unrelated friend. Original photos and chats are excluded from family backups.
- Illustrated adventure books can explicitly be added to the permanent shelf, preserving all chapters, dialogue, choices, world art and hero. Offline HTML export embeds the art and complete text with no script or network dependency. Imported text is escaped and data URLs are validated.
- AI drawing puppets face the forest camera with subtle movement turning; idle motion, repeatable gestures, full movement cancellation and resource disposal have regression coverage. Mobile book toolbar wrapping and sticky controls were corrected after actual screen review.

## Latest verification evidence

- `npm run quality` passed after the final facing/UI fixes: typecheck, Sites build, safety (11), mocked chat privacy (77), generation/quality/streaming, 24 age/branch playthroughs, save/asset/integration races, 974 navigation routes, book export and creature geometry/interaction tests.
- `npx oxlint app scripts` passed. Full-repository lint still reports pre-existing unused-code findings in shared `components/ui` and `hooks/use-mobile.ts`; those are not claimed fixed.
- Live local-provider test: one public, synthetic sample drawing was transformed into a transparent plush-style character and passed the model reviewer with a score of 94. This is a single successful generation, not a guarantee of all-image quality or child preference.
- Live local chat after the transmission notice/guardian prompt returned a Korean, persona-specific reply to a synthetic owl-greeting question. No personal data was used. No browser console errors were observed in this final flow.
- Browser UI on a 390 × 844 viewport: saved that exact AI character, played the garden/invite/home route in five-note challenge mode, deliberately retried an incorrect note without penalty, completed all lanterns and opened the five-page book with the same hero. Reload retained the character and shelf.
- Downloaded a real 6.39 MB HTML book (five pages, eleven embedded raster images, no script, restrictive CSP). File-URL preview was blocked by browser policy, so offline visual/print rendering is not claimed verified. In-app book layout was visually checked.
- Downloaded and re-imported the actual 0.81 MB family backup (five books, one kept character); no duplicate books were added. A clearly labelled local synthetic ocean-book fixture then verified distinct world art, original chapter titles and the same hero in the mobile reader. No fixture is included in production source.

The human-validation checklist above remains the release-quality follow-up; automated checks cannot establish contest placement or family satisfaction.

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
