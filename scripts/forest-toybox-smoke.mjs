import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  cacheDir: 'node_modules/.vite-forest-toybox-test',
  root: process.cwd(),
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false },
});
try {
  const {
    createForestToy,
    getForestToyView,
    movableToyPieces,
    toyTurnCount,
    transitionForestToy,
    turnedWaterPorts,
    GARDEN_PIPES,
    WATER_PORT,
  } = await server.ssrLoadModule('/app/forest-toybox-engine.ts');
  const { default: ForestToybox } = await server.ssrLoadModule(
    '/app/forest-toybox.tsx',
  );
  const expectedPieces = { simple: 2, standard: 3, challenge: 4 };
  let statesChecked = 0;
  for (const kind of ['bridge', 'garden'])
    for (const difficulty of ['simple', 'standard', 'challenge']) {
      const original = createForestToy(kind, difficulty);
      const originalJson = JSON.stringify(original);
      assert.equal(original.stage, 'puzzle');
      assert.equal(getForestToyView(original).solved, false);
      assert.equal(
        movableToyPieces(original).length,
        expectedPieces[difficulty],
      );
      assert.equal(
        transitionForestToy(original, { type: 'finish' }),
        original,
        'Unsolved toys cannot be completed.',
      );
      assert.equal(
        transitionForestToy(original, { type: 'design', design: 'heart' }),
        original,
        'Decoration cannot skip the hands-on puzzle.',
      );
      for (const index of [-1, 99, 0.5, NaN])
        assert.equal(
          transitionForestToy(original, { type: 'rotate', index }),
          original,
        );
      assert.equal(
        transitionForestToy(original, {
          type: 'rotate',
          index: movableToyPieces(original)[0],
          direction: 0,
        }),
        original,
      );
      if (kind === 'garden') {
        assert.equal(
          transitionForestToy(original, { type: 'rotate', index: 4 }),
          original,
          'A fixed water junction cannot be moved.',
        );
        assert.equal(
          transitionForestToy(original, { type: 'rotate', index: 0 }),
          original,
          'Decorative garden squares cannot be moved.',
        );
      }
      let hinted = transitionForestToy(original, { type: 'hint' });
      assert.equal(hinted.hintsUsed, 1);
      assert.deepEqual(
        hinted.turns,
        original.turns,
        'Looking at a hint does not secretly solve a tile.',
      );
      const hint = getForestToyView(hinted);
      for (let step = 0; step < hint.hintSteps; step += 1)
        hinted = transitionForestToy(hinted, {
          type: 'rotate',
          index: hint.hintIndex,
        });
      assert.notEqual(
        getForestToyView(hinted).hintIndex,
        hint.hintIndex,
        'The shown count of clockwise turns actually aligns the hinted piece.',
      );

      let solved = original;
      let assists = 0;
      while (solved.stage === 'puzzle') {
        solved = transitionForestToy(solved, { type: 'assist' });
        assists += 1;
        assert.ok(
          assists <= expectedPieces[difficulty],
          'Explicit assistance always has a bounded, accessible path to completion.',
        );
      }
      assert.equal(solved.stage, 'design');
      assert.equal(solved.assistedPieces, assists);
      assert.equal(getForestToyView(solved).solved, true);
      assert.equal(
        transitionForestToy(solved, { type: 'finish' }),
        solved,
        'Solved puzzles still require an explicit decoration choice.',
      );
      assert.equal(
        transitionForestToy(solved, { type: 'design', design: 'other' }),
        solved,
      );
      for (const design of ['star', 'heart']) {
        const selected = transitionForestToy(solved, {
          type: 'design',
          design,
        });
        assert.equal(
          selected.stage,
          'design',
          'Choosing a decoration does not close or finish the game.',
        );
        const complete = transitionForestToy(selected, { type: 'finish' });
        assert.equal(complete.stage, 'complete');
        assert.equal(complete.design, design);
        assert.equal(
          transitionForestToy(complete, { type: 'finish' }),
          complete,
          'Completion is idempotent.',
        );
        assert.equal(
          transitionForestToy(complete, {
            type: 'rotate',
            index: movableToyPieces(complete)[0],
          }),
          complete,
        );
        assert.equal(transitionForestToy(complete, { type: 'hint' }), complete);
        assert.deepEqual(
          transitionForestToy(complete, { type: 'restart' }),
          original,
        );
      }
      assert.equal(
        JSON.stringify(original),
        originalJson,
        'No transition mutates the previous puzzle snapshot.',
      );
      const index = movableToyPieces(original)[0];
      const reversed = transitionForestToy(original, {
        type: 'rotate',
        index,
        direction: -1,
      });
      assert.equal(
        reversed.turns[index],
        (original.turns[index] + toyTurnCount(original) - 1) %
          toyTurnCount(original),
      );

      const markup = renderToStaticMarkup(
        React.createElement(ForestToybox, {
          kind,
          difficulty,
          companionName: '<script>친구</script>',
          onComplete() {
            throw new Error('Rendering cannot complete play.');
          },
          onClose() {},
          sound: false,
        }),
      );
      assert.match(markup, /role="dialog"/);
      assert.match(markup, /aria-modal="true"/);
      assert.match(markup, /힌트 보기/);
      assert.match(markup, /처음부터 해 보기/);
      assert.match(markup, /시간 제한도/);
      assert.equal(markup.includes('<script>'), false);
      assert.doesNotMatch(markup, /<iframe|https:\/\/|<audio/);
      assert.equal(
        (
          markup.match(
            /aria-label="(?:\d+번 나무판|\d+번째 줄 \d+번째 물길) 돌리기/g,
          ) ?? []
        ).length,
        expectedPieces[difficulty],
      );
      assert.match(markup, kind === 'bridge' ? /ftb-plank/ : /ftb-flower/);
    }

  assert.equal(turnedWaterPorts(WATER_PORT.west, 1), WATER_PORT.north);
  assert.equal(
    turnedWaterPorts(WATER_PORT.north | WATER_PORT.east, -1),
    WATER_PORT.west | WATER_PORT.north,
  );
  assert.equal(
    turnedWaterPorts(15, 3),
    15,
    'Four-way fixed water junction stays connected.',
  );
  assert.equal(
    turnedWaterPorts(10, 2),
    10,
    'Straight water pieces accept their opposite orientation.',
  );

  // Exhaustively verify every challenge orientation against an independent
  // geometry oracle, so a bright tile alone cannot falsely count as a solved path.
  for (const kind of ['bridge', 'garden']) {
    const initial = createForestToy(kind, 'challenge');
    const movable = movableToyPieces(initial);
    const count = toyTurnCount(initial);
    for (let variant = 0; variant < count ** movable.length; variant += 1) {
      const turns = [...initial.turns];
      let value = variant;
      for (const index of movable) {
        turns[index] = value % count;
        value = Math.floor(value / count);
      }
      const state = { ...initial, turns };
      const expected =
        kind === 'bridge'
          ? turns.every((turn) => turn % 4 === 0)
          : movable.every(
              (index) =>
                turnedWaterPorts(GARDEN_PIPES[index], turns[index]) ===
                GARDEN_PIPES[index],
            );
      const view = getForestToyView(state);
      assert.equal(
        view.solved,
        expected,
        `${kind} connectivity at orientation ${variant}`,
      );
      if (kind === 'garden')
        assert.equal(view.solved, view.flowers.every(Boolean));
      statesChecked += 1;
    }
  }
  assert.equal(createForestToy('bad', 'bad').kind, 'bridge');
  assert.equal(createForestToy('bad', 'bad').difficulty, 'standard');
  console.log(
    `Forest toybox passed: two distinct puzzles × three difficulties, ${statesChecked} orientation/connectivity states, explicit hints and assistance, decoration/finish guards, idempotence, restart, immutability and accessible server markup.`,
  );
} finally {
  await server.close();
}
