import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync('app/companion-experience.tsx', 'utf8');
const ast = ts.createSourceFile(
  'companion-experience.tsx',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const matches = [];
function visit(node) {
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(ast) === 'useEffect' &&
    node.arguments[0]?.getText(ast).includes('listDrawingAssetMetadata()') &&
    node.arguments[0]?.getText(ast).includes('addEventListener')
  )
    matches.push(node);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.equal(
  matches.length,
  1,
  'Exercise the actual metadata-list lifecycle effect',
);
const [effect] = matches;
assert.ok(ts.isArrayLiteralExpression(effect.arguments[1]));
assert.equal(
  effect.arguments[1].elements.length,
  0,
  'Selecting a friend does not recreate the full library read or its listeners',
);

class TestWindow extends EventTarget {
  added = [];
  removed = [];
  addEventListener(type, listener) {
    this.added.push([type, listener]);
    super.addEventListener(type, listener);
  }
  removeEventListener(type, listener) {
    this.removed.push([type, listener]);
    super.removeEventListener(type, listener);
  }
}

const window = new TestWindow();
const reads = [];
const writes = [];
const artLibraryRef = { current: [] };
const libraryReadEpoch = { current: 0 };
const saveKey = 'test-companion-save';
const context = {
  window,
  COMPANION_SAVE_KEY: saveKey,
  artLibraryRef,
  libraryReadEpoch,
  setArtLibrary: (assets) => writes.push(assets),
  listDrawingAssetMetadata: () =>
    new Promise((resolve, reject) => reads.push({ resolve, reject })),
  listDrawingAssets: () =>
    assert.fail('UI enumeration must never load all PNGs'),
};
runInNewContext(
  ts.transpileModule(
    `globalThis.runMetadataEffect = ${effect.arguments[0].getText(ast)};`,
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    },
  ).outputText,
  context,
);

const settle = async () => {
  for (let index = 0; index < 5; index++) await Promise.resolve();
};
const storage = (key) => {
  const event = new Event('storage');
  Object.defineProperty(event, 'key', { value: key });
  window.dispatchEvent(event);
};
const metadata = (name) => [
  {
    id: 'a'.repeat(64),
    createdAt: 1,
    name,
    pngLength: 128,
    persona: { likes: '별', traits: '다정함', ability: '빛', quirk: '방긋' },
  },
];
const initial = metadata('처음 이름');
let cleanup = context.runMetadataEffect();
assert.equal(reads.length, 1, 'Mount requests one metadata list');
assert.deepEqual(
  window.added.map(([type]) => type),
  ['drawing-friend-artworks-changed', 'focus', 'storage'],
);
reads[0].resolve(initial);
await settle();
assert.strictEqual(artLibraryRef.current, initial);
assert.strictEqual(writes.at(-1), initial);
assert.equal('png' in writes.at(-1)[0], false);

storage('unrelated-key');
assert.equal(
  reads.length,
  1,
  'Unrelated storage changes do not reread the library',
);
window.dispatchEvent(new Event('focus'));
assert.equal(reads.length, 2);
window.dispatchEvent(new Event('drawing-friend-artworks-changed'));
assert.equal(reads.length, 3);
const newer = metadata('최근 이름');
reads[2].resolve(newer);
await settle();
reads[1].resolve(initial);
await settle();
assert.strictEqual(artLibraryRef.current, newer);
assert.strictEqual(
  writes.at(-1),
  newer,
  'An older read cannot overwrite a newer event result',
);

window.dispatchEvent(new Event('focus'));
const beforeRename = reads.at(-1);
const renamed = metadata('방금 보관한 이름');
// The real rename handler invalidates in-flight reads before projecting its metadata.
libraryReadEpoch.current += 1;
artLibraryRef.current = renamed;
context.setArtLibrary(renamed);
const writesAfterRename = writes.length;
beforeRename.resolve(newer);
await settle();
assert.strictEqual(artLibraryRef.current, renamed);
assert.equal(
  writes.length,
  writesAfterRename,
  'Late enumeration cannot undo a completed name CAS',
);

window.dispatchEvent(new Event('focus'));
const beforeReset = reads.at(-1);
storage(saveKey);
reads.at(-1).resolve([]);
await settle();
assert.equal(artLibraryRef.current.length, 0);
const writesAfterReset = writes.length;
beforeReset.resolve(renamed);
await settle();
assert.equal(artLibraryRef.current.length, 0);
assert.equal(
  writes.length,
  writesAfterReset,
  'Reset refresh wins over an old populated library',
);
const beforeClearEvent = reads.length;
storage(null);
assert.equal(
  reads.length,
  beforeClearEvent + 1,
  'localStorage.clear() also refreshes metadata',
);
reads.at(-1).resolve([]);
await settle();

window.dispatchEvent(new Event('focus'));
const writesBeforeFailure = writes.length;
reads.at(-1).reject(new Error('Temporary read failure'));
await settle();
assert.equal(
  writes.length,
  writesBeforeFailure,
  'A failed refresh invents no library result',
);

window.dispatchEvent(new Event('focus'));
const afterUnmount = reads.at(-1);
cleanup();
assert.deepEqual(
  window.removed,
  window.added,
  'Cleanup removes every exact listener',
);
const readsBeforeCleanupEvents = reads.length;
const writesBeforeCleanupResult = writes.length;
window.dispatchEvent(new Event('focus'));
window.dispatchEvent(new Event('drawing-friend-artworks-changed'));
storage(saveKey);
assert.equal(reads.length, readsBeforeCleanupEvents);
afterUnmount.resolve(initial);
await settle();
assert.equal(
  writes.length,
  writesBeforeCleanupResult,
  'Unmounted effects ignore late data',
);

cleanup = context.runMetadataEffect();
const firstRemountRead = reads.at(-1);
cleanup();
cleanup = context.runMetadataEffect();
const finalMount = metadata('다시 연 보관함');
reads.at(-1).resolve(finalMount);
await settle();
firstRemountRead.resolve(initial);
await settle();
assert.strictEqual(
  artLibraryRef.current,
  finalMount,
  'Strict-mode cleanup/remount preserves the latest lifecycle',
);
cleanup();
assert.deepEqual(window.removed, window.added);

console.log(
  'Library metadata UI passed: actual mount-only effect, metadata-only reads, focus/artwork/storage listeners, newest-read/name/reset epochs, failure handling and exact cleanup/remount guards.',
);
