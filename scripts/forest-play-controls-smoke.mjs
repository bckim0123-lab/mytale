import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  cacheDir: 'node_modules/.vite-forest-play-controls-test',
  root: process.cwd(),
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
});

try {
  const { forestToyFor, forestToyStillCurrent } = await server.ssrLoadModule(
    '/app/forest-play-controls.ts',
  );
  const {
    initialForestState,
    transitionForest,
    sanitizeForestState,
    FOREST_WOOD_IDS,
    FOREST_SEED_IDS,
    FOREST_BED_IDS,
  } = await server.ssrLoadModule('/app/forest-story.ts');
  const act = (state, id) => transitionForest(state, { type: 'interact', id });
  const choose = (route, difficulty = 'standard') =>
    transitionForest(initialForestState(difficulty), {
      type: 'choose-route',
      route,
    });
  const ready = (route, difficulty = 'standard') =>
    (route === 'river' ? FOREST_WOOD_IDS : FOREST_SEED_IDS).reduce(
      act,
      choose(route, difficulty),
    );
  const open = (state, kind) => ({
    kind,
    moves: state.moves,
    stateKey: JSON.stringify(state),
  });
  const assertValid = (state) =>
    assert.deepEqual(sanitizeForestState(structuredClone(state)), state);
  let checked = 0;
  for (const difficulty of ['simple', 'standard', 'challenge']) {
    for (const route of ['river', 'garden']) {
      const kind = route === 'river' ? 'bridge' : 'garden';
      const gate = route === 'river' ? 'river-bridge' : 'garden-water';
      const otherGate = route === 'river' ? 'garden-water' : 'river-bridge';
      const materialIds = route === 'river' ? FOREST_WOOD_IDS : FOREST_SEED_IDS;
      let state = choose(route, difficulty);
      assert.equal(forestToyFor(initialForestState(difficulty), gate), null);
      for (const id of materialIds) {
        assert.equal(
          forestToyFor(state, gate),
          null,
          'all materials are required',
        );
        state = act(state, id);
      }
      assertValid(state);
      assert.equal(forestToyFor(state, gate), kind);
      for (const id of [
        otherGate,
        'owl-welcome',
        'secret-star',
        'unknown',
        '',
      ]) {
        assert.equal(
          forestToyFor(state, id),
          null,
          'only the selected route gate opens',
        );
      }
      const legacy = structuredClone(state);
      delete legacy.edition;
      delete legacy.discoveries;
      assertValid(legacy);
      assert.equal(
        forestToyFor(legacy, gate),
        null,
        'legacy adventures do not acquire a new puzzle',
      );
      assert.equal(
        forestToyFor(
          { ...state, collected: [...state.collected, state.collected[0]] },
          gate,
        ),
        null,
        'unexpected extra materials cannot bypass the exact gate',
      );

      const opened = open(state, kind);
      const beforeState = JSON.stringify(state);
      const beforeOpened = JSON.stringify(opened);
      assert.equal(forestToyStillCurrent(state, opened), true);
      assert.equal(forestToyStillCurrent(structuredClone(state), opened), true);
      for (const stale of [
        { ...opened, kind: kind === 'bridge' ? 'garden' : 'bridge' },
        { ...opened, moves: opened.moves + 1 },
        { ...opened, moves: opened.moves - 1 },
        { ...opened, stateKey: '' },
        { ...opened, stateKey: undefined },
      ]) {
        assert.equal(
          forestToyStillCurrent(state, stale),
          false,
          'invalid opening receipt is rejected',
        );
      }
      const secretState = act(
        state,
        route === 'river' ? 'secret-shell' : 'secret-mushroom',
      );
      assertValid(secretState);
      assert.equal(
        forestToyStillCurrent(secretState, opened),
        false,
        'progress after opening invalidates the puzzle',
      );
      const otherDifficulty = {
        ...state,
        difficulty: difficulty === 'simple' ? 'challenge' : 'simple',
      };
      assertValid(otherDifficulty);
      assert.equal(
        forestToyStillCurrent(otherDifficulty, opened),
        false,
        'same-move imported settings cannot reuse an old puzzle',
      );
      const otherMessage = {
        ...state,
        message: '친구와 함께 천천히 해 볼까요?',
      };
      assertValid(otherMessage);
      assert.equal(
        forestToyStillCurrent(otherMessage, opened),
        false,
        'the complete captured state, not just its move count, must match',
      );

      for (const design of ['star', 'heart']) {
        const crafted = transitionForest(state, {
          type: 'complete-craft',
          design,
        });
        assertValid(crafted);
        assert.equal(crafted.craftDesign, design);
        if (route === 'garden') {
          assert.equal(crafted.gardenBloom, true);
          assert.deepEqual(crafted.planted, [...FOREST_BED_IDS]);
          assert.deepEqual(crafted.watered, [...FOREST_BED_IDS]);
        }
        assert.equal(
          forestToyFor(crafted, gate),
          null,
          'finished crafts cannot reopen',
        );
        assert.equal(forestToyStillCurrent(crafted, opened), false);
        assert.strictEqual(
          transitionForest(crafted, { type: 'complete-craft', design }),
          crafted,
          'completion is not replayable',
        );
      }
      for (const chapter of ['arrival', 'grove', 'festival', 'complete']) {
        assert.equal(forestToyFor({ ...state, chapter }, gate), null);
        assert.equal(
          forestToyStillCurrent({ ...state, chapter }, opened),
          false,
        );
      }
      assert.equal(
        JSON.stringify(state),
        beforeState,
        'gate checks do not mutate the adventure',
      );
      assert.equal(
        JSON.stringify(opened),
        beforeOpened,
        'gate checks do not mutate their receipt',
      );
      checked++;
    }
  }

  // Earlier edition-2 backups could contain planted beds before solving the
  // water puzzle. They remain valid and must not reuse another save's puzzle.
  const garden = ready('garden');
  const planted = {
    ...garden,
    planted: [FOREST_BED_IDS[0]],
    moves: garden.moves + 1,
  };
  const discovered = act(garden, 'secret-mushroom');
  assertValid(planted);
  assertValid(discovered);
  assert.equal(planted.moves, discovered.moves);
  assert.equal(forestToyFor(planted, 'garden-water'), 'garden');
  assert.equal(forestToyFor(discovered, 'garden-water'), 'garden');
  assert.equal(
    forestToyStillCurrent(discovered, open(planted, 'garden')),
    false,
  );
  assert.equal(
    forestToyStillCurrent(planted, open(discovered, 'garden')),
    false,
  );

  console.log(
    `Forest play controls passed: ${checked} route/difficulty gates; legacy, exact materials, completion, immutable receipts and equal-move restore guards.`,
  );
} finally {
  await server.close();
}
