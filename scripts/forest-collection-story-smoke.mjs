import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  cacheDir: 'node_modules/.vite-forest-collection-test',
  root: process.cwd(),
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true, entries: [] },
  server: { middlewareMode: true },
});
try {
  const {
    FOREST_SEED_IDS,
    initialForestState,
    transitionForest,
    getForestView,
    sanitizeForestState,
  } = await server.ssrLoadModule('/app/forest-story.ts');
  const colors = new Map([
    ['seed-peach', '복숭아빛'],
    ['seed-mint', '민트빛'],
    ['seed-gold', '꿀빛'],
  ]);
  function permutations(values) {
    if (!values.length) return [[]];
    return values.flatMap((value) =>
      permutations(values.filter((candidate) => candidate !== value)).map(
        (rest) => [value, ...rest],
      ),
    );
  }
  let checked = 0;
  for (const difficulty of ['simple', 'standard', 'challenge']) {
    const firstReactions = new Set();
    for (const order of permutations([...FOREST_SEED_IDS])) {
      let state = transitionForest(initialForestState(difficulty), {
        type: 'choose-route',
        route: 'garden',
      });
      const messages = new Set();
      for (const [index, id] of order.entries()) {
        const before = JSON.stringify(state);
        const next = transitionForest(state, { type: 'interact', id });
        assert.equal(JSON.stringify(state), before);
        assert.equal(next.moves, state.moves + 1);
        assert.deepEqual(next.collected, order.slice(0, index + 1));
        assert.equal(next.chapter, 'crossing');
        assert.equal(next.gardenBloom, false);
        assert.equal(next.hasWater, false);
        assert.deepEqual(next.planted, []);
        assert.deepEqual(next.watered, []);
        assert.ok(next.message.includes(colors.get(id)));
        assert.ok(next.message.includes('포포'));
        assert.match(
          next.message,
          index === 0 ? /두 개/ : index === 1 ? /하나/ : /세 개.*물길/,
        );
        assert.ok(!/[—–]/u.test(next.message));
        if (difficulty === 'simple') assert.ok(next.message.length <= 60);
        assert.equal(
          transitionForest(next, { type: 'interact', id }),
          next,
          'A repeated pickup must not replace the latest reaction or count twice.',
        );
        assert.deepEqual(
          sanitizeForestState(JSON.parse(JSON.stringify(next))),
          next,
        );
        assert.equal(getForestView(next).dialogue, next.message);
        messages.add(next.message);
        if (index === 0) firstReactions.add(next.message);
        state = next;
        checked += 1;
      }
      assert.equal(
        messages.size,
        3,
        'Every real pickup changes the story response.',
      );
      assert.equal(
        getForestView(state).hotspots.find((spot) => spot.id === 'garden-water')
          ?.available,
        true,
      );
    }
    assert.equal(
      firstReactions.size,
      3,
      'A seed can be found first in any order.',
    );
  }
  let legacy = initialForestState();
  delete legacy.edition;
  legacy = transitionForest(legacy, { type: 'choose-route', route: 'garden' });
  legacy = transitionForest(legacy, { type: 'interact', id: 'seed-mint' });
  assert.equal(
    legacy.message,
    '손바닥에 쏙 들어오는 씨앗이야. 빈 화단에 심으면 어떤 꽃이 될까?',
    'Legacy planting instructions retain their original meaning.',
  );
  console.log(
    `Forest collection story passed: ${checked} real pickups across all seed orders and ages; distinct truthful colors/counts, next objective, duplicate guards, unchanged gameplay and legacy saves.`,
  );
} finally {
  await server.close();
}
