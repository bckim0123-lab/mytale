import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';

const modules = new Map();
function moduleFrom(name) {
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
      TextEncoder,
      crypto: webcrypto,
      atob,
      Error,
      require: (dependency) => moduleFrom(dependency.replace('./', '')),
    },
  );
  return exports;
}
const parts = moduleFrom('family-backup-parts');
const records = moduleFrom('companion-save');
const drawings = moduleFrom('drawing-assets');
const source = readFileSync('app/companion-experience.tsx', 'utf8');
const ast = ts.createSourceFile(
  'experience.tsx',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
function find(predicate) {
  const matches = [];
  const visit = (node) => {
    if (predicate(node)) matches.push(node);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return matches;
}
function evaluate(node, bindings, name) {
  const code = name
    ? `${node.getText(ast)}\n${name}`
    : `(${node.getText(ast)})`;
  return runInNewContext(
    ts.transpileModule(code, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText,
    { structuredClone, TextEncoder, crypto: webcrypto, Error, ...bindings },
  );
}
function load(name, bindings) {
  const declared = find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === name,
  )[0];
  if (declared) return evaluate(declared, bindings, name);
  const callback = find(
    (node) => ts.isVariableDeclaration(node) && node.name.getText(ast) === name,
  )[0];
  assert.ok(
    callback?.initializer?.arguments?.[0],
    `Actual ${name} callback exists.`,
  );
  return evaluate(callback.initializer.arguments[0], bindings);
}
const mountedEffect = find(
  (node) =>
    ts.isCallExpression(node) &&
    node.expression.getText(ast) === 'useEffect' &&
    node.arguments[0]?.getText(ast).includes('mounted.current = true'),
)[0];
const resetClick = find(
  (node) =>
    ts.isArrowFunction(node) &&
    node.getText(ast).includes('const result = await reset()') &&
    ts.isJsxExpression(node.parent),
)[0];
assert.ok(mountedEffect && resetClick);
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function settleUntil(check) {
  for (let turn = 0; turn < 100; turn++) {
    if (check()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(check(), 'The expected async boundary was reached.');
}
const basePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  'base64',
);
async function artwork(index, large = false) {
  const data = large
    ? Buffer.alloc(3 * 1024 * 1024 - 3)
    : Buffer.alloc(basePng.length + 1);
  basePng.copy(data);
  data[data.length - 1] = index;
  const png = `data:image/png;base64,${data.toString('base64')}`;
  return {
    id: await drawings.artworkId(png),
    png,
    createdAt: index + 1,
    name: `친구 ${index}`,
  };
}
const smallAssets = await Promise.all([artwork(0), artwork(1)]);
const appearance = {
  kind: 'bunny',
  bodyColor: '#ffeeaa',
  accentColor: '#aaffee',
  accessory: 'star',
};
function saveFor(assets) {
  return records.createCompanionSave({
    name: assets[0]?.name ?? '몽글',
    appearance: { ...appearance, drawingAssetId: assets[0]?.id },
    storyBooks: assets.map((asset, index) => ({
      id: `book-${index}`,
      title: `함께 쓴 책 ${index}`,
      pages: ['친구와 함께 걸었어요.'],
      ending: '따뜻한 기억',
      createdAt: index + 1,
      heroName: `그날의 이름 ${index}`,
      heroAppearance: { ...appearance, drawingAssetId: asset.id },
    })),
  });
}
function fixture(assets = smallAssets) {
  const state = {
    generation: 'initial',
    revision: 1,
    status: 'ready',
    durable: undefined,
    metadata: assets.map(drawings.drawingAssetMetadata),
    split: null,
    pending: null,
    offered: false,
    busy: false,
    statuses: [],
    downloads: [],
    reads: [],
    getAll: 0,
    metadataReads: 0,
    assetWrites: 0,
    recordWrites: 0,
    cleanupWrites: 0,
    onRead: null,
    onMetadata: null,
    onFlush: null,
    restoreFailed: false,
    consent: true,
    messages: ['이전 대화'],
    input: '이전 입력',
    chatAborts: 0,
  };
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
  const noop = () => {};
  const b = {
    ...records,
    ...drawings,
    ...parts,
    initialName: undefined,
    mounted: { current: true },
    backupOperation: { current: false },
    backupEpoch: { current: 0 },
    artworkEpoch: { current: 0 },
    artworkBusy: false,
    saveRef: { current: saveFor(assets) },
    backupInput: { current: { value: 'selected.json' } },
    flushCharacterName: async () => true,
    flush: async () => {
      await state.onFlush?.();
    },
    readCompanionSave: () => ({
      status: state.status,
      save: state.durable ?? b.saveRef.current,
      snapshot: {
        generation: state.generation,
        revision: state.revision,
        save: state.durable ?? b.saveRef.current,
      },
    }),
    listDrawingAssetMetadata: async () => {
      state.metadataReads++;
      await state.onMetadata?.();
      return state.metadata;
    },
    listDrawingAssets: async () => {
      state.getAll++;
      return [...assetMap.values()];
    },
    readDrawingAsset: async (id) => {
      state.reads.push(id);
      await state.onRead?.(id);
      return assetMap.get(id) ?? null;
    },
    buildFamilyBackupPart: (plan, index, options) =>
      parts.buildFamilyBackupPart(plan, index, {
        ...options,
        readAsset: b.readDrawingAsset,
      }),
    downloadLocalFile: (filename, json) => {
      const parsed = JSON.parse(json);
      state.downloads.push({
        filename,
        part: parsed.part,
        record: parsed.record,
        ids: parsed.assets?.map((asset) => asset.id),
        json: json.length < 100000 ? json : undefined,
      });
    },
    setBackupStatus: (value) => {
      assert.ok(b.mounted.current);
      state.statuses.push(value);
    },
    setBackupBusy: (value) => {
      assert.ok(b.mounted.current);
      state.busy = value;
    },
    setSplitBackup: (value) => {
      assert.ok(b.mounted.current);
      state.split = typeof value === 'function' ? value(state.split) : value;
    },
    setSplitBackupOffered: (value) => {
      assert.ok(b.mounted.current);
      state.offered = value;
    },
    setPendingBackup: (value) => {
      assert.ok(b.mounted.current);
      state.pending = value;
    },
    setArtLibrary: (value) => {
      assert.ok(b.mounted.current);
      state.library = value;
    },
    putDrawingAssets: async (_incoming, options) => {
      assert.equal(options.cancelled(), false);
      state.assetWrites++;
    },
    restoreSave: async (incoming, options) => {
      state.recordWrites++;
      assert.equal(options.expectedGeneration, state.generation);
      assert.equal(options.expectedRevision, state.revision);
      state.restored = incoming;
      return state.restoreFailed
        ? { ok: false, error: '저장 공간 부족' }
        : { ok: true };
    },
    mode: 'home',
    cancelToyRequest: noop,
    forestInteractionEnabled: { current: false },
    setBook: noop,
    setChat: noop,
    setSettings: noop,
    setResetPrompt: noop,
    setResetAnswer: noop,
    setGuardianAnswer: noop,
    setGuardianChecked: noop,
    setChatStatus: noop,
    setBusy: noop,
    chatAbort: {
      current: {
        abort: () => {
          state.chatAborts++;
        },
      },
    },
    timers: { current: [] },
    audio: { current: null },
    clearTimeout,
    resetAnswer: '지우기',
    acceptedArtwork: { current: null },
    onArtworkAccepted: noop,
    colorRequest: { current: 0 },
    setActiveNote: noop,
    setReplaying: noop,
    setConsent: (value) => {
      state.consent = value;
    },
    setMessages: (value) => {
      state.messages = value;
    },
    setInput: (value) => {
      state.input = value;
    },
    setNotice: noop,
    setPanel: noop,
    setMode: noop,
    reset: async () => {
      state.generation = 'after-reset';
      state.revision = 0;
      return { ok: true };
    },
    clearDrawingAssets: async (options) => {
      state.cleanupWrites++;
      assert.equal(options.expectedGeneration, state.generation);
      assert.equal(options.preserveCurrentGeneration, true);
    },
  };
  const scope = () => ({
    ...b,
    splitBackup: state.split,
    pendingBackup: state.pending,
  });
  for (const name of [
    'newFamilyBackupIdentity',
    'backupMetadataKey',
    'backupIsCurrent',
    'assertBackupCurrent',
    'captureBackupState',
    'cancelBackupWork',
    'closeDialog',
  ])
    b[name] = (...args) => load(name, scope())(...args);
  return {
    b,
    state,
    assetMap,
    call: (name, ...args) => load(name, scope())(...args),
    reset: () => evaluate(resetClick, scope())(),
    unmount: () => evaluate(mountedEffect.arguments[0], scope())()(),
  };
}

// The complete small-backup path remains one explicit download of every book/hero.
const small = fixture();
await small.call('exportBackup');
assert.equal(small.state.downloads.length, 1);
assert.equal(small.state.downloads[0].part, undefined);
assert.deepEqual(
  small.state.downloads[0].ids,
  smallAssets.map((asset) => asset.id),
);
assert.equal(small.state.downloads[0].record.save.storyBooks.length, 2);
assert.equal(small.state.getAll, 1);
assert.equal(small.state.busy, false);

// A large real PNG library is planned without getAll or retaining serialized images.
const largeAssets = [];
for (let index = 0; index < 9; index++)
  largeAssets.push(await artwork(index, true));
const large = fixture(largeAssets);
await large.call('exportBackup');
assert.equal(large.state.offered, true);
assert.equal(large.state.getAll, 0);
assert.equal(large.state.downloads.length, 0);
await large.call('prepareSplitBackup');
assert.ok(large.state.split.plan.parts.length > 1);
assert.equal(large.state.reads.length, 0);
assert.ok(!JSON.stringify(large.state.split).includes('data:image/png'));
const plan = large.state.split.plan;
for (const part of plan.parts) {
  const readCount = large.state.reads.length;
  const downloadCount = large.state.downloads.length;
  await large.call('downloadBackupPart', part.index);
  assert.equal(
    large.state.downloads.length,
    downloadCount + 1,
    'One click requests exactly one file.',
  );
  assert.deepEqual(large.state.reads.slice(readCount), [...part.assetIds]);
  assert.equal(large.state.downloads.at(-1).part.index, part.index);
  assert.equal(large.state.downloads.at(-1).part.total, plan.parts.length);
}
assert.equal(large.state.getAll, 0);
assert.equal(large.state.split.requestedParts.length, plan.parts.length);
assert.match(large.state.statuses.at(-1), /저장을 요청|저장.*요청/);
assert.match(large.state.statuses.at(-1), /모든 파일/);

// An exact-size overflow also offers split backup after a successful PNG preflight.
{
  const test = fixture();
  test.b.TextEncoder = class extends TextEncoder {
    encode(value) {
      return value.includes('drawing-friend-family-backup')
        ? { length: 32 * 1024 * 1024 + 1 }
        : super.encode(value);
    }
  };
  await test.call('exportBackup');
  assert.equal(test.state.offered, true);
  assert.equal(test.state.downloads.length, 0);
}
for (const mutate of [
  (test) => {
    test.state.generation = 'reset';
  },
  (test) => {
    test.state.revision++;
  },
  (test) => {
    test.b.saveRef.current.name = '다른 이름';
  },
  (test) => {
    test.state.metadata = test.state.metadata.map((item) => ({
      ...item,
      name: '바뀐 이름',
    }));
  },
]) {
  const test = fixture();
  await test.call('prepareSplitBackup');
  mutate(test);
  await test.call('downloadBackupPart', 1);
  assert.equal(test.state.downloads.length, 0);
  assert.equal(test.state.reads.length, 0);
  assert.equal(test.state.split, null);
  assert.match(test.state.statuses.at(-1), /다시 준비/);
}
{
  const test = fixture();
  await test.call('prepareSplitBackup');
  test.state.onRead = () => {
    test.state.metadata = test.state.metadata.map((item) => ({
      ...item,
      name: '읽는 동안 바뀜',
    }));
  };
  await test.call('downloadBackupPart', 1);
  assert.equal(
    test.state.downloads.length,
    0,
    'Metadata changes during image reads cancel the completed file too.',
  );
  assert.equal(test.state.split, null);
}

// A clean local window may have missed a different window's durable record update.
for (const action of ['exportBackup', 'prepareSplitBackup']) {
  const test = fixture();
  test.b.saveRef.current = records.createCompanionSave();
  test.state.durable = records.createCompanionSave({
    storyBooks: saveFor(smallAssets).storyBooks,
  });
  test.state.revision++;
  await test.call(action);
  assert.equal(test.state.getAll, 0);
  assert.equal(test.state.metadataReads, 0);
  assert.equal(test.state.downloads.length, 0);
  assert.match(test.state.statuses.at(-1), /저장된 기록/);
}
for (const customize of [
  (save) => save,
  (save) => ({ ...save, name: '예전 이름' }),
  (save) => ({
    ...save,
    appearance: { ...save.appearance, bodyColor: '#000000' },
  }),
  (save) => ({ ...save, unlockedAccessories: ['star', 'flower'] }),
  (save) => ({
    ...save,
    persona: { likes: '별', traits: '용감함', ability: '빛', quirk: '반짝' },
  }),
  () => saveFor(smallAssets),
]) {
  const test = fixture([]);
  const fresh = records.createCompanionSave();
  test.b.saveRef.current = customize(fresh);
  test.state.status = 'empty';
  test.state.generation = 'reset-tombstone';
  test.state.revision = 0;
  await test.call('exportBackup');
  assert.equal(
    test.state.downloads.length,
    test.b.saveRef.current === fresh ? 1 : 0,
    'Only an exactly fresh default record may pair with empty storage.',
  );
}
{
  const test = fixture([]);
  test.b.initialName = '처음 만난 별이';
  test.b.saveRef.current = records.createCompanionSave({
    name: test.b.initialName,
  });
  test.state.status = 'empty';
  await test.call('exportBackup');
  assert.equal(
    test.state.downloads.length,
    1,
    'An explicitly supplied initial name is allowed for an otherwise fresh record.',
  );
}

// Duplicate actions, close/unmount, and a reset between individual reads cannot download late.
for (const cancellation of ['close', 'unmount', 'generation']) {
  const test = fixture();
  await test.call('prepareSplitBackup');
  const gate = deferred();
  test.state.onRead = () => gate.promise;
  const running = test.call('downloadBackupPart', 1);
  await settleUntil(() => test.state.reads.length === 1);
  await test.call('downloadBackupPart', 1);
  await test.call('exportBackup');
  assert.equal(test.state.reads.length, 1);
  assert.equal(test.state.getAll, 0);
  if (cancellation === 'close') test.call('closeDialog');
  else if (cancellation === 'unmount') test.unmount();
  else test.state.generation = 'after-reset';
  const statuses = test.state.statuses.length;
  gate.resolve();
  await running;
  assert.equal(test.state.downloads.length, 0);
  if (cancellation !== 'generation')
    assert.equal(test.state.statuses.length, statuses);
}
{
  const test = fixture();
  await test.call('prepareSplitBackup');
  const oldRead = deferred();
  test.state.onRead = () => oldRead.promise;
  const old = test.call('downloadBackupPart', 1);
  await settleUntil(() => test.state.reads.length === 1);
  test.call('closeDialog');
  const newerFlush = deferred();
  test.state.onFlush = () => newerFlush.promise;
  const newer = test.call('exportBackup');
  oldRead.resolve();
  await old;
  assert.equal(
    test.b.backupOperation.current,
    true,
    'Old finally cannot unlock a newer operation.',
  );
  newerFlush.resolve();
  await newer;
  assert.equal(test.state.downloads.length, 1);
}
{
  const test = fixture();
  const gate = deferred();
  test.b.reset = async () => {
    await gate.promise;
    test.state.generation = 'reset-done';
    return { ok: true };
  };
  const running = test.reset();
  assert.equal(test.state.chatAborts, 1);
  assert.equal(test.state.consent, false);
  assert.equal(test.state.messages.length, 0);
  assert.equal(test.state.input, '');
  test.call('closeDialog');
  test.state.consent = true;
  test.state.messages = ['다시 확인한 새 대화'];
  test.b.acceptedArtwork.current = 'newly accepted artwork';
  gate.resolve();
  await running;
  assert.equal(
    test.state.cleanupWrites,
    1,
    'A committed reset still cleans prior-generation PNGs after dialog close.',
  );
  assert.equal(
    test.state.consent,
    true,
    'Stale reset completion does not revoke a newly confirmed session.',
  );
  assert.deepEqual(test.state.messages, ['다시 확인한 새 대화']);
  assert.equal(
    test.b.acceptedArtwork.current,
    'newly accepted artwork',
    'Stale reset completion cannot clear a newer artwork acceptance marker.',
  );
}
{
  const test = fixture();
  test.b.reset = async () => ({
    ok: false,
    error: '삭제를 저장하지 못했어요.',
  });
  await test.reset();
  assert.equal(
    test.state.consent,
    false,
    'A failed reset must not leave a transmitting chat active.',
  );
  assert.equal(test.state.chatAborts, 1);
  assert.equal(test.state.cleanupWrites, 0);
  assert.match(test.state.statuses.at(-1), /삭제를 저장하지/);
}

// Validate optional per-file information, preserve existing identity, and report partial recovery honestly.
const partFile = fixture();
await partFile.call('prepareSplitBackup');
await partFile.call('downloadBackupPart', 1);
const goodJson = partFile.state.downloads[0].json;
for (const mode of [
  'success',
  'restore-failed',
  'display-failed',
  'bad-info',
  'wrong-count',
]) {
  const test = fixture();
  const input = JSON.parse(goodJson);
  if (mode === 'bad-info') input.part.index = 0;
  if (mode === 'wrong-count') input.part.bookCount++;
  const json = JSON.stringify(input);
  await test.call('inspectBackup', {
    size: json.length,
    text: async () => json,
  });
  if (mode === 'bad-info' || mode === 'wrong-count') {
    assert.equal(test.state.pending, null);
    assert.equal(test.state.assetWrites, 0);
    continue;
  }
  assert.equal(test.state.pending.part.index, 1);
  assert.match(test.state.statuses.at(-1), /모든 파일/);
  test.state.restoreFailed = mode === 'restore-failed';
  if (mode === 'display-failed')
    test.state.onMetadata = () => {
      throw new Error('목록 읽기 실패');
    };
  await test.call('importBackup');
  assert.equal(test.state.restored.name, smallAssets[0].name);
  assert.equal(
    test.state.restored.storyBooks[0].heroName,
    input.record.save.storyBooks[0].heroName,
  );
  assert.match(
    test.state.statuses.at(-1),
    mode === 'restore-failed' ? /새로 가져온 그림은 보관함에 남아/ : /이 파일/,
  );
  if (mode === 'success')
    assert.match(test.state.statuses.at(-1), /나머지 파일/);
}
{
  const test = fixture();
  const gate = deferred();
  const reading = test.call('inspectBackup', {
    size: goodJson.length,
    text: () => gate.promise,
  });
  test.call('closeDialog');
  gate.resolve(goodJson);
  await reading;
  assert.equal(
    test.state.pending,
    null,
    'A closed file preview cannot reappear.',
  );
  assert.equal(
    test.b.backupInput.current.value,
    '',
    'The same file can be chosen again after canceling its preview.',
  );
}

const partButton = find(
  (node) =>
    ts.isJsxOpeningElement(node) &&
    node.tagName.getText(ast) === 'button' &&
    node.attributes.properties.some(
      (attribute) =>
        attribute.name?.getText(ast) === 'onClick' &&
        attribute.initializer?.expression
          ?.getText(ast)
          .includes('downloadBackupPart(part.index)'),
    ),
)[0];
assert.ok(partButton);
const disabled = partButton.attributes.properties.find(
  (attribute) => attribute.name?.getText(ast) === 'disabled',
).initializer.expression;
for (const backupBusy of [false, true])
  for (const artworkBusy of [false, true])
    assert.equal(
      evaluate(disabled, { backupBusy, artworkBusy }),
      backupBusy || artworkBusy,
    );
assert.match(
  source,
  /나눠 저장 준비 열기/,
  'The bookshelf export can reach the settings-only split panel.',
);
assert.match(source, /전체 복원 완료를 뜻하지 않아요/);
console.log(
  'Family backup UI passed: actual complete/split handlers, real per-part asset reads, metadata-only plans, durable/local revision agreement, duplicate/stale/reset/unmount guards, explicit downloads, part validation and honest staged recovery; no browser/network.',
);
