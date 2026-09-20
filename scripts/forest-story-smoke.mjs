import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  cacheDir: 'node_modules/.vite-story-test',
  root: process.cwd(),
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
});
try {
  const story = await server.ssrLoadModule('/app/forest-story.ts');
  const {
    initialForestState,
    transitionForest,
    getForestView,
    getForestEnding,
    getForestMelody,
    sanitizeForestState,
    FOREST_WOOD_IDS,
    FOREST_SEED_IDS,
    FOREST_BED_IDS,
    FOREST_LANTERN_IDS,
    FOREST_LOCATIONS,
    FOREST_DISCOVERIES,
    getForestCompanion,
  } = story;
  const act = (state, id) => transitionForest(state, { type: 'interact', id });
  const roundTrip = (state) => {
    assert.deepEqual(
      sanitizeForestState(JSON.parse(JSON.stringify(state))),
      state,
      'Every reachable state must survive saving.',
    );
    const view = getForestView(state);
    assert.ok(view.progress >= 0 && view.progress <= 100);
    assert.equal(
      new Set(view.hotspots.map((spot) => spot.id)).size,
      view.hotspots.length,
    );
    for (const spot of view.hotspots) {
      assert.ok(spot.x >= -8 && spot.x <= 8 && spot.z >= -8 && spot.z <= 5);
      assert.deepEqual({ x: spot.x, z: spot.z }, FOREST_LOCATIONS[spot.id]);
    }
    return state;
  };
  const progress = (state, event) => {
    const snapshot = JSON.stringify(state);
    const next = transitionForest(state, event);
    assert.equal(
      JSON.stringify(state),
      snapshot,
      'Reducer must not mutate its input.',
    );
    return roundTrip(next);
  };
  const finishedStories = new Set();
  for (const craftDesign of ['star', 'heart']) {
    for (const route of ['river', 'garden']) {
      for (const owl of ['listen', 'invite']) {
        for (const ending of ['sky', 'home']) {
          let state = roundTrip(initialForestState());
          assert.equal(state.edition, 2);
          assert.strictEqual(
            transitionForest(state, {
              type: 'complete-craft',
              design: craftDesign,
            }),
            state,
          );
          assert.strictEqual(act(state, 'secret-star'), state);
          assert.strictEqual(act(state, 'river-gate'), state);
          assert.strictEqual(
            transitionForest(state, { type: 'choose-ending', choice: ending }),
            state,
          );
          state = progress(state, { type: 'choose-route', route });
          const routeSecret =
            route === 'river' ? 'secret-shell' : 'secret-mushroom';
          const otherSecret =
            route === 'river' ? 'secret-mushroom' : 'secret-shell';
          assert.strictEqual(
            act(state, otherSecret),
            state,
            'A secret from the unchosen route cannot be collected.',
          );
          assert.strictEqual(
            act(state, 'secret-star'),
            state,
            'The tree secret is not available before crossing.',
          );
          assert.strictEqual(
            transitionForest(state, {
              type: 'complete-craft',
              design: craftDesign,
            }),
            state,
            'All three materials precede crafting.',
          );
          state = progress(state, { type: 'interact', id: routeSecret });
          assert.strictEqual(
            act(state, routeSecret),
            state,
            'A discovery is never duplicated.',
          );
          const selected = state;
          assert.strictEqual(
            transitionForest(state, {
              type: 'choose-route',
              route: route === 'river' ? 'garden' : 'river',
            }),
            selected,
          );
          if (route === 'river') {
            assert.equal(act(state, 'river-bridge').bridges, false);
            assert.equal(act(state, 'river-gate').chapter, 'crossing');
            for (const id of FOREST_WOOD_IDS) {
              state = progress(state, { type: 'interact', id });
              assert.strictEqual(
                act(state, id),
                state,
                'Collected wood cannot be claimed twice.',
              );
            }
            state = progress(state, { type: 'interact', id: 'river-bridge' });
            assert.equal(
              state.bridges,
              false,
              'A direct bridge interaction cannot bypass the edition 2 puzzle.',
            );
            assert.equal(act(state, 'river-gate').chapter, 'crossing');
            state = progress(state, {
              type: 'complete-craft',
              design: craftDesign,
            });
            assert.equal(state.bridges, true);
            state = progress(state, { type: 'interact', id: 'river-gate' });
          } else {
            assert.equal(
              act(state, FOREST_BED_IDS[0]).planted.length,
              0,
              'Seeds are required before planting.',
            );
            assert.equal(act(state, 'garden-gate').chapter, 'crossing');
            for (const id of FOREST_SEED_IDS)
              state = progress(state, { type: 'interact', id });
            const readyMoves = state.moves;
            for (const id of FOREST_BED_IDS) {
              state = progress(state, { type: 'interact', id });
              assert.equal(
                state.planted.length,
                0,
                'New gardens do not need duplicate planting clicks.',
              );
              assert.equal(
                state.moves,
                readyMoves,
                'Inspecting a flower does not bypass the water puzzle.',
              );
            }
            assert.ok(
              getForestView(state)
                .hotspots.filter((spot) => spot.kind === 'flower')
                .every((spot) => !spot.available),
              'Unfinished flower beds are scenery, not extra tasks before the puzzle.',
            );
            assert.equal(
              act(state, FOREST_BED_IDS[0]).watered.length,
              0,
              'Water is required before blooming.',
            );
            state = progress(state, { type: 'interact', id: 'garden-water' });
            assert.equal(
              state.hasWater,
              false,
              'A direct watering interaction cannot bypass the edition 2 puzzle.',
            );
            state = progress(state, {
              type: 'complete-craft',
              design: craftDesign,
            });
            assert.deepEqual(state.planted, [...FOREST_BED_IDS]);
            assert.deepEqual(state.watered, [...FOREST_BED_IDS]);
            assert.equal(
              state.gardenBloom,
              true,
              'Solving the water puzzle immediately blooms all three world flowers.',
            );
            assert.equal(
              state.moves,
              readyMoves + 1,
              'One completed puzzle, not six extra clicks, opens the garden.',
            );
            assert.ok(
              getForestView(state).hotspots.find(
                (spot) => spot.id === 'garden-gate',
              ).available,
            );
            assert.ok(
              getForestView(state)
                .hotspots.filter((spot) => spot.kind === 'flower')
                .every((spot) => spot.complete && !spot.available),
              'The displayed flowers agree with the completed puzzle.',
            );
            for (const id of FOREST_BED_IDS) {
              assert.strictEqual(
                act(state, id),
                state,
                'Bloomed flowers cannot grant progress twice.',
              );
            }
            assert.equal(state.gardenBloom, true);
            state = progress(state, { type: 'interact', id: 'garden-gate' });
          }
          assert.equal(state.chapter, 'grove');
          assert.equal(state.craftDesign, craftDesign);
          assert.strictEqual(
            transitionForest(state, {
              type: 'complete-craft',
              design: craftDesign === 'star' ? 'heart' : 'star',
            }),
            state,
            'A completed design is immutable.',
          );
          state = progress(state, { type: 'interact', id: 'secret-star' });
          assert.deepEqual(state.discoveries, [routeSecret, 'secret-star']);
          assert.strictEqual(
            act(state, 'bell-star'),
            state,
            'Owl dialogue precedes melody.',
          );
          state = progress(state, { type: 'choose-owl', choice: owl });
          const melody = getForestMelody(state);
          state = progress(state, { type: 'interact', id: melody[0] });
          const collectedBeforeRetry = [...state.collected];
          const wrongNote = story.FOREST_BELL_IDS.find(
            (id) => id !== melody[0] && id !== melody[1],
          );
          state = progress(state, { type: 'interact', id: wrongNote });
          assert.equal(state.melody, 0);
          assert.deepEqual(
            state.collected,
            collectedBeforeRetry,
            'A missed note never removes earned items.',
          );
          assert.equal(state.owlHelped, true);
          state = progress(state, { type: 'retry-melody' });
          for (const id of melody)
            state = progress(state, { type: 'interact', id });
          assert.equal(state.chapter, 'festival');
          assert.equal(state.route, route);
          assert.strictEqual(
            transitionForest(state, { type: 'choose-ending', choice: ending }),
            state,
            'All lanterns must be lit before the ending.',
          );
          for (const id of FOREST_LANTERN_IDS) {
            state = progress(state, { type: 'interact', id });
            assert.strictEqual(act(state, id), state);
          }
          state = progress(state, { type: 'choose-ending', choice: ending });
          assert.equal(state.chapter, 'complete');
          assert.equal(state.bridges, route === 'river');
          assert.equal(state.gardenBloom, route === 'garden');
          assert.equal(getForestView(state).progress, 100);
          assert.strictEqual(act(state, 'wood-fern'), state);
          const book = getForestEnding(state);
          assert.ok(book && book.paragraphs.length >= 5);
          assert.ok(book.title.includes(getForestCompanion(route)));
          assert.ok(
            book.paragraphs[1].includes(craftDesign === 'star' ? '별' : '하트'),
          );
          for (const id of state.discoveries)
            assert.ok(
              book.paragraphs.join(' ').includes(FOREST_DISCOVERIES[id].label),
            );
          assert.ok(
            book.paragraphs
              .slice(2)
              .every((page) => page.includes(getForestCompanion(route))),
            'The chosen companion stays with the child through grove, festival and ending.',
          );
          assert.equal(
            sanitizeForestState({ ...state, craftDesign: undefined }),
            null,
            'A completed edition 2 route requires a verified craft result.',
          );
          assert.equal(
            sanitizeForestState({ ...state, discoveries: [otherSecret] }),
            null,
          );
          assert.equal(
            book.reward,
            owl === 'listen' ? '반딧불 친구 배지' : '부엉이 합창단 배지',
          );
          finishedStories.add(JSON.stringify(book));
          assert.equal(sanitizeForestState({ ...state, lanterns: [] }), null);
          assert.equal(
            sanitizeForestState({ ...state, owlHelped: false }),
            null,
          );
        }
      }
    }
  }
  assert.equal(
    finishedStories.size,
    16,
    'Route, craft design, owl choice and ending produce sixteen distinct storybooks.',
  );
  assert.equal(
    getForestEnding(initialForestState()),
    null,
    'An unfinished adventure is not presented as a finished story.',
  );
  assert.equal(
    sanitizeForestState({
      ...initialForestState(),
      chapter: 'complete',
      ending: 'sky',
    }),
    null,
  );
  assert.equal(
    sanitizeForestState({
      ...initialForestState(),
      collected: ['wood-fern', 'wood-fern'],
    }),
    null,
  );
  assert.equal(
    sanitizeForestState({ ...initialForestState(), message: 'x'.repeat(501) }),
    null,
  );
  assert.equal(
    sanitizeForestState({ ...initialForestState(), moves: -1 }),
    null,
  );
  assert.equal(
    sanitizeForestState({ ...initialForestState(), route: 'ocean' }),
    null,
  );
  assert.equal(
    sanitizeForestState({ ...initialForestState(), route: ['undecided'] }),
    null,
  );
  assert.equal(
    sanitizeForestState({ ...initialForestState(), chapter: ['arrival'] }),
    null,
  );
  assert.equal(sanitizeForestState(null), null);
  for (const edition of [null, 1, 3, '2'])
    assert.equal(
      sanitizeForestState({ ...initialForestState(), edition }),
      null,
    );
  for (const craftDesign of ['square', null, 1])
    assert.equal(
      sanitizeForestState({ ...initialForestState(), craftDesign }),
      null,
    );
  for (const discoveries of [
    null,
    'secret-shell',
    ['unknown'],
    ['secret-shell', 'secret-shell'],
    ['secret-shell', 'secret-mushroom', 'secret-star'],
    ['secret-star'],
  ])
    assert.equal(
      sanitizeForestState({ ...initialForestState(), discoveries }),
      null,
    );
  // An earlier edition-2 backup may contain a solved water puzzle with only
  // some beds planted. Keep that previously valid in-progress save playable.
  let previousGarden = progress(initialForestState(), {
    type: 'choose-route',
    route: 'garden',
  });
  for (const id of FOREST_SEED_IDS)
    previousGarden = progress(previousGarden, { type: 'interact', id });
  previousGarden = roundTrip({
    ...previousGarden,
    craftDesign: 'heart',
    hasWater: true,
    planted: [FOREST_BED_IDS[0]],
    watered: [],
    gardenBloom: false,
    moves: previousGarden.moves + 2,
  });
  for (const id of FOREST_BED_IDS) {
    previousGarden = progress(previousGarden, { type: 'interact', id });
    if (!previousGarden.watered.includes(id))
      previousGarden = progress(previousGarden, { type: 'interact', id });
  }
  assert.equal(
    previousGarden.gardenBloom,
    true,
    'Previous partial garden backups can still finish.',
  );
  previousGarden = progress(previousGarden, {
    type: 'interact',
    id: 'garden-gate',
  });
  assert.equal(previousGarden.chapter, 'grove');
  // Legacy saves keep their old interactions and never silently gain an edition.
  for (const route of ['river', 'garden']) {
    let legacy = initialForestState();
    delete legacy.edition;
    delete legacy.discoveries;
    legacy = progress(legacy, { type: 'choose-route', route });
    for (const id of route === 'river' ? FOREST_WOOD_IDS : FOREST_SEED_IDS)
      legacy = progress(legacy, { type: 'interact', id });
    assert.strictEqual(
      transitionForest(legacy, { type: 'complete-craft', design: 'star' }),
      legacy,
    );
    assert.strictEqual(act(legacy, 'secret-star'), legacy);
    assert.equal(
      getForestView(legacy).hotspots.some((spot) => spot.kind === 'secret'),
      false,
    );
    legacy = progress(legacy, {
      type: 'interact',
      id: route === 'river' ? 'river-bridge' : 'garden-water',
    });
    if (route === 'garden')
      for (const id of FOREST_BED_IDS) {
        legacy = progress(legacy, { type: 'interact', id });
        legacy = progress(legacy, { type: 'interact', id });
      }
    legacy = progress(legacy, { type: 'interact', id: `${route}-gate` });
    legacy = progress(legacy, { type: 'choose-owl', choice: 'listen' });
    for (const id of getForestMelody(legacy))
      legacy = progress(legacy, { type: 'interact', id });
    for (const id of FOREST_LANTERN_IDS)
      legacy = progress(legacy, { type: 'interact', id });
    legacy = progress(legacy, { type: 'choose-ending', choice: 'sky' });
    assert.equal(legacy.chapter, 'complete');
    assert.equal(legacy.edition, undefined);
    assert.equal(getForestEnding(legacy).title, '달빛 숲에 우리 별이 떴어요');
  }
  console.log(
    'Forest story smoke passed: sixteen route/craft/owl/ending combinations, optional discoveries, persistent companions, puzzle bypass guards, immutable state, legacy progression and save validation.',
  );
} finally {
  await server.close();
}
