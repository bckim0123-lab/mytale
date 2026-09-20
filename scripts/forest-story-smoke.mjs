import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
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
  for (const route of ['river', 'garden']) {
    for (const owl of ['listen', 'invite']) {
      for (const ending of ['sky', 'home']) {
        let state = roundTrip(initialForestState());
        assert.strictEqual(act(state, 'river-gate'), state);
        assert.strictEqual(
          transitionForest(state, { type: 'choose-ending', choice: ending }),
          state,
        );
        state = progress(state, { type: 'choose-route', route });
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
          for (const id of FOREST_BED_IDS)
            state = progress(state, { type: 'interact', id });
          assert.equal(
            act(state, FOREST_BED_IDS[0]).watered.length,
            0,
            'Water is required before blooming.',
          );
          state = progress(state, { type: 'interact', id: 'garden-water' });
          for (const id of FOREST_BED_IDS) {
            state = progress(state, { type: 'interact', id });
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
        assert.equal(
          book.reward,
          owl === 'listen' ? '반딧불 친구 배지' : '부엉이 합창단 배지',
        );
        finishedStories.add(JSON.stringify(book));
        assert.equal(sanitizeForestState({ ...state, lanterns: [] }), null);
        assert.equal(sanitizeForestState({ ...state, owlHelped: false }), null);
      }
    }
  }
  assert.equal(
    finishedStories.size,
    8,
    'Route, owl choice and ending produce eight distinct storybooks.',
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
  console.log(
    'Forest story smoke passed: two distinct routes, eight endings, guarded progression, gentle melody retry and save validation.',
  );
} finally {
  await server.close();
}
