import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync('app/companion-experience.tsx', 'utf8');
const ast = ts.createSourceFile(
  'experience.tsx',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
function find(predicate) {
  const all = [];
  function visit(node) {
    if (predicate(node)) all.push(node);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return all;
}
function evaluate(text, bindings, name) {
  const code = ts.transpileModule(name ? `${text}\n${name};` : `(${text});`, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  // oxlint-disable-next-line typescript/no-implied-eval -- Actual repository handlers only, with offline deterministic doubles.
  return new Function(
    ...Object.keys(bindings),
    name ? `${code}\nreturn ${name};` : `return ${code}`,
  )(...Object.values(bindings));
}
function load(name, bindings) {
  const node = find(
    (n) => ts.isFunctionDeclaration(n) && n.name?.text === name,
  )[0];
  assert.ok(node, `Actual ${name} exists`);
  return evaluate(node.getText(ast), bindings, name);
}
const nameInput = find(
  (n) =>
    ts.isJsxSelfClosingElement(n) &&
    n.tagName.getText(ast) === 'input' &&
    n.attributes.properties.some(
      (a) =>
        a.name?.getText(ast) === 'id' &&
        a.initializer?.text === 'companion-name',
    ),
)[0];
const inputChange = nameInput.attributes.properties.find(
  (a) => a.name?.getText(ast) === 'onChange',
).initializer.expression;
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture(options = {}) {
  const a = { id: 'a'.repeat(64), name: '몽글', png: 'A', createdAt: 1 };
  const b = { id: 'b'.repeat(64), name: '달콩', png: 'B', createdAt: 2 };
  const assets = new Map([
    [a.id, a],
    [b.id, b],
  ]);
  const state = {
    errors: [],
    notices: [],
    writes: 0,
    reads: 0,
    generation: 'initial',
  };
  const bindings = {
    blocked: !!options.blocked,
    flush: async () => {},
    nameWrite: { current: null },
    friendSelection: { current: 0 },
    artLibraryRef: { current: [...assets.values()] },
    libraryReadEpoch: { current: 0 },
    mounted: { current: true },
    saveRef: {
      current: {
        name: a.name,
        appearance: { kind: 'bunny', drawingAssetId: a.id },
        storyBooks: [{ heroName: '어제의 몽글', pages: ['어제 이야기'] }],
      },
    },
    commitSave: (update) => {
      bindings.saveRef.current =
        typeof update === 'function'
          ? update(bindings.saveRef.current)
          : update;
    },
    setNameSaving: (value) => {
      state.saving = value;
    },
    setNameSaveError: (value) => state.errors.push(value),
    setArtLibrary: (value) => {
      state.library = value;
    },
    setNotice: (value) => state.notices.push(value),
    readCompanionSave: () => ({
      status: options.emptySave ? 'empty' : 'ready',
      save: options.failedSave
        ? { ...bindings.saveRef.current, name: '몽글' }
        : options.differentSave
          ? {
              ...bindings.saveRef.current,
              appearance: { drawingAssetId: b.id },
            }
          : bindings.saveRef.current,
      snapshot: { generation: state.generation },
    }),
    listDrawingAssets: async () => [...assets.values()],
    readDrawingAsset: async (id) => {
      state.reads++;
      const captured = assets.get(id);
      if (options.readGate) await options.readGate.promise;
      return captured;
    },
    renameDrawingAsset: async (id, name, write) => {
      state.writes++;
      if (options.writeGate) await options.writeGate.promise;
      if (options.fail) throw new Error('test storage failure');
      if (write.expectedGeneration !== state.generation)
        throw new Error('reset superseded rename');
      const old = assets.get(id);
      assert.equal(old.name, write.expectedName);
      const renamed = { ...old, name };
      assets.set(id, renamed);
      return renamed;
    },
  };
  bindings.flushCharacterName = load('flushCharacterName', bindings);
  const select = load('selectDrawingFriend', bindings);
  const change = evaluate(inputChange.getText(ast), bindings);
  const updateAppearance = load('updateAppearance', bindings);
  return {
    a,
    b,
    assets,
    state,
    bindings,
    select,
    change: (name) => change({ target: { value: name } }),
    updateAppearance,
  };
}
const simple = fixture();
simple.change('별이');
await simple.select(simple.a.id);
assert.equal(
  simple.bindings.saveRef.current.name,
  '별이',
  'same card cannot restore the original name',
);
assert.equal(simple.assets.get(simple.a.id).name, '별이');
await simple.select(simple.b.id);
assert.equal(simple.bindings.saveRef.current.name, '달콩');
await simple.select(simple.a.id);
assert.equal(
  simple.bindings.saveRef.current.name,
  '별이',
  'A → B → A preserves the saved rename',
);
assert.deepEqual(
  simple.bindings.saveRef.current.storyBooks,
  [{ heroName: '어제의 몽글', pages: ['어제 이야기'] }],
  'existing books remain immutable',
);
simple.change('   ');
await simple.bindings.flushCharacterName();
assert.equal(simple.assets.get(simple.a.id).name, '몽글');
assert.equal(simple.bindings.saveRef.current.name, '몽글');

const failed = fixture({ fail: true });
failed.change('지켜줄 이름');
await failed.select(failed.b.id);
assert.equal(
  failed.bindings.saveRef.current.appearance.drawingAssetId,
  failed.a.id,
  'failed rename blocks switching away',
);
assert.equal(
  failed.bindings.saveRef.current.name,
  '지켜줄 이름',
  'failed write keeps the editable current name',
);
assert.equal(failed.assets.get(failed.a.id).name, '몽글');
assert.ok(failed.state.errors.includes('test storage failure'));
assert.equal(
  failed.state.notices.length,
  0,
  'failed rename cannot claim successful keeping',
);
for (const options of [
  { blocked: true },
  { failedSave: true },
  { emptySave: true },
  { differentSave: true },
]) {
  const unsaved = fixture(options);
  unsaved.change('아직 저장 안 된 이름');
  assert.equal(await unsaved.bindings.flushCharacterName(), false);
  assert.equal(
    unsaved.state.writes,
    0,
    'failed/blocked active save cannot mutate the library name',
  );
  assert.equal(unsaved.assets.get(unsaved.a.id).name, '몽글');
}

for (const superseding of ['name', 'appearance', 'reset', 'unmount']) {
  const gate = deferred();
  const current = fixture({ readGate: gate });
  if (superseding === 'appearance')
    current.bindings.saveRef.current.appearance = { kind: 'bunny' };
  const pending = current.select(current.b.id);
  for (let index = 0; index < 12 && current.state.reads === 0; index++)
    await Promise.resolve();
  assert.equal(current.state.reads, 1);
  if (superseding === 'name') current.change('가장 새 이름');
  if (superseding === 'appearance')
    current.updateAppearance({ kind: 'cat', drawingAssetId: undefined });
  if (superseding === 'reset') current.state.generation = 'reset';
  if (superseding === 'unmount') current.bindings.mounted.current = false;
  gate.resolve();
  await pending;
  assert.notEqual(
    current.bindings.saveRef.current.appearance.drawingAssetId,
    current.b.id,
    `${superseding} wins over an older selection read`,
  );
  if (superseding === 'name')
    assert.equal(current.bindings.saveRef.current.name, '가장 새 이름');
  if (superseding === 'appearance')
    assert.equal(current.bindings.saveRef.current.appearance.kind, 'cat');
}
const writeGate = deferred();
const joined = fixture({ writeGate });
joined.change('같이 기억해');
const blur = joined.bindings.flushCharacterName();
const switchAfterBlur = joined.select(joined.b.id);
assert.equal(
  joined.state.writes,
  0,
  'metadata write waits for active-save flush',
);
await Promise.resolve();
assert.equal(
  joined.state.writes,
  1,
  'blur and immediate card click share one metadata write',
);
writeGate.resolve();
await Promise.all([blur, switchAfterBlur]);
assert.equal(joined.state.writes, 1);
assert.equal(joined.assets.get(joined.a.id).name, '같이 기억해');
assert.equal(
  joined.bindings.saveRef.current.name,
  '달콩',
  'completed old rename cannot rename the newly selected friend',
);
for (const name of [
  'startAdventure',
  'goHome',
  'openBook',
  'openChat',
  'openSettings',
  'exitCompanion',
  'openDrawing',
]) {
  const node = find(
    (n) => ts.isFunctionDeclaration(n) && n.name?.text === name,
  )[0];
  assert.match(
    node.getText(ast),
    /friendSelection\.current\+\+/,
    `${name} cancels pending friend selection`,
  );
}
console.log(
  'Character names passed: actual blur/card/input handlers, same/A-B-A selection, immutable old books, blank normalization, failure recovery, joined writes and stale read guards.',
);
