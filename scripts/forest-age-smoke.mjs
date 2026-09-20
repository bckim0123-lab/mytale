import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  cacheDir: 'node_modules/.vite-forest-age-test',
  root: process.cwd(),
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
});
try {
  const {
    initialForestState,
    transitionForest,
    getForestView,
    getForestMelody,
    getForestEnding,
    sanitizeForestState,
    FOREST_WOOD_IDS,
    FOREST_SEED_IDS,
    FOREST_BED_IDS,
    FOREST_BELL_IDS,
    FOREST_LANTERN_IDS,
  } = await server.ssrLoadModule('/app/forest-story.ts');
  const {
    createCompanionSave,
    sanitizeCompanionSave,
    serializeCompanionBackup,
    parseCompanionBackup,
  } = await server.ssrLoadModule('/app/companion-save.ts');
  let verified = 0;
  const booksByDifficulty = new Map();
  for (const difficulty of ['simple', 'standard', 'challenge']) {
    const books = new Set();
    for (const route of ['river', 'garden'])
      for (const owlChoice of ['listen', 'invite'])
        for (const ending of ['sky', 'home']) {
          let state = initialForestState(difficulty);
          function inspect() {
            assert.equal(
              state.difficulty,
              difficulty,
              'difficulty stays fixed throughout this adventure',
            );
            assert.deepEqual(
              sanitizeForestState(JSON.parse(JSON.stringify(state))),
              state,
              'state survives reload',
            );
            const view = getForestView(state);
            assert.ok(view.progress >= 0 && view.progress <= 100);
            if (difficulty === 'simple') {
              assert.ok(
                state.message.length <= 60,
                'short little-child dialogue: ' + state.message,
              );
              assert.ok(
                view.objective.length <= 65,
                'short little-child objective',
              );
              for (const choice of view.choices)
                assert.ok(choice.description.length <= 35);
            }
          }
          const event = (value) => {
            const before = JSON.stringify(state);
            const next = transitionForest(state, value);
            assert.equal(JSON.stringify(state), before, 'reducer is immutable');
            state = next;
            inspect();
          };
          const interact = (id) => event({ type: 'interact', id });
          inspect();
          interact('owl-welcome');
          event({ type: 'choose-route', route, difficulty: 'HACKED' });
          if (route === 'river') {
            interact('river-bridge'); // Missing branches gives gentle feedback.
            for (const id of FOREST_WOOD_IDS) interact(id);
            interact('river-bridge');
            event({
              type: 'complete-craft',
              design: owlChoice === 'listen' ? 'star' : 'heart',
            });
            interact('river-gate');
          } else {
            interact(FOREST_BED_IDS[0]); // The actual water puzzle opens the beds.
            for (const id of FOREST_SEED_IDS) interact(id);
            interact('garden-water');
            const movesBeforeCraft = state.moves;
            event({
              type: 'complete-craft',
              design: owlChoice === 'listen' ? 'star' : 'heart',
            });
            assert.equal(state.moves, movesBeforeCraft + 1);
            assert.deepEqual(state.planted, [...FOREST_BED_IDS]);
            assert.deepEqual(state.watered, [...FOREST_BED_IDS]);
            assert.equal(
              state.gardenBloom,
              true,
              'Every age opens the flower path by solving its actual water puzzle.',
            );
            interact('garden-gate');
          }
          interact('owl-grove');
          event({ type: 'choose-owl', choice: owlChoice });
          const melody = getForestMelody(state);
          const names = {
            'bell-dew': '물방울',
            'bell-leaf': '나뭇잎',
            'bell-star': '별빛',
          };
          const answerWords = melody.map((id) => names[id]).join(', ');
          assert.equal(
            state.message.includes(answerWords),
            difficulty === 'simple',
            'Only simple play displays the answer immediately; older children may request an explicit hint.',
          );
          const expectedLength =
            difficulty === 'simple'
              ? 2
              : difficulty === 'challenge'
                ? 5
                : owlChoice === 'invite'
                  ? 4
                  : 3;
          assert.equal(
            melody.length,
            expectedLength,
            'age-specific actual playable note count',
          );
          if (difficulty === 'challenge') {
            assert.deepEqual(
              melody,
              [...melody].reverse(),
              'five-note reflection puzzle',
            );
            assert.match(getForestView(state).objective, /규칙|가운데/);
          }
          interact('owl-grove');
          assert.ok(
            state.message.includes(answerWords),
            'owl recites actual age-specific melody',
          );
          const beforeMistake = {
            collected: [...state.collected],
            planted: [...state.planted],
            watered: [...state.watered],
            bridges: state.bridges,
            gardenBloom: state.gardenBloom,
          };
          interact(melody[0]);
          interact(
            FOREST_BELL_IDS.find((id) => id !== melody[0] && id !== melody[1]),
          );
          assert.equal(state.melody, 0, 'wrong note safely retries');
          for (const [key, value] of Object.entries(beforeMistake))
            assert.deepEqual(
              state[key],
              value,
              'wrong note never removes progress',
            );
          assert.equal(state.chapter, 'grove');
          event({ type: 'retry-melody' });
          for (let index = 0; index < melody.length; index++) {
            interact(melody[index]);
            assert.equal(
              state.chapter,
              index === melody.length - 1 ? 'festival' : 'grove',
              'not completed before exact melody length',
            );
          }
          for (const id of FOREST_LANTERN_IDS) interact(id);
          event({ type: 'choose-ending', choice: ending });
          assert.equal(state.chapter, 'complete');
          const book = getForestEnding(state);
          assert.equal(book.paragraphs.length, 5);
          assert.ok(
            book.paragraphs[2].includes(
              melody.map((id) => names[id]).join(', '),
            ),
            'book remembers actual melody',
          );
          if (difficulty === 'simple')
            assert.ok(
              book.paragraphs.every((text) => text.length <= 85),
              'short 5-page book',
            );
          const discoveries = [
            route === 'river' ? 'secret-shell' : 'secret-mushroom',
            'secret-star',
          ];
          const discovered = { ...state, discoveries };
          assert.deepEqual(sanitizeForestState(discovered), discovered);
          const discoveredBook = getForestEnding(discovered);
          assert.notDeepEqual(
            discoveredBook.paragraphs,
            book.paragraphs,
            'Optional discoveries change the keepsake without being required to finish.',
          );
          if (difficulty === 'simple')
            assert.ok(
              discoveredBook.paragraphs.every((text) => text.length <= 85),
              'Even a fully explored little-child book stays short.',
            );
          assert.ok(
            discoveredBook.paragraphs.every((text) => text.length <= 600),
            'All books fit the strict persistence contract without truncation.',
          );
          assert.ok(
            discoveredBook.paragraphs.at(-1).length <= 300,
            'The ending fits the persisted ending field.',
          );
          books.add(JSON.stringify(book));
          const save = { ...createCompanionSave(), forest: state };
          assert.equal(
            sanitizeCompanionSave(save).forest.difficulty,
            difficulty,
            'main save preserves difficulty',
          );
          const backup = serializeCompanionBackup(save);
          assert.equal(backup.ok, true);
          const imported = parseCompanionBackup(backup.json);
          assert.equal(imported.ok, true);
          assert.equal(
            imported.save.forest.difficulty,
            difficulty,
            'backup preserves difficulty',
          );
          assert.equal(
            sanitizeForestState({ ...state, melody: expectedLength + 1 }),
            null,
            'impossible melody progress rejected',
          );
          verified++;
        }
    assert.equal(
      books.size,
      8,
      'all choice combinations remain distinct at each reading level',
    );
    booksByDifficulty.set(difficulty, books);
  }
  const old = initialForestState();
  delete old.difficulty;
  delete old.edition;
  delete old.discoveries;
  assert.deepEqual(
    sanitizeForestState(old),
    old,
    'legacy save without field stays valid without mutation',
  );
  assert.deepEqual(getForestMelody({ ...old, owlChoice: 'listen' }), [
    'bell-dew',
    'bell-leaf',
    'bell-star',
  ]);
  assert.deepEqual(getForestMelody({ ...old, owlChoice: 'invite' }), [
    'bell-star',
    'bell-dew',
    'bell-leaf',
    'bell-star',
  ]);
  for (const difficulty of ['hard', '', null, 5, ['simple']])
    assert.equal(
      sanitizeForestState({ ...old, difficulty }),
      null,
      'invalid persisted difficulty rejected',
    );
  assert.notEqual(
    [...booksByDifficulty.get('simple')][0],
    [...booksByDifficulty.get('standard')][0],
  );
  assert.notEqual(
    [...booksByDifficulty.get('challenge')][0],
    [...booksByDifficulty.get('standard')][0],
  );
  console.log(
    'Forest age smoke passed: ' +
      verified +
      ' full adventures, actual 2/3-or-4/5-note melodies, no-penalty retries, short reading, distinct books, legacy and backup round trips.',
  );
} finally {
  await server.close();
}
