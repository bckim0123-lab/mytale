import assert from 'node:assert/strict';
import { webcrypto, randomUUID } from 'node:crypto';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  cacheDir: 'node_modules/.vite-artwork-store-test',
  root: process.cwd(),
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
});
const originalGlobals = Object.fromEntries(
  ['window', 'navigator', 'indexedDB', 'crypto'].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]),
);
const stored = new Map();
const local = new Map();
let failNextWrite = false;
let digestGate = null;
let lockTail = Promise.resolve();
let artworkEvents = 0;
const lockNames = [];
const fakeWindow = new EventTarget();
fakeWindow.localStorage = {
  getItem: (key) => local.get(key) ?? null,
  setItem: (key, value) => local.set(key, value),
  removeItem: (key) => local.delete(key),
};
fakeWindow.addEventListener('drawing-friend-artworks-changed', () => {
  artworkEvents += 1;
});

// A deterministic IndexedDB test double models atomic transactions and asynchronous
// request callbacks; browser integration still uses the browser's real IndexedDB.
const indexedDB = {
  open() {
    const request = {};
    queueMicrotask(() => {
      request.result = {
        close() {},
        transaction(_table, mode) {
          const transaction = {};
          const working = new Map(stored);
          let aborted = false;
          let timer;
          const shouldFail = mode === 'readwrite' && failNextWrite;
          if (mode === 'readwrite') failNextWrite = false;
          const complete = () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
              if (aborted) return;
              if (shouldFail) {
                transaction.onerror?.();
                return;
              }
              if (mode === 'readwrite') {
                stored.clear();
                for (const [key, value] of working) stored.set(key, value);
              }
              transaction.oncomplete?.();
            }, 0);
          };
          const read = (value) => {
            const entry = {};
            queueMicrotask(() => {
              if (aborted) return;
              entry.result = value();
              entry.onsuccess?.();
              complete();
            });
            return entry;
          };
          transaction.abort = () => {
            aborted = true;
            clearTimeout(timer);
            queueMicrotask(() => transaction.onabort?.());
          };
          transaction.objectStore = () => ({
            put(asset) {
              working.set(asset.id, structuredClone(asset));
              complete();
            },
            get(id) {
              return read(() => working.get(id));
            },
            getAll() {
              return read(() => [...working.values()]);
            },
            delete(id) {
              working.delete(id);
              complete();
            },
            clear() {
              working.clear();
              complete();
            },
          });
          complete();
          return transaction;
        },
      };
      request.onsuccess?.();
    });
    return request;
  },
};

Object.defineProperty(globalThis, 'window', {
  value: fakeWindow,
  configurable: true,
});
Object.defineProperty(globalThis, 'indexedDB', {
  value: indexedDB,
  configurable: true,
});
Object.defineProperty(globalThis, 'navigator', {
  value: {
    locks: {
      request(name, work) {
        lockNames.push(name);
        const result = lockTail.then(work);
        lockTail = result.catch(() => {});
        return result;
      },
    },
  },
  configurable: true,
});
Object.defineProperty(globalThis, 'crypto', {
  value: {
    randomUUID,
    subtle: {
      async digest(...args) {
        if (digestGate) {
          const gate = digestGate;
          digestGate = null;
          await gate;
        }
        return webcrypto.subtle.digest(...args);
      },
    },
  },
  configurable: true,
});

try {
  const {
    artworkId,
    validDrawingAsset,
    keepDrawingAsset,
    putDrawingAssets,
    readDrawingAsset,
    listDrawingAssets,
    clearDrawingAssets,
    captureDrawingGeneration,
  } = await server.ssrLoadModule('/app/drawing-assets.ts');
  const { resetCompanionSave, COMPANION_SAVE_KEY } = await server.ssrLoadModule(
    '/app/companion-save.ts',
  );
  const png =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
  const asset = await keepDrawingAsset(png, '우리 달콩');
  assert.equal(asset.id, await artworkId(png));
  assert.equal(validDrawingAsset(asset), true);
  assert.equal(stored.get(asset.id).generation, 'initial');
  assert.deepEqual(await readDrawingAsset(asset.id), asset);
  assert.deepEqual(await listDrawingAssets(), [asset]);
  assert.equal(artworkEvents, 1);
  const persona = {
    likes: '작은 별',
    traits: '다정해',
    ability: '달빛 켜기',
    quirk: '기쁘면 귀를 쫑긋',
  };
  const personalized = await keepDrawingAsset(png, '우리 달콩', {
    persona: { ...persona, privatePhoto: 'PRIVATE_PERSONA_EXTRA' },
  });
  assert.deepEqual(personalized.persona, persona);
  assert.deepEqual((await readDrawingAsset(personalized.id)).persona, persona);
  assert.equal(
    JSON.stringify([...stored.values()]).includes('PRIVATE_PERSONA_'),
    false,
  );
  assert.equal(
    validDrawingAsset({
      ...asset,
      persona: { ...persona, likes: 'a'.repeat(81) },
    }),
    false,
  );
  assert.equal(
    validDrawingAsset({ ...asset, persona: { ...persona, ability: 42 } }),
    false,
  );
  await putDrawingAssets([
    {
      ...asset,
      sourcePhoto: 'PRIVATE_ORIGINAL',
      chatHistory: 'PRIVATE_CHAT',
      unknown: 'PRIVATE_EXTRA',
    },
  ]);
  assert.equal(
    JSON.stringify([...stored.values()]).includes('PRIVATE_'),
    false,
    'Unknown backup fields never enter the artwork database.',
  );
  assert.equal(
    'generation' in (await readDrawingAsset(asset.id)),
    false,
    'Internal reset generation never leaks into portable assets.',
  );

  const beforeTamper = JSON.stringify([...stored]);
  await assert.rejects(
    () => putDrawingAssets([{ ...asset, id: 'a'.repeat(64) }]),
    /손상/,
  );
  assert.equal(JSON.stringify([...stored]), beforeTamper);
  await assert.rejects(
    () => putDrawingAssets([asset], { cancelled: () => true }),
    /취소/,
  );
  assert.equal(JSON.stringify([...stored]), beforeTamper);
  failNextWrite = true;
  await assert.rejects(
    () => putDrawingAssets([{ ...asset, name: '실패해야 하는 변경' }]),
    /저장하지 못했어요/,
  );
  assert.equal(
    JSON.stringify([...stored]),
    beforeTamper,
    'A failed transaction leaves all previous artwork intact.',
  );

  const dimensions = Buffer.from(png.split(',')[1], 'base64');
  dimensions.writeUInt32BE(50_000, 16);
  assert.equal(
    validDrawingAsset({
      ...asset,
      png: `data:image/png;base64,${dimensions.toString('base64')}`,
    }),
    false,
    'Oversized PNG IHDR is rejected before bitmap decoding.',
  );
  assert.equal(
    validDrawingAsset({
      ...asset,
      png: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    }),
    false,
  );
  assert.equal(
    validDrawingAsset({
      ...asset,
      png: `${png}${'A'.repeat(5 * 1024 * 1024)}`,
    }),
    false,
  );

  // A write begins before reset, then finishes hashing after metadata and assets
  // have been cleared. Its old generation must never put the picture back.
  const oldGeneration = captureDrawingGeneration();
  let releaseDigest;
  digestGate = new Promise((resolve) => {
    releaseDigest = resolve;
  });
  const lateWrite = keepDrawingAsset(png, '삭제되기 전 친구', {
    expectedGeneration: oldGeneration,
  }).then(
    () => null,
    (error) => error,
  );
  assert.equal((await resetCompanionSave()).ok, true);
  const resetGeneration = captureDrawingGeneration();
  assert.notEqual(resetGeneration, oldGeneration);
  assert.equal(
    await readDrawingAsset(asset.id),
    null,
    'Old-generation artwork is hidden before cleanup finishes.',
  );
  assert.deepEqual(await listDrawingAssets(), []);
  await clearDrawingAssets({
    expectedGeneration: resetGeneration,
    preserveCurrentGeneration: true,
  });
  releaseDigest();
  assert.match((await lateWrite).message, /기록을 지웠어요/);
  assert.equal(
    stored.size,
    0,
    'An old delayed write cannot resurrect a cleared picture.',
  );

  // A legitimate import in the gap after metadata reset but before old-assets
  // cleanup is preserved by its new generation, even if it uses the same hash.
  await keepDrawingAsset(png, '새로 시작한 친구', {
    expectedGeneration: resetGeneration,
  });
  stored.set('b'.repeat(64), {
    ...asset,
    id: 'b'.repeat(64),
    generation: oldGeneration,
  });
  await clearDrawingAssets({
    expectedGeneration: resetGeneration,
    preserveCurrentGeneration: true,
  });
  assert.equal(stored.size, 1);
  assert.equal((await readDrawingAsset(asset.id)).name, '새로 시작한 친구');
  await assert.rejects(
    () =>
      clearDrawingAssets({
        expectedGeneration: oldGeneration,
        preserveCurrentGeneration: true,
      }),
    /기록이 다시 바뀌었어요/,
  );
  assert.equal(stored.size, 1);

  // Standalone artwork clear uses its own persistent epoch too, so a delayed
  // import cannot restore pictures when companion metadata was not reset.
  let releaseStandalone;
  digestGate = new Promise((resolve) => {
    releaseStandalone = resolve;
  });
  const beforeStandalone = putDrawingAssets([asset], {
    expectedGeneration: resetGeneration,
  }).then(
    () => null,
    (error) => error,
  );
  await clearDrawingAssets();
  releaseStandalone();
  assert.match((await beforeStandalone).message, /기록을 지웠어요/);
  assert.equal(stored.size, 0);
  const generationAtCapacity = captureDrawingGeneration();
  await keepDrawingAsset(png, '같은 친구', {
    expectedGeneration: generationAtCapacity,
  });
  for (let index = 0; index < 99; index += 1) {
    const id = index.toString(16).padStart(64, '0');
    stored.set(id, { ...asset, id, generation: generationAtCapacity });
  }
  assert.equal(stored.size, 100);
  await keepDrawingAsset(png, '같은 친구의 새 이름', {
    expectedGeneration: generationAtCapacity,
  });
  assert.equal(
    stored.size,
    100,
    'Updating the same artwork hash is allowed at capacity.',
  );
  const secondPng = `data:image/png;base64,${Buffer.concat([Buffer.from(png.split(',')[1], 'base64'), Buffer.from([0])]).toString('base64')}`;
  const beforeCapacityWrite = JSON.stringify([...stored]);
  await assert.rejects(
    () =>
      keepDrawingAsset(secondPng, '101번째 친구', {
        expectedGeneration: generationAtCapacity,
      }),
    /100명/,
  );
  assert.equal(
    JSON.stringify([...stored]),
    beforeCapacityWrite,
    'Capacity failure never silently prunes an existing friend.',
  );
  assert.ok(
    lockNames.every((name) => name === `${COMPANION_SAVE_KEY}:write`),
    'Metadata reset, artwork writes and cleanup share one cross-tab lock.',
  );
  assert.ok(
    artworkEvents >= 6,
    'Successful writes and clears notify the portrait cache.',
  );
  console.log(
    'Artwork persistence passed: checksum/PNG bounds, persona and field allowlists, atomic failures, shared metadata lock, stale-generation rejection, reset-gap import preservation, standalone-clear epoch, cache notifications and 100-friend capacity.',
  );
} finally {
  for (const [key, descriptor] of Object.entries(originalGlobals)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
  await server.close();
}
