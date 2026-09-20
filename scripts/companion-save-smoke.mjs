import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  cacheDir: 'node_modules/.vite-save-test',
  root: process.cwd(),
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
});

class MemoryStorage {
  values = new Map();
  getItem(key) {
    return this.values.get(key) ?? null;
  }
  setItem(key, value) {
    this.values.set(key, value);
  }
  removeItem(key) {
    this.values.delete(key);
  }
}

try {
  const {
    COMPANION_SAVE_KEY,
    createCompanionSave,
    loadCompanionSave,
    saveCompanionSave,
    clearCompanionSave,
    safeAppearance,
    readCompanionSave,
    persistCompanionSave,
    resetCompanionSave,
    serializeCompanionBackup,
    parseCompanionBackup,
    sanitizeCompanionSave,
    MAX_COMPANION_SAVE_BYTES,
  } = await server.ssrLoadModule('/app/companion-save.ts');
  const { initialForestState, transitionForest } = await server.ssrLoadModule(
    '/app/forest-story.ts',
  );
  const { CompanionStorageSession } = await server.ssrLoadModule(
    '/app/companion-storage-session.ts',
  );
  const storage = new MemoryStorage();
  const fresh = createCompanionSave();
  assert.equal(
    loadCompanionSave(storage),
    null,
    'An empty browser must start without a save.',
  );
  assert.equal(loadCompanionSave(), null, 'SSR has no browser storage.');
  assert.equal(
    saveCompanionSave(fresh).ok,
    false,
    'SSR writes report unavailable storage.',
  );
  assert.equal(
    clearCompanionSave().ok,
    false,
    'SSR clears report unavailable storage.',
  );
  assert.equal(COMPANION_SAVE_KEY, 'drawing-friend-companion-v1');
  assert.equal(readCompanionSave(storage).status, 'empty');
  assert.equal(readCompanionSave().status, 'unavailable');

  const custom = createCompanionSave({
    name: '별이',
    appearance: {
      kind: 'bunny',
      bodyColor: '#FFAAEE',
      accentColor: '#90c',
      accessory: 'flower',
    },
    equippedAccessory: 'flower',
    unlockedAccessories: ['star', 'flower'],
    completedAdventures: 2,
    forest: transitionForest(initialForestState(), {
      type: 'choose-route',
      route: 'river',
    }),
    storyBooks: [
      {
        id: 'first',
        title: '별빛 숲의 약속',
        pages: ['우리 함께 출발했어요.', '잃어버린 별을 찾았어요.'],
        createdAt: 123,
        ending: '함께여서 용기가 났어요.',
      },
    ],
    updatedAt: 456,
  });
  assert.deepEqual(saveCompanionSave(custom, storage), { ok: true });
  assert.deepEqual(
    loadCompanionSave(storage),
    custom,
    'A new session restores the exact companion and book.',
  );
  assert.equal(custom.appearance.bodyColor, '#ffaaee');
  assert.equal(custom.appearance.accentColor, '#9900cc');

  const heroSnapshot = {
    kind: 'cat',
    bodyColor: '#f4dfc1',
    accentColor: '#b69dcb',
    accessory: 'flower',
    pattern: 'heart',
    earStyle: 'floppy',
  };
  const personalized = createCompanionSave({
    ...custom,
    storyBooks: [
      {
        ...custom.storyBooks[0],
        heroName: '그날의 별이',
        heroAppearance: heroSnapshot,
        choices: { route: 'garden', owl: 'invite', ending: 'home' },
      },
    ],
  });
  assert.equal(saveCompanionSave(personalized, storage).ok, true);
  const changedFriend = createCompanionSave({
    ...personalized,
    name: '새로운 이름',
    appearance: {
      ...custom.appearance,
      kind: 'bear',
      pattern: 'spots',
      earStyle: 'upright',
    },
  });
  assert.deepEqual(changedFriend.storyBooks[0].heroAppearance, heroSnapshot);
  assert.equal(changedFriend.storyBooks[0].heroName, '그날의 별이');
  assert.deepEqual(changedFriend.storyBooks[0].choices, {
    route: 'garden',
    owl: 'invite',
    ending: 'home',
  });
  assert.notEqual(
    changedFriend.storyBooks[0].heroAppearance,
    heroSnapshot,
    'Books receive their own sanitized hero snapshot.',
  );
  assert.equal(saveCompanionSave(changedFriend, storage).ok, true);
  assert.deepEqual(
    loadCompanionSave(storage),
    changedFriend,
    'Book hero and branch snapshots survive reload and current-avatar changes.',
  );
  const sanitizedSnapshot = createCompanionSave({
    ...custom,
    storyBooks: [
      {
        ...custom.storyBooks[0],
        heroName: '별이',
        heroAppearance: {
          ...heroSnapshot,
          sourcePhoto: 'PRIVATE_HERO_PHOTO',
          pattern: 'url(secret)',
          earStyle: 'evil',
        },
        choices: {
          route: 'garden',
          owl: 'invite',
          ending: 'home',
          email: 'PRIVATE_EMAIL',
        },
        portrait: 'data:image/png;base64,PRIVATE_PORTRAIT',
      },
    ],
  });
  assert.equal(sanitizedSnapshot.storyBooks[0].heroAppearance.pattern, 'plain');
  assert.equal(
    sanitizedSnapshot.storyBooks[0].heroAppearance.earStyle,
    'upright',
  );
  assert.equal(
    JSON.stringify(sanitizedSnapshot).includes('PRIVATE_'),
    false,
    'Snapshots must never persist images, email or unknown choice data.',
  );
  const invalidChoices = createCompanionSave({
    ...custom,
    storyBooks: [
      {
        ...custom.storyBooks[0],
        choices: { route: 'other', owl: 'invite', ending: 'home' },
      },
    ],
  });
  assert.equal(
    invalidChoices.storyBooks[0].choices,
    undefined,
    'Invalid optional choices are removed while the legacy book remains readable.',
  );
  const newChoices = {
    route: 'garden',
    owl: 'invite',
    ending: 'home',
    craftDesign: 'heart',
    discoveries: ['secret-mushroom', 'secret-star'],
  };
  const craftedBookSave = sanitizeCompanionSave({
    ...custom,
    storyBooks: [{ ...custom.storyBooks[0], choices: newChoices }],
  });
  assert.ok(craftedBookSave);
  assert.deepEqual(craftedBookSave.storyBooks[0].choices, newChoices);
  assert.notEqual(
    craftedBookSave.storyBooks[0].choices.discoveries,
    newChoices.discoveries,
    'Discovery arrays receive an immutable book snapshot.',
  );
  const craftedBackup = serializeCompanionBackup(craftedBookSave);
  assert.equal(craftedBackup.ok, true);
  assert.deepEqual(
    parseCompanionBackup(craftedBackup.json).save.storyBooks[0].choices,
    newChoices,
  );
  for (const craftDesign of [null, 'square', 1, ['star']])
    assert.equal(
      sanitizeCompanionSave({
        ...custom,
        storyBooks: [
          { ...custom.storyBooks[0], choices: { ...newChoices, craftDesign } },
        ],
      }),
      null,
    );
  const sparseDiscoveries = [];
  sparseDiscoveries.length = 1;
  for (const discoveries of [
    null,
    'secret-star',
    ['secret-shell'],
    ['unknown'],
    ['secret-star', 'secret-star'],
    ['secret-shell', 'secret-mushroom', 'secret-star'],
    sparseDiscoveries,
  ])
    assert.equal(
      sanitizeCompanionSave({
        ...custom,
        storyBooks: [
          { ...custom.storyBooks[0], choices: { ...newChoices, discoveries } },
        ],
      }),
      null,
    );
  assert.equal(
    custom.storyBooks[0].heroAppearance,
    undefined,
    'Legacy books are accepted without invented snapshots.',
  );

  const leaked = {
    ...custom,
    sourcePhoto: 'data:image/png;base64,PRIVATE_PHOTO',
    chatHistory: [{ content: 'PRIVATE_CHAT' }],
    email: 'PRIVATE_EMAIL',
    forest: { ...custom.forest, sourcePhoto: 'PRIVATE_FOREST_PHOTO' },
    appearance: { ...custom.appearance, sourceImage: 'PRIVATE_IMAGE' },
    storyBooks: custom.storyBooks.map((book) => ({
      ...book,
      chat: 'PRIVATE_BOOK_CHAT',
    })),
  };
  assert.equal(saveCompanionSave(leaked, storage).ok, true);
  assert.equal(
    storage.getItem(COMPANION_SAVE_KEY).includes('PRIVATE_'),
    false,
    'Photo, chat, email and nested unknown fields must not enter the saved record.',
  );
  assert.deepEqual(loadCompanionSave(storage), custom);

  const previous = storage.getItem(COMPANION_SAVE_KEY);
  const throwingStorage = {
    getItem: (key) => storage.getItem(key),
    setItem() {
      throw new DOMException('Full', 'QuotaExceededError');
    },
    removeItem() {
      throw new Error('Denied');
    },
  };
  const quotaResult = saveCompanionSave(
    { ...custom, name: '새 이름' },
    throwingStorage,
  );
  assert.equal(quotaResult.ok, false);
  assert.ok(quotaResult.error.length > 0);
  assert.equal(
    storage.getItem(COMPANION_SAVE_KEY),
    previous,
    'Quota failure must preserve the last save.',
  );
  assert.equal(clearCompanionSave(throwingStorage).ok, false);
  assert.equal(
    loadCompanionSave({
      getItem() {
        throw new Error('Denied');
      },
    }),
    null,
  );

  for (const corrupted of [
    '{invalid json',
    'null',
    '[]',
    JSON.stringify({ ...custom, version: 2 }),
    JSON.stringify({ ...custom, completedAdventures: -1 }),
    JSON.stringify({ ...custom, completedAdventures: 1.5 }),
    JSON.stringify({ ...custom, completedAdventures: null }),
    JSON.stringify({ ...custom, updatedAt: -1 }),
    JSON.stringify({
      ...custom,
      appearance: { ...custom.appearance, kind: 'evil' },
    }),
    JSON.stringify({
      ...custom,
      appearance: { ...custom.appearance, bodyColor: 'url(secret)' },
    }),
    JSON.stringify({
      ...custom,
      forest: { stage: 'finished', arbitrary: true },
    }),
    JSON.stringify({
      ...custom,
      storyBooks: [{ ...custom.storyBooks[0], pages: [42] }],
    }),
    ' '.repeat(MAX_COMPANION_SAVE_BYTES + 1),
  ]) {
    storage.setItem(COMPANION_SAVE_KEY, corrupted);
    assert.equal(
      loadCompanionSave(storage),
      null,
      'Malformed, future-version or oversized saves are rejected.',
    );
    assert.equal(
      storage.getItem(COMPANION_SAVE_KEY),
      corrupted,
      'Reading invalid data must not destroy it.',
    );
    const status = readCompanionSave(storage);
    assert.ok(status.status === 'corrupt' || status.status === 'future');
    assert.equal(
      saveCompanionSave(custom, storage).ok,
      false,
      'Autosave cannot overwrite an unreadable record.',
    );
    assert.equal(storage.getItem(COMPANION_SAVE_KEY), corrupted);
  }

  storage.setItem(COMPANION_SAVE_KEY, previous);
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.equal(
      saveCompanionSave({ ...custom, completedAdventures: value }, storage).ok,
      false,
    );
    assert.equal(
      saveCompanionSave({ ...custom, updatedAt: value }, storage).ok,
      false,
    );
  }
  assert.equal(
    storage.getItem(COMPANION_SAVE_KEY),
    previous,
    'Invalid writes must preserve the last valid save.',
  );

  const books = Array.from({ length: 14 }, (_, index) => ({
    id: `book-${index}`,
    title: '새로운 모험',
    pages: Array.from({ length: 12 }, () => '작은 친구와 함께 걸었어요.'),
    ending: '또 만나자!',
    createdAt: index,
  }));
  const bounded = createCompanionSave({
    name: '🐰'.repeat(40),
    unlockedAccessories: ['star', 'flower', 'flower', 'unknown'],
    equippedAccessory: 'scarf',
    storyBooks: books,
    completedAdventures: 14,
  });
  assert.equal(
    [...bounded.name].length,
    24,
    'Long nicknames truncate without broken Unicode.',
  );
  assert.equal(bounded.storyBooks.length, 14);
  assert.equal(
    bounded.storyBooks[0].id,
    'book-13',
    'All fourteen books are kept, newest first.',
  );
  assert.equal(
    bounded.storyBooks.every((book) => book.pages.length === 12),
    true,
  );
  assert.deepEqual(bounded.unlockedAccessories, ['star', 'flower']);
  assert.equal(
    bounded.equippedAccessory,
    'star',
    'A locked accessory cannot be equipped by tampering.',
  );
  assert.equal(bounded.appearance.accessory, bounded.equippedAccessory);
  storage.setItem(COMPANION_SAVE_KEY, JSON.stringify(bounded));
  assert.equal(saveCompanionSave(bounded, storage).ok, true);
  assert.deepEqual(loadCompanionSave(storage), bounded);

  const familyName = createCompanionSave({ name: '👨‍👩‍👧‍👦'.repeat(25) });
  assert.equal(
    familyName.name,
    '👨‍👩‍👧‍👦'.repeat(24),
    'A nickname limit must preserve joined emoji.',
  );
  const beforeOversizedSave = storage.getItem(COMPANION_SAVE_KEY);
  const oversized = {
    ...custom,
    storyBooks: Array.from({ length: 30 }, (_, index) => ({
      ...books[0],
      id: `large-${index}`,
      pages: Array.from({ length: 12 }, () => '별'.repeat(600)),
    })),
  };
  assert.equal(
    saveCompanionSave(oversized, storage).ok,
    false,
    'Large UTF-8 content is rejected before storage.',
  );
  assert.equal(storage.getItem(COMPANION_SAVE_KEY), beforeOversizedSave);

  // Independent tab snapshots, interleaved writes: neither books nor unrelated
  // customizations may be replaced by stale state from the other tab.
  const shared = new MemoryStorage();
  const initialA = readCompanionSave(shared).snapshot;
  const initialB = readCompanionSave(shared).snapshot;
  const firstA = await persistCompanionSave(
    createCompanionSave({ name: '반짝' }),
    { base: initialA, storage: shared },
  );
  assert.equal(firstA.ok, true);
  const firstB = await persistCompanionSave(
    createCompanionSave({
      appearance: { ...fresh.appearance, bodyColor: '#abcabc' },
    }),
    { base: initialB, storage: shared },
  );
  assert.equal(firstB.ok, true);
  assert.equal(firstB.save.name, '반짝');
  assert.equal(firstB.save.appearance.bodyColor, '#abcabc');
  const baseA = readCompanionSave(shared).snapshot;
  const baseB = readCompanionSave(shared).snapshot;
  const nextA = { ...baseA.save, storyBooks: [books[0]], name: '달콩' };
  const nextB = {
    ...baseB.save,
    storyBooks: [books[1]],
    appearance: { ...baseB.save.appearance, pattern: 'heart' },
  };
  assert.equal(
    (await persistCompanionSave(nextA, { base: baseA, storage: shared })).ok,
    true,
  );
  const mergedB = await persistCompanionSave(nextB, {
    base: baseB,
    storage: shared,
  });
  assert.equal(mergedB.ok, true);
  assert.equal(mergedB.merged, true);
  assert.deepEqual(
    mergedB.save.storyBooks.map((book) => book.id),
    ['book-1', 'book-0'],
  );
  assert.equal(mergedB.save.name, '달콩');
  assert.equal(mergedB.save.appearance.pattern, 'heart');
  assert.equal(mergedB.save.completedAdventures, 2);

  const clashA = readCompanionSave(shared).snapshot;
  const clashB = readCompanionSave(shared).snapshot;
  assert.equal(
    (
      await persistCompanionSave(
        { ...clashA.save, name: '첫 번째 이름' },
        { base: clashA, storage: shared },
      )
    ).ok,
    true,
  );
  const beforeClash = shared.getItem(COMPANION_SAVE_KEY);
  const collision = await persistCompanionSave(
    { ...clashB.save, name: '두 번째 이름' },
    { base: clashB, storage: shared },
  );
  assert.equal(collision.ok, false);
  assert.equal(collision.code, 'conflict');
  assert.equal(
    shared.getItem(COMPANION_SAVE_KEY),
    beforeClash,
    'Same-field conflicts need an explicit user choice.',
  );

  const deletedTab = readCompanionSave(shared).snapshot;
  assert.equal((await resetCompanionSave(shared)).ok, true);
  const tombstone = shared.getItem(COMPANION_SAVE_KEY);
  assert.equal(readCompanionSave(shared).status, 'empty');
  const resurrection = await persistCompanionSave(deletedTab.save, {
    base: deletedTab,
    storage: shared,
  });
  assert.equal(resurrection.ok, false);
  assert.equal(resurrection.code, 'reset');
  assert.equal(
    shared.getItem(COMPANION_SAVE_KEY),
    tombstone,
    'A stale tab cannot resurrect deleted books.',
  );
  assert.equal(
    saveCompanionSave(deletedTab.save, shared).ok,
    false,
    'The legacy writer also respects a reset tombstone.',
  );
  const afterReset = readCompanionSave(shared).snapshot;
  assert.equal(
    (await persistCompanionSave(fresh, { base: afterReset, storage: shared }))
      .ok,
    true,
    'A newly hydrated tab may explicitly start again.',
  );

  const fullSave = createCompanionSave({
    storyBooks: Array.from({ length: 100 }, (_, index) => ({
      ...books[0],
      id: `full-${index}`,
      createdAt: index,
    })),
    completedAdventures: 100,
  });
  const fullStorage = new MemoryStorage();
  const fullResult = await persistCompanionSave(fullSave, {
    base: readCompanionSave(fullStorage).snapshot,
    storage: fullStorage,
  });
  assert.equal(fullResult.ok, true);
  const beforeFull = fullStorage.getItem(COMPANION_SAVE_KEY);
  const overFull = await persistCompanionSave(
    {
      ...fullSave,
      storyBooks: [...fullSave.storyBooks, { ...books[0], id: 'one-too-many' }],
    },
    { base: fullResult.snapshot, storage: fullStorage },
  );
  assert.equal(overFull.ok, false);
  assert.equal(overFull.code, 'full');
  assert.equal(fullStorage.getItem(COMPANION_SAVE_KEY), beforeFull);
  assert.equal(loadCompanionSave(fullStorage).storyBooks.length, 100);

  const portable = serializeCompanionBackup(changedFriend);
  assert.equal(portable.ok, true);
  assert.deepEqual(parseCompanionBackup(portable.json), {
    ok: true,
    save: changedFriend,
  });
  for (const invalidImport of [
    '{bad',
    'null',
    JSON.stringify({
      format: 'drawing-friend-backup',
      version: 2,
      save: custom,
    }),
    JSON.stringify({
      format: 'drawing-friend-backup',
      version: 1,
      save: {
        ...custom,
        storyBooks: [{ ...books[0], pages: Array(13).fill('긴 책') }],
      },
    }),
  ]) {
    assert.equal(parseCompanionBackup(invalidImport).ok, false);
  }
  const personaSave = createCompanionSave({
    persona: {
      likes: '숲',
      traits: '용감해',
      ability: '작은 빛',
      quirk: '쫑긋',
      email: 'PRIVATE_EMAIL',
    },
    appearance: {
      ...fresh.appearance,
      drawingAssetId: 'a'.repeat(64),
      image: 'PRIVATE_IMAGE',
    },
  });
  assert.equal(personaSave.appearance.drawingAssetId, 'a'.repeat(64));
  assert.equal(
    safeAppearance({ ...fresh.appearance, drawingAssetId: 'javascript:bad' })
      .drawingAssetId,
    undefined,
  );
  assert.equal(JSON.stringify(personaSave).includes('PRIVATE_'), false);
  assert.equal(serializeCompanionBackup(personaSave).ok, true);

  // A real session queue with a delayed transaction, an edit typed mid-flight,
  // and another tab's intervening update exercises the React hook's controller.
  const queuedStorage = new MemoryStorage();
  saveCompanionSave(custom, queuedStorage);
  const otherTabBase = readCompanionSave(queuedStorage).snapshot;
  let releaseWrite;
  const gate = new Promise((resolve) => {
    releaseWrite = resolve;
  });
  let queuedCalls = 0;
  const queuedSession = new CompanionStorageSession({
    storage: queuedStorage,
    persist: async (data, options) => {
      if (queuedCalls++ === 0) await gate;
      return persistCompanionSave(data, options);
    },
  });
  queuedSession.hydrate();
  queuedSession.commitSave((save) => ({ ...save, name: '쓰는 중인 이름' }));
  await Promise.resolve();
  const otherTab = await persistCompanionSave(
    {
      ...otherTabBase.save,
      appearance: { ...otherTabBase.save.appearance, pattern: 'heart' },
      storyBooks: [...otherTabBase.save.storyBooks, books[2]],
    },
    { base: otherTabBase, storage: queuedStorage },
  );
  assert.equal(otherTab.ok, true);
  queuedSession.handleStorageChange();
  queuedSession.commitSave((save) => ({
    ...save,
    appearance: { ...save.appearance, accentColor: '#123456' },
    storyBooks: [...save.storyBooks, books[3]],
  }));
  releaseWrite();
  await queuedSession.flush();
  assert.equal(queuedCalls, 2);
  assert.equal(queuedSession.getState().blocked, false);
  assert.equal(queuedSession.getState().save.name, '쓰는 중인 이름');
  assert.equal(queuedSession.getState().save.appearance.accentColor, '#123456');
  assert.equal(queuedSession.getState().save.appearance.pattern, 'heart');
  assert.deepEqual(
    queuedSession
      .getState()
      .save.storyBooks.map((book) => book.id)
      .sort(),
    ['book-2', 'book-3', 'first'],
  );
  assert.deepEqual(
    loadCompanionSave(queuedStorage),
    queuedSession.getState().save,
  );

  const sessionConflictBase = readCompanionSave(queuedStorage).snapshot;
  await persistCompanionSave(
    { ...sessionConflictBase.save, name: '다른 창에서 정한 이름' },
    { base: sessionConflictBase, storage: queuedStorage },
  );
  queuedSession.commitSave((save) => ({
    ...save,
    name: '아직 내 화면의 이름',
  }));
  await queuedSession.flush();
  assert.equal(queuedSession.getState().blocked, true);
  assert.equal(
    queuedSession.getState().save.name,
    '아직 내 화면의 이름',
    'A conflict preserves unsaved edits for backup.',
  );
  assert.equal(loadCompanionSave(queuedStorage).name, '다른 창에서 정한 이름');
  await queuedSession.reloadLatest();
  assert.equal(queuedSession.getState().save.name, '다른 창에서 정한 이름');
  assert.equal(queuedSession.getState().blocked, false);
  queuedSession.commitSave((save) => ({ ...save, name: '' }));
  await queuedSession.flush();
  assert.equal(
    queuedSession.getState().save.name,
    '',
    'A temporarily empty text input stays editable.',
  );
  assert.equal(
    loadCompanionSave(queuedStorage).name,
    '몽글',
    'The persisted record still has a valid nickname.',
  );

  const corruptSessionStorage = new MemoryStorage();
  corruptSessionStorage.setItem(COMPANION_SAVE_KEY, '{broken');
  const corruptSession = new CompanionStorageSession({
    storage: corruptSessionStorage,
  });
  corruptSession.hydrate();
  assert.equal(corruptSession.getState().blocked, true);
  corruptSession.commitSave((save) => ({ ...save, name: '메모리에만 남겨요' }));
  await corruptSession.flush();
  assert.equal(corruptSessionStorage.getItem(COMPANION_SAVE_KEY), '{broken');
  assert.equal(
    (await corruptSession.restoreSave(custom)).ok,
    false,
    'Import never overwrites an unreadable record implicitly.',
  );
  assert.equal(
    (await corruptSession.reset()).ok,
    true,
    'Only an explicit reset clears unreadable data.',
  );
  assert.equal(corruptSession.getState().blocked, false);
  assert.equal((await corruptSession.restoreSave(custom)).ok, true);
  assert.deepEqual(loadCompanionSave(corruptSessionStorage), custom);

  const resetStorage = new MemoryStorage();
  saveCompanionSave(custom, resetStorage);
  let releaseResetWrite;
  const resetGate = new Promise((resolve) => {
    releaseResetWrite = resolve;
  });
  const resetSession = new CompanionStorageSession({
    storage: resetStorage,
    persist: async (data, options) => {
      await resetGate;
      return persistCompanionSave(data, options);
    },
  });
  resetSession.hydrate();
  resetSession.commitSave((save) => ({ ...save, name: '삭제 직전 변경' }));
  await Promise.resolve();
  const resetPending = resetSession.reset();
  releaseResetWrite();
  assert.equal((await resetPending).ok, true);
  assert.equal(
    readCompanionSave(resetStorage).status,
    'empty',
    'Reset waits for a started transaction, then leaves a tombstone.',
  );
  assert.equal(resetSession.getState().save.storyBooks.length, 0);

  const safe = safeAppearance({
    kind: 'dragon',
    bodyColor: '#F0F',
    accentColor: 'javascript:bad',
    accessory: 'secret',
  });
  assert.equal(safe.kind, 'sprout');
  assert.equal(safe.bodyColor, '#ff00ff');
  assert.equal(safe.accessory, 'star');
  assert.equal(safe.pattern, 'plain');
  assert.equal(safe.earStyle, 'upright');
  assert.match(safe.accentColor, /^#[\da-f]{6}$/);
  assert.equal(
    createCompanionSave().appearance === createCompanionSave().appearance,
    false,
    'Companions never share a mutable appearance object.',
  );

  storage.setItem('unrelated-app', 'keep');
  assert.deepEqual(clearCompanionSave(storage), { ok: true });
  assert.equal(loadCompanionSave(storage), null);
  assert.equal(
    storage.getItem('unrelated-app'),
    'keep',
    'Reset removes this game only.',
  );
  console.log(
    'Companion persistence smoke passed: immutable snapshots, two-tab merges/conflicts, queued edits, reset tombstones, 100-book preservation, validated portability, corruption/future-version guards, quota and SSR.',
  );
} finally {
  await server.close();
}
