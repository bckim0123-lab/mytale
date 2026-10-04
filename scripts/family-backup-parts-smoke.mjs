import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';

const modules = new Map();
let oversizedEncoding = false;
class CheckedEncoder extends TextEncoder {
  encode(value) {
    if (
      oversizedEncoding &&
      value.includes('"format":"drawing-friend-family-backup"')
    )
      return { byteLength: 32 * 1024 * 1024 + 1 };
    return super.encode(value);
  }
}
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const exports = {};
  modules.set(name, exports);
  runInNewContext(
    ts.transpileModule(readFileSync(`app/${name}.ts`, 'utf8'), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText,
    {
      exports,
      structuredClone,
      TextEncoder:
        name === 'family-backup-parts' ? CheckedEncoder : TextEncoder,
      crypto: webcrypto,
      atob,
      require: (dependency) => load(dependency.replace('./', '')),
    },
  );
  return exports;
}
const {
  createFamilyBackupPlan,
  buildFamilyBackupPart,
  parseFamilyBackupPartInfo,
  FAMILY_BACKUP_PART_PNG_BUDGET,
  FAMILY_BACKUP_MAX_FILE_BYTES,
} = load('family-backup-parts');
const { artworkId, drawingAssetMetadata } = load('drawing-assets');
const { createCompanionSave, parseCompanionBackup, readCompanionSave } =
  load('companion-save');
const { CompanionStorageSession } = load('companion-storage-session');
assert.equal(FAMILY_BACKUP_PART_PNG_BUDGET, 24 * 1024 * 1024);
assert.equal(FAMILY_BACKUP_MAX_FILE_BYTES, 32 * 1024 * 1024);
const basePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  'base64',
);
const assets = [];
for (let index = 0; index < 100; index++) {
  const png = `data:image/png;base64,${Buffer.concat([basePng, Buffer.from([index])]).toString('base64')}`;
  assets.push({
    id: await artworkId(png),
    png,
    createdAt: index + 1,
    ...(index % 2 ? {} : { name: `원래 친구 ${index}` }),
    ...(index % 3
      ? {}
      : {
          persona: {
            likes: '별',
            traits: '다정함',
            ability: '빛',
            quirk: '쫑긋',
          },
        }),
  });
}
const metadata = assets.map(drawingAssetMetadata);
const nearMaximumPngLength = 4 * Math.ceil((3 * 1024 * 1024 - 3) / 3) + 22;
const appearance = {
  kind: 'bunny',
  bodyColor: '#ffffff',
  accentColor: '#ffeeaa',
  accessory: 'star',
};
const book = (index, heroId) => ({
  id: `book-${index}`,
  createdAt: typeof index === 'number' ? index + 1 : 1001,
  title: `우리가 만든 이야기 ${index}`,
  pages: ['숲에서 함께 걸었어요.'],
  ending: '우리의 이야기를 기억했어요.',
  heroName: `그날의 친구 ${index}`,
  heroAppearance: {
    ...appearance,
    ...(heroId ? { drawingAssetId: heroId } : {}),
  },
});
const makeSave = (count) =>
  createCompanionSave({
    name: '현재 친구',
    appearance: {
      ...appearance,
      ...(count ? { drawingAssetId: assets[0].id } : {}),
    },
    completedAdventures: count,
    storyBooks: Array.from({ length: count }, (_, index) =>
      book(index, index % 7 ? assets[index].id : undefined),
    ),
  });
const options = { bundleId: 'family-backup-test', exportedAt: 1234 };
const stringify = (value) => JSON.stringify(value);
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

for (let count = 0; count <= 100; count++) {
  const input = metadata
    .slice(0, count)
    .map((item) => ({ ...item, pngLength: nearMaximumPngLength }));
  const save = makeSave(count);
  const plan = createFamilyBackupPlan(save, input, options);
  const reversed = createFamilyBackupPlan(save, [...input].reverse(), options);
  assert.equal(
    stringify(plan),
    stringify(reversed),
    'Planning is deterministic regardless of metadata input order',
  );
  assert.equal(plan.parts.length >= 1, true);
  assert.equal(plan.metadata.length, count);
  assert.doesNotMatch(stringify(plan), /data:image|"png":/);
  const allIds = new Set();
  const allBooks = [];
  for (const part of plan.parts) {
    assert.ok(part.pngLength <= FAMILY_BACKUP_PART_PNG_BUDGET);
    assert.equal(new Set(part.assetIds).size, part.assetIds.length);
    if (count)
      assert.ok(
        part.assetIds.includes(assets[0].id),
        'The active hero is present in every file',
      );
    for (const id of part.assetIds) allIds.add(id);
    for (const id of part.bookIds) {
      allBooks.push(id);
      const original = save.storyBooks.find((item) => item.id === id);
      if (original.heroAppearance.drawingAssetId)
        assert.ok(
          part.assetIds.includes(original.heroAppearance.drawingAssetId),
          'Every partial record has all of its historical hero PNGs',
        );
      else
        assert.equal(
          part.index,
          1,
          'Books without artwork belong to the first file',
        );
    }
  }
  assert.deepEqual(
    [...allIds].sort(byText),
    input.map((item) => item.id).sort(byText),
  );
  assert.deepEqual(
    allBooks.sort(byText),
    Array.from(save.storyBooks, (item) => item.id).sort(byText),
  );
  assert.equal(
    new Set(allBooks).size,
    count,
    'Every book appears exactly once',
  );
  for (const item of input)
    if (item.id !== assets[0]?.id)
      assert.equal(
        plan.parts.filter((part) => part.assetIds.includes(item.id)).length,
        1,
      );
}

const rawMetadata = structuredClone(metadata.slice(0, 10));
rawMetadata[0].privatePhoto = 'PRIVATE_ORIGINAL';
rawMetadata[0].persona.privateField = 'PRIVATE_PERSONA';
const sourceSave = makeSave(10);
const frozen = createFamilyBackupPlan(sourceSave, rawMetadata, options);
sourceSave.name = '나중 이름';
sourceSave.storyBooks[0].title = '나중 이야기';
rawMetadata[0].name = '나중 메타데이터';
rawMetadata[0].persona.likes = '나중 취향';
assert.equal(frozen.save.name, '현재 친구');
assert.equal(
  frozen.metadata.find((item) => item.id === assets[0].id).name,
  assets[0].name,
);
assert.equal(
  frozen.metadata.find((item) => item.id === assets[0].id).persona.likes,
  '별',
);
assert.ok(
  Object.isFrozen(frozen) && Object.isFrozen(frozen.save.storyBooks[0].pages),
);
assert.ok(
  Object.isFrozen(frozen.metadata[0]) &&
    Object.isFrozen(frozen.parts[0].assetIds),
);
assert.doesNotMatch(stringify(frozen), /PRIVATE_/);

assert.throws(
  () => createFamilyBackupPlan(makeSave(2), metadata.slice(1, 2), options),
  /일부 없어요/,
);
const historicalMissing = makeSave(2);
historicalMissing.appearance = appearance;
assert.throws(
  () =>
    createFamilyBackupPlan(historicalMissing, metadata.slice(0, 1), options),
  /일부 없어요/,
);
assert.throws(
  () =>
    createFamilyBackupPlan(makeSave(0), [...metadata, metadata[0]], options),
  /확인/,
);
assert.throws(
  () =>
    createFamilyBackupPlan(makeSave(0), [metadata[0], metadata[0]], options),
  /중복/,
);
assert.throws(
  () =>
    createFamilyBackupPlan(
      makeSave(0),
      [{ ...metadata[0], pngLength: 40 * 1024 * 1024 }],
      options,
    ),
  /확인/,
);
assert.throws(
  () =>
    createFamilyBackupPlan(
      {
        ...makeSave(0),
        storyBooks: Array.from({ length: 101 }, (_, index) => book(index)),
      },
      [],
      options,
    ),
  /확인/,
);

// Size planning uses near-3MiB lengths only; builds use tiny real PNGs with the
// same IDs and group layout so no huge fixture files or image buffers are needed.
const sized = createFamilyBackupPlan(
  makeSave(10),
  metadata
    .slice(0, 10)
    .map((item) => ({ ...item, pngLength: nearMaximumPngLength })),
  options,
);
const plan = { ...sized, metadata: frozen.metadata };
assert.ok(plan.parts.length > 1);
const reads = [];
const checks = [];
const readAsset = async (id) => {
  reads.push(id);
  const original = assets.find((item) => item.id === id);
  return {
    ...original,
    name: '나중에 바뀐 이름',
    persona: { likes: '나중 취향', traits: '', ability: '', quirk: '' },
    privatePhoto: 'PRIVATE_ORIGINAL',
  };
};
const built = [];
for (const part of plan.parts) {
  reads.length = 0;
  const result = await buildFamilyBackupPart(plan, part.index, {
    readAsset,
    assertCurrent: async () => {
      await Promise.resolve();
      checks.push('checked');
    },
  });
  assert.deepEqual(
    reads,
    Array.from(part.assetIds),
    'Only the chosen file is read, once per unique asset',
  );
  assert.ok(checks.length >= part.assetIds.length * 3 + 2);
  const output = JSON.parse(result.json);
  assert.equal(output.format, 'drawing-friend-family-backup');
  assert.equal(output.version, 1);
  assert.equal(output.part.index, part.index);
  assert.equal(output.part.assetCount, output.assets.length);
  assert.equal(output.part.bookCount, output.record.save.storyBooks.length);
  assert.equal(output.record.exportedAt, options.exportedAt);
  assert.equal(parseCompanionBackup(stringify(output.record)).ok, true);
  assert.equal(
    stringify(parseFamilyBackupPartInfo(output.part)),
    stringify(result.part),
  );
  assert.doesNotMatch(result.json, /PRIVATE_|나중에 바뀐 이름|나중 취향/);
  for (const item of output.assets) {
    const expected = assets.find((asset) => asset.id === item.id);
    assert.equal(
      stringify(item),
      stringify(expected),
      'Image and exact optional snapshot identity are preserved',
    );
  }
  const required = [
    output.record.save.appearance.drawingAssetId,
    ...output.record.save.storyBooks.map(
      (item) => item.heroAppearance?.drawingAssetId,
    ),
  ].filter(Boolean);
  assert.ok(
    required.every((id) => output.assets.some((item) => item.id === id)),
    'Current importer reference closure is satisfied',
  );
  built.push(output);
}

for (const order of [built, [...built].reverse(), [...built, built[0]]]) {
  const stored = new Map();
  const storage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
    removeItem: (key) => stored.delete(key),
  };
  const session = new CompanionStorageSession({ storage });
  session.hydrate();
  session.commitSave(createCompanionSave({ storyBooks: [book('existing')] }));
  await session.flush();
  for (const output of order) {
    const before = readCompanionSave(storage);
    const incoming = parseCompanionBackup(stringify(output.record));
    assert.equal(incoming.ok, true);
    assert.equal(
      (
        await session.restoreSave(incoming.save, {
          expectedGeneration: before.snapshot.generation,
          expectedRevision: before.snapshot.revision,
        })
      ).ok,
      true,
    );
  }
  const restored = readCompanionSave(storage);
  assert.equal(restored.save.storyBooks.length, 11);
  assert.deepEqual(
    Array.from(restored.save.storyBooks, (item) => item.id).sort(byText),
    [...makeSave(10).storyBooks.map((item) => item.id), 'book-existing'].sort(
      byText,
    ),
  );
  assert.equal(restored.save.appearance.drawingAssetId, assets[0].id);
}

for (const broken of ['missing', 'id', 'checksum', 'length']) {
  await assert.rejects(
    () =>
      buildFamilyBackupPart(frozen, 1, {
        assertCurrent: () => {},
        readAsset: async (id) => {
          const original = assets.find((item) => item.id === id);
          if (broken === 'missing') return null;
          if (broken === 'id') return { ...original, id: 'f'.repeat(64) };
          if (broken === 'checksum')
            return {
              ...original,
              png: assets.find((item) => item.id !== id).png,
            };
          return { ...original, png: original.png + 'AA' };
        },
      }),
    /없거나 손상/,
  );
}
for (const failureAt of [1, 3]) {
  let counter = 0;
  const seen = [];
  await assert.rejects(
    () =>
      buildFamilyBackupPart(frozen, 1, {
        assertCurrent: async () => {
          if (++counter === failureAt) throw new Error('Snapshot changed');
        },
        readAsset: async (id) => {
          seen.push(id);
          return assets.find((item) => item.id === id);
        },
      }),
    /Snapshot changed/,
  );
  assert.equal(seen.length, failureAt === 1 ? 0 : 1);
}
await assert.rejects(
  () => buildFamilyBackupPart(frozen, 0, { assertCurrent: () => {} }),
  /다시 골라/,
);
oversizedEncoding = true;
await assert.rejects(
  () =>
    buildFamilyBackupPart(frozen, 1, { assertCurrent: () => {}, readAsset }),
  /32MB/,
);
oversizedEncoding = false;
const empty = await buildFamilyBackupPart(
  createFamilyBackupPlan(makeSave(0), [], options),
  1,
  {
    assertCurrent: () => {},
    readAsset: () => assert.fail('No-artwork archives must not read images'),
  },
);
assert.equal(JSON.parse(empty.json).assets.length, 0);
assert.equal(parseFamilyBackupPartInfo(undefined), null);
assert.equal(parseFamilyBackupPartInfo(null), null);
for (const invalid of [
  {},
  [],
  false,
  { ...built[0].part, index: 0 },
  { ...built[0].part, index: 101 },
  { ...built[0].part, total: 101 },
  { ...built[0].part, assetCount: -1 },
  { ...built[0].part, bookCount: 101 },
  { ...built[0].part, bundleId: '<script>' },
])
  assert.throws(() => parseFamilyBackupPartInfo(invalid), /분할 백업/);

console.log(
  'Family backup parts passed: deterministic PNG-free 0–100 plans, bounded reference-closed files, active hero repetition, immutable exact identities, chosen-part-only reads, real order/duplicate record merges, corrupt/missing/oversized rejection and awaited snapshot guards.',
);
