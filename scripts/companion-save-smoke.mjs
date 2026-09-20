import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
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
  } = await server.ssrLoadModule('/app/companion-save.ts');
  const { initialForestState, transitionForest } = await server.ssrLoadModule(
    '/app/forest-story.ts',
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
    ' '.repeat(64 * 1024 + 1),
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
    pages: Array.from({ length: 15 }, () => '작은 친구와 함께 걸었어요.'),
    ending: '또 만나자!',
    createdAt: index,
  }));
  const bounded = createCompanionSave({
    name: '🐰'.repeat(40),
    unlockedAccessories: ['star', 'flower', 'flower', 'unknown'],
    equippedAccessory: 'scarf',
    storyBooks: books,
  });
  assert.equal(
    [...bounded.name].length,
    24,
    'Long nicknames truncate without broken Unicode.',
  );
  assert.equal(bounded.storyBooks.length, 10);
  assert.equal(
    bounded.storyBooks[0].id,
    'book-13',
    'Only the newest ten books are kept.',
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
    storyBooks: books
      .slice(0, 10)
      .map((book) => ({
        ...book,
        pages: Array.from({ length: 12 }, () => '별'.repeat(600)),
      })),
  };
  assert.equal(
    saveCompanionSave(oversized, storage).ok,
    false,
    'Large UTF-8 content is rejected before storage.',
  );
  assert.equal(storage.getItem(COMPANION_SAVE_KEY), beforeOversizedSave);

  const safe = safeAppearance({
    kind: 'dragon',
    bodyColor: '#F0F',
    accentColor: 'javascript:bad',
    accessory: 'secret',
  });
  assert.equal(safe.kind, 'sprout');
  assert.equal(safe.bodyColor, '#ff00ff');
  assert.equal(safe.accessory, 'star');
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
    'Companion persistence smoke passed: roundtrip, bounds, privacy allowlists, corruption, quota and SSR.',
  );
} finally {
  await server.close();
}
