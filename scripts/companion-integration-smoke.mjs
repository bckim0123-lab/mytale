import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createServer } from 'vite';

const experienceSource = await readFile('app/companion-experience.tsx', 'utf8');
const pageSource = await readFile('app/page.tsx', 'utf8');
const experienceAst = ts.createSourceFile(
  'companion-experience.tsx',
  experienceSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const pageAst = ts.createSourceFile(
  'page.tsx',
  pageSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

function nodes(ast, predicate) {
  const matches = [];
  const visit = (node) => {
    if (predicate(node)) matches.push(node);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return matches;
}
function loadFunction(ast, name, bindings) {
  const node = nodes(
    ast,
    (value) => ts.isFunctionDeclaration(value) && value.name?.text === name,
  )[0];
  assert.ok(node, `Expected actual UI function ${name}.`);
  const compiled = ts.transpileModule(node.getText(ast), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  // oxlint-disable-next-line typescript/no-implied-eval -- Execute only this repository's parsed UI function in a deterministic harness; user content is never code.
  return new Function(...Object.keys(bindings), `${compiled}\nreturn ${name};`)(
    ...Object.values(bindings),
  );
}
function called(ast, name) {
  return nodes(
    ast,
    (value) =>
      ts.isCallExpression(value) &&
      ts.isIdentifier(value.expression) &&
      value.expression.text === name,
  );
}
function objectKeys(node) {
  return ts.isObjectLiteralExpression(node)
    ? node.properties
        .map((property) => property.name?.getText())
        .filter(Boolean)
    : [];
}
function backupBindings(overrides) {
  const bindings = {
    mounted: { current: true },
    backupEpoch: { current: 0 },
    backupOperation: { current: false },
    artworkBusy: false,
    initialName: undefined,
    setBackupBusy: () => {},
    setSplitBackup: () => {},
    setSplitBackupOffered: () => {},
    setPendingBackup: () => {},
    ...overrides,
  };
  for (const name of [
    'backupMetadataKey',
    'backupIsCurrent',
    'assertBackupCurrent',
    'captureBackupState',
  ])
    bindings[name] = loadFunction(experienceAst, name, bindings);
  return bindings;
}

// The painted selection and the announced selection must identify the same
// friend. A saved fallback species is not selected while artwork is active.
const kindButton = nodes(
  experienceAst,
  (node) =>
    ts.isJsxOpeningElement(node) &&
    node.tagName.getText(experienceAst) === 'button' &&
    node.attributes.properties.some(
      (attribute) =>
        attribute.name?.getText(experienceAst) === 'key' &&
        attribute.initializer?.expression?.getText(experienceAst) === 'kind.id',
    ),
)[0];
assert.ok(kindButton, 'Actual prepared-friend selection button exists.');
const kindAttribute = (name, bindings) => {
  const attribute = kindButton.attributes.properties.find(
    (item) => item.name?.getText(experienceAst) === name,
  );
  assert.ok(
    attribute?.initializer?.expression,
    `Actual ${name} expression exists.`,
  );
  const expression = attribute.initializer.expression.getText(experienceAst);
  return runInNewContext(`(${expression})`, bindings);
};
for (const drawingAssetId of [undefined, 'a'.repeat(64)]) {
  for (const savedKind of ['sprout', 'bunny', 'cat', 'bear']) {
    let selectedCount = 0;
    for (const id of ['sprout', 'bunny', 'cat', 'bear']) {
      const bindings = {
        kind: { id },
        save: { appearance: { kind: savedKind, drawingAssetId } },
      };
      const selected = !drawingAssetId && savedKind === id;
      assert.equal(kindAttribute('aria-pressed', bindings), selected);
      assert.equal(
        kindAttribute('className', bindings).includes('is-selected'),
        selected,
        `Visible selection matches active friend: ${savedKind}/${id}/${!!drawingAssetId}`,
      );
      if (selected) selectedCount += 1;
    }
    assert.equal(selectedCount, drawingAssetId ? 0 : 1);
  }
}

const server = await createServer({
  configFile: false,
  cacheDir: 'node_modules/.vite-companion-integration-test',
  root: process.cwd(),
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false },
});
try {
  const {
    createCompanionSave,
    sanitizeCompanionSave,
    persistCompanionSave,
    readCompanionSave,
    serializeCompanionBackup,
    parseCompanionBackup,
    clearCompanionSave,
  } = await server.ssrLoadModule('/app/companion-save.ts');
  const { initialForestState } = await server.ssrLoadModule(
    '/app/forest-story.ts',
  );
  const { CompanionStorageSession } = await server.ssrLoadModule(
    '/app/companion-storage-session.ts',
  );
  const artwork = {
    id: 'a'.repeat(64),
    png: 'TEST_FINISHED_CHARACTER',
    createdAt: 1,
    name: '달콩',
    persona: {
      likes: '별',
      traits: '상냥해',
      ability: '빛내기',
      quirk: '쫑긋',
    },
  };
  const saved = createCompanionSave({
    name: '책을 만든 날의 이름',
    appearance: {
      kind: 'bunny',
      bodyColor: '#ffeeaa',
      accentColor: '#aaffee',
      accessory: 'star',
      drawingAssetId: artwork.id,
    },
    storyBooks: [
      {
        id: 'book-1',
        title: '우리의 숲',
        pages: ['함께 걸었어요.'],
        ending: '함께여서 즐거웠어요.',
        createdAt: 1,
        heroAppearance: {
          kind: 'bunny',
          bodyColor: '#ffeeaa',
          accentColor: '#aaffee',
          accessory: 'star',
          drawingAssetId: artwork.id,
        },
      },
    ],
  });

  // Execute the actual nested UI function rather than a reimplementation.
  async function runExport(onList, pngLength = artwork.png.length) {
    const saveRef = { current: structuredClone(saved) };
    let generation = 'before';
    const downloads = [];
    const statuses = [];
    const exportBackup = loadFunction(
      experienceAst,
      'exportBackup',
      backupBindings({
        saveRef,
        flushCharacterName: async () => true,
        flush: async () => {},
        serializeCompanionBackup,
        createCompanionSave,
        sanitizeCompanionSave,
        readCompanionSave: () => ({
          status: 'ready',
          save: saveRef.current,
          snapshot: { generation, revision: 1, save: saveRef.current },
        }),
        listDrawingAssets: async () =>
          onList({
            saveRef,
            reset: () => {
              generation = 'after';
              saveRef.current = createCompanionSave();
            },
          }),
        listDrawingAssetMetadata: async () => [{ id: artwork.id, pngLength }],
        validDrawingAsset: () => true,
        artworkId: async () => artwork.id,
        downloadLocalFile: (...args) => downloads.push(args),
        setBackupStatus: (value) => statuses.push(value),
        setBackupBusy: () => {},
        backupOperation: { current: false },
        artworkBusy: false,
      }),
    );
    await exportBackup();
    return { downloads, statuses };
  }
  const exported = await runExport(async () => [artwork]);
  assert.equal(exported.downloads.length, 1);
  const portable = JSON.parse(exported.downloads[0][1]);
  assert.equal(portable.record.save.name, saved.name);
  assert.equal(
    portable.record.save.storyBooks[0].heroAppearance.drawingAssetId,
    artwork.id,
  );
  assert.deepEqual(portable.assets[0].persona, artwork.persona);
  const oversizedExport = await runExport(
    async () => {
      throw new Error('Full PNG read must not begin for an oversized library');
    },
    32 * 1024 * 1024 + 1,
  );
  assert.equal(oversizedExport.downloads.length, 0);
  assert.match(oversizedExport.statuses.at(-1), /32MB/);
  const rescueDownloads = [];
  const noStorage = () => {
    throw new Error('Storage inaccessible');
  };
  const rescue = loadFunction(
    experienceAst,
    'exportRecoveryRecord',
    backupBindings({
      saveRef: { current: saved },
      serializeCompanionBackup,
      flush: noStorage,
      readCompanionSave: noStorage,
      listDrawingAssets: noStorage,
      downloadLocalFile: (...args) => rescueDownloads.push(args),
      setBackupStatus: () => {},
    }),
  );
  rescue();
  assert.equal(
    rescueDownloads.length,
    1,
    'rescue works without any browser storage read/write',
  );
  const rescued = parseCompanionBackup(rescueDownloads[0][1]);
  assert.equal(rescued.ok, true);
  assert.equal(rescued.save.name, saved.name);
  assert.equal(rescued.save.appearance.drawingAssetId, artwork.id);
  assert.deepEqual(
    rescued.save.storyBooks,
    saved.storyBooks,
    'all story text and hero artwork links survive',
  );
  assert.match(
    rescueDownloads[0][0],
    /그림별도/,
    'incomplete artwork status is explicit in file name',
  );
  for (const available of [[], [artwork]]) {
    let pending = null;
    const statuses = [];
    const inspect = loadFunction(
      experienceAst,
      'inspectBackup',
      backupBindings({
        parseCompanionBackup,
        listDrawingAssets: async () => available,
        setPendingBackup: (value) => {
          pending = value;
        },
        setBackupStatus: (value) => statuses.push(value),
        backupInput: { current: null },
      }),
    );
    await inspect({
      size: rescueDownloads[0][1].length,
      text: async () => rescueDownloads[0][1],
    });
    assert.equal(
      Boolean(pending),
      available.length > 0,
      'metadata import cannot silently omit required hero art',
    );
    if (!available.length) assert.match(statuses.at(-1), /필요한 친구 그림/);
  }
  const missing = await runExport(async () => []);
  assert.equal(
    missing.downloads.length,
    0,
    'Export cannot omit a book hero image.',
  );
  const resetDuringExport = await runExport(async ({ reset }) => {
    reset();
    return [];
  });
  assert.equal(
    resetDuringExport.downloads.length,
    0,
    'Reset during export must not combine an old record with a new empty artwork generation.',
  );

  // The import UI must not restore metadata if a reset happened while artwork was written.
  let importGeneration = 'before';
  let restored = false;
  let importOptions;
  const importStatus = [];
  const importBackup = loadFunction(
    experienceAst,
    'importBackup',
    backupBindings({
      MAX_COMPANION_BOOKS: 100,
      pendingBackup: { save: saved, assets: [artwork] },
      backupOperation: { current: false },
      artworkBusy: false,
      artworkEpoch: { current: 0 },
      setBackupBusy: () => {},
      flush: async () => {},
      readCompanionSave: () => ({
        status: 'ready',
        save: saved,
        snapshot: { generation: importGeneration, revision: 1, save: saved },
      }),
      putDrawingAssets: async (_assets, options) => {
        importOptions = options;
        importGeneration = 'after';
      },
      restoreSave: async () => {
        restored = true;
        return { ok: true };
      },
      listDrawingAssets: async () => [artwork],
      setArtLibrary: () => {},
      setPendingBackup: () => {},
      setBackupStatus: (value) => importStatus.push(value),
    }),
  );
  await importBackup();
  assert.equal(importOptions.expectedGeneration, 'before');
  assert.equal(restored, false);
  assert.ok(importStatus.some((message) => message.includes('기록이 바뀌어')));

  for (const mode of [
    'full',
    'restore-failed',
    'library-failed',
    'missing-art',
    'changed-record',
    'success',
  ]) {
    let assetWrites = 0,
      recordWrites = 0,
      cleared = false;
    const statuses = [];
    const currentSave = {
      ...saved,
      storyBooks:
        mode === 'full'
          ? Array.from({ length: 100 }, (_, index) => ({
              id: `existing-${index}`,
            }))
          : saved.storyBooks,
    };
    const incomingSave = {
      ...saved,
      storyBooks: mode === 'full' ? [{ id: 'new-book' }] : saved.storyBooks,
    };
    const execute = loadFunction(
      experienceAst,
      'importBackup',
      backupBindings({
        MAX_COMPANION_BOOKS: 100,
        pendingBackup: { save: incomingSave, assets: [artwork] },
        backupOperation: { current: false },
        artworkBusy: false,
        artworkEpoch: { current: 0 },
        setBackupBusy: () => {},
        flush: async () => {},
        readCompanionSave: () => ({
          status: 'ready',
          save: currentSave,
          snapshot: {
            generation: 'stable',
            revision: mode === 'changed-record' && assetWrites ? 2 : 1,
            save: currentSave,
          },
        }),
        putDrawingAssets: async (_assets, options) => {
          assetWrites++;
          assert.equal(options.cancelled(), false);
        },
        readDrawingAsset: async () => (mode === 'missing-art' ? null : artwork),
        restoreSave: async (incoming, options) => {
          recordWrites++;
          assert.equal(
            incoming.name,
            artwork.name,
            'Active friend uses the preserved library name',
          );
          assert.deepEqual(
            incoming.persona,
            artwork.persona,
            'Active friend uses the preserved library persona',
          );
          assert.deepEqual(
            incoming.storyBooks,
            incomingSave.storyBooks,
            'Historical book identity is not rewritten',
          );
          assert.equal(options.expectedRevision, 1);
          return mode === 'restore-failed'
            ? { ok: false, error: '저장 공간이 부족해요.' }
            : { ok: true };
        },
        listDrawingAssetMetadata: async () => {
          if (mode === 'library-failed') throw new Error('read failed');
          return [artwork];
        },
        setArtLibrary: () => {},
        setPendingBackup: (value) => {
          cleared = value === null;
        },
        setBackupStatus: (value) => statuses.push(value),
      }),
    );
    await execute();
    assert.equal(
      assetWrites,
      mode === 'full' ? 0 : 1,
      'Book capacity is checked before any artwork write',
    );
    assert.equal(
      recordWrites,
      ['full', 'missing-art', 'changed-record'].includes(mode) ? 0 : 1,
    );
    assert.equal(
      cleared,
      ['library-failed', 'success'].includes(mode),
      'A committed restore is not offered again after a display-only failure',
    );
    assert.match(
      statuses.at(-1),
      {
        full: /아직 그림이나 기록을 바꾸지 않았어요/,
        'restore-failed': /새로 가져온 그림은 보관함에 남아 있을 수 있어요/,
        'library-failed': /기록은 가져왔지만/,
        'missing-art': /가져올 친구의 그림을 확인하지 못했어요/,
        'changed-record': /다른 창에서 기록이 바뀌어/,
        success: /이미 있는 그림의 이름과 취향은 유지/,
      }[mode],
    );
  }

  // Revision checking must happen after the awaited flush, not just in the UI.
  {
    const memory = new Map();
    const storage = {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => memory.set(key, value),
      removeItem: (key) => memory.delete(key),
    };
    const session = new CompanionStorageSession({ storage });
    session.hydrate();
    const before = readCompanionSave(storage).snapshot;
    const importing = session.restoreSave(saved, {
      expectedGeneration: before.generation,
      expectedRevision: before.revision,
    });
    const other = new CompanionStorageSession({ storage });
    other.hydrate();
    other.commitSave(createCompanionSave({ name: '다른 창의 새 이름' }));
    await other.flush();
    const latest = JSON.stringify([...memory]);
    const result = await importing;
    assert.equal(
      result.ok,
      false,
      'Concurrent record changes must cancel the stale import',
    );
    assert.equal(
      JSON.stringify([...memory]),
      latest,
      'Rejected import preserves the latest record',
    );
  }

  // Wiring guards are AST-based; extraction above tests behavior, not just wording.
  const kept = called(experienceAst, 'keepDrawingAsset');
  assert.equal(kept.length, 1);
  assert.ok(objectKeys(kept[0].arguments[2]).includes('expectedGeneration'));
  assert.ok(objectKeys(kept[0].arguments[2]).includes('cancelled'));
  assert.ok(objectKeys(kept[0].arguments[2]).includes('persona'));
  const cleared = called(experienceAst, 'clearDrawingAssets');
  assert.equal(cleared.length, 1);
  const clearOptions = cleared[0].arguments[0];
  assert.ok(objectKeys(clearOptions).includes('expectedGeneration'));
  const preserve = clearOptions.properties.find(
    (property) => property.name?.getText() === 'preserveCurrentGeneration',
  );
  assert.equal(
    preserve.initializer.kind,
    ts.SyntaxKind.TrueKeyword,
    'Reset cleanup preserves imports made in the new generation.',
  );
  assert.ok(
    nodes(
      experienceAst,
      (node) =>
        ts.isPropertyAssignment(node) &&
        node.name.getText() === 'persona' &&
        node.initializer.getText() === 'asset.persona',
    ).length > 0,
    'Choosing a saved friend restores that same friend’s persona.',
  );

  // A reset can occur after the UI's generation check but during restoreSave's
  // awaited flush. Exercise the real controller, not just the UI mock above.
  for (const explicitGeneration of [true, false]) {
    const memory = new Map();
    const storage = {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => memory.set(key, value),
      removeItem: (key) => memory.delete(key),
    };
    const session = new CompanionStorageSession({ storage });
    session.hydrate();
    const generation = readCompanionSave(storage).snapshot.generation;
    const importing = session.restoreSave(
      saved,
      explicitGeneration ? { expectedGeneration: generation } : undefined,
    );
    assert.equal(clearCompanionSave(storage).ok, true);
    const tombstone = JSON.stringify([...memory]);
    const result = await importing;
    assert.equal(
      result.ok,
      false,
      'Reset wins while restoreSave is awaiting its flush.',
    );
    assert.equal(
      JSON.stringify([...memory]),
      tombstone,
      'A cancelled old-generation import cannot replace the reset tombstone.',
    );
    assert.equal(readCompanionSave(storage).status, 'empty');
    await session.reloadLatest();
    assert.equal(
      (
        await session.restoreSave(saved, {
          expectedGeneration: readCompanionSave(storage).snapshot.generation,
        })
      ).ok,
      true,
      'A new explicit import after reset remains possible.',
    );
  }

  async function runArchive(imageSource) {
    const storybook = [
      {
        title: '첫 만남',
        body: '친구와 만났어요.',
        quote: '안녕!',
        clue: '별 조각',
      },
      { title: '함께 집으로', body: '같이 걸었어요.' },
    ];
    const source = {
      id: 'illustrated-source',
      pages: storybook,
      image: imageSource === 'ai' ? artwork.png : 'PRIVATE_ORIGINAL_PHOTO',
      imageSource,
      heroName: '그때의 달콩',
      heroPersona: artwork.persona,
      title: '반짝 모험',
      theme: 0,
    };
    let storedRecord;
    let keepOptions;
    let keepCount = 0;
    const archive = loadFunction(pageAst, 'archiveIllustratedBook', {
      savedStorybooks: [source],
      storybook,
      archivingBook: { current: false },
      setBookArchiving: () => {},
      setBookArchiveStatus: () => {},
      readCompanionSave: () => ({
        status: 'ready',
        save: saved,
        snapshot: {
          generation: 'archive-generation',
          revision: 1,
          save: saved,
        },
      }),
      createCompanionSave,
      portableArtwork: async (png) => png,
      keepDrawingAsset: async (_png, _name, options) => {
        keepCount += 1;
        keepOptions = options;
        return artwork;
      },
      adventureStories: [
        { reward: '별빛을 집까지 데려왔어요.', color: 'space' },
      ],
      persistCompanionSave: async (record, options) => {
        storedRecord = { record, options };
        return { ok: true };
      },
    });
    await archive();
    return { storedRecord, keepCount, keepOptions };
  }
  const archived = await runArchive('ai');
  assert.equal(archived.keepOptions.expectedGeneration, 'archive-generation');
  assert.deepEqual(
    archived.keepOptions.persona,
    artwork.persona,
    'Archiving an existing hero must not erase its saved persona.',
  );
  assert.equal(
    archived.storedRecord.options.base.generation,
    'archive-generation',
  );
  const archivedBook = archived.storedRecord.record.storyBooks[0];
  assert.equal(archivedBook.heroName, '그때의 달콩');
  assert.equal(archivedBook.heroAppearance.drawingAssetId, artwork.id);
  assert.deepEqual(archivedBook.chapterTitles, ['첫 만남', '함께 집으로']);
  assert.equal(archivedBook.illustrationTheme, 'space');
  assert.match(archivedBook.pages[0], /안녕!/);
  assert.match(archivedBook.pages[0], /별 조각/);
  const localArchive = await runArchive('local');
  assert.equal(
    localArchive.keepCount,
    0,
    'An original-photo/local preview must never enter the saved artwork DB.',
  );
  assert.equal(
    JSON.stringify(localArchive.storedRecord).includes(
      'PRIVATE_ORIGINAL_PHOTO',
    ),
    false,
  );

  for (const difficulty of ['simple', 'standard', 'challenge']) {
    const memory = new Map();
    const storage = {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => memory.set(key, value),
      removeItem: (key) => memory.delete(key),
    };
    const game = createCompanionSave({
      ...saved,
      playDifficulty: difficulty,
      forest: initialForestState(difficulty),
    });
    const result = await persistCompanionSave(game, {
      storage,
      base: readCompanionSave(storage).snapshot,
    });
    assert.equal(result.ok, true);
    assert.equal(readCompanionSave(storage).save.playDifficulty, difficulty);
    assert.equal(readCompanionSave(storage).save.forest.difficulty, difficulty);
    const backup = serializeCompanionBackup(result.save);
    assert.equal(backup.ok, true);
    assert.equal(
      parseCompanionBackup(backup.json).save.playDifficulty,
      difficulty,
    );
  }
  console.log(
    'Companion integration passed: actual export/import/archive UI functions, generation/reset safety, complete hero assets/personas, original-photo exclusion, reset-preserve wiring and all three play-difficulty roundtrips.',
  );
} finally {
  await server.close();
}
