import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
  async function runExport(onList) {
    const saveRef = { current: structuredClone(saved) };
    let generation = 'before';
    const downloads = [];
    const statuses = [];
    const exportBackup = loadFunction(experienceAst, 'exportBackup', {
      saveRef,
      flush: async () => {},
      serializeCompanionBackup,
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
      validDrawingAsset: () => true,
      artworkId: async () => artwork.id,
      downloadLocalFile: (...args) => downloads.push(args),
      setBackupStatus: (value) => statuses.push(value),
      setBackupBusy: () => {},
      backupOperation: { current: false },
      artworkBusy: false,
    });
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
  const importBackup = loadFunction(experienceAst, 'importBackup', {
    pendingBackup: { save: saved, assets: [artwork] },
    backupOperation: { current: false },
    artworkBusy: false,
    artworkEpoch: { current: 0 },
    setBackupBusy: () => {},
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
  });
  await importBackup();
  assert.equal(importOptions.expectedGeneration, 'before');
  assert.equal(restored, false);
  assert.ok(importStatus.some((message) => message.includes('기록이 바뀌어')));

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
