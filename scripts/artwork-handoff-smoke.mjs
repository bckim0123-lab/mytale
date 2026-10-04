import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const source = readFileSync('app/companion-experience.tsx', 'utf8');
const ast = ts.createSourceFile(
  'experience.tsx',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let effect, appearance;
function visit(node) {
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(ast) === 'useEffect' &&
    node.arguments[0]
      .getText(ast)
      .includes('portableArtwork(incomingArtwork.png)')
  )
    effect = node.arguments[0];
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'updateAppearance')
    appearance = node;
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(effect && appearance);
const code = ts.transpileModule(
  `${appearance.getText(ast)}\n({ start: ${effect.getText(ast)}, updateAppearance });`,
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  },
).outputText;
const settle = async () => {
  for (let turn = 0; turn < 8; turn++) await Promise.resolve();
};
function fixture(options = {}) {
  let resolveSave, rejectSave;
  const gate = new Promise((resolve, reject) => {
    resolveSave = resolve;
    rejectSave = reject;
  });
  const state = {
    save: {
      name: 'Original',
      appearance: { kind: 'bunny', drawingAssetId: 'old' },
      persona: 'old persona',
    },
    generation: 'before',
    busy: false,
    accepted: 0,
    errors: [],
    notices: [],
    assets: [],
    options: null,
  };
  const context = {
    Error,
    hydrated: true,
    blocked: false,
    incomingArtwork: {
      png: 'new-png',
      name: 'New friend',
      persona: 'new persona',
    },
    acceptedArtwork: { current: null },
    artworkEpoch: { current: 0 },
    friendSelection: { current: 0 },
    readCompanionSave: () => ({
      status: 'ready',
      snapshot: { generation: state.generation },
    }),
    portableArtwork: async (png) => png,
    keepDrawingAsset: async (png, name, options) => {
      state.options = options;
      await gate;
      if (!state.allowLateCommit && options.cancelled())
        throw new Error('canceled write');
      const asset = { id: 'new-id', png, name };
      state.assets.push(asset);
      return asset;
    },
    commitSave: (update) => {
      state.save = update(state.save);
    },
    setArtworkBusy: (value) => {
      state.busy = value;
      options.busySink?.(value);
    },
    setArtworkError: (value) => state.errors.push(value),
    setNotice: (value) => state.notices.push(value),
    setBackupStatus: (value) => state.errors.push(value),
    onArtworkAccepted: () => {
      state.accepted++;
    },
    queueMicrotask,
  };
  state.allowLateCommit = options.allowLateCommit;
  return {
    state,
    context,
    resolveSave,
    rejectSave,
    handlers: runInNewContext(code, context),
  };
}
const normal = fixture();
normal.handlers.start();
await settle();
assert.equal(normal.state.busy, true);
normal.resolveSave();
await settle();
assert.equal(normal.state.save.appearance.drawingAssetId, 'new-id');
assert.equal(normal.state.save.name, 'New friend');
assert.equal(normal.state.accepted, 1);
assert.equal(normal.state.busy, false);
for (const change of [
  { kind: 'cat', drawingAssetId: undefined },
  { drawingAssetId: 'other-friend' },
]) {
  const race = fixture();
  race.handlers.start();
  await settle();
  race.handlers.updateAppearance(change);
  const selected = race.state.save;
  race.resolveSave();
  await settle();
  assert.equal(
    race.state.save,
    selected,
    'Late handoff cannot replace newer friend/appearance/name',
  );
  assert.equal(
    race.state.assets[0].id,
    'new-id',
    'Incoming result still remains in the library',
  );
  assert.match(race.state.notices.at(-1), /지금 고른 친구/);
  assert.equal(race.state.busy, false);
  assert.equal(race.state.accepted, 1);
}
const reset = fixture();
reset.handlers.start();
await settle();
reset.state.generation = 'after';
reset.resolveSave();
await settle();
assert.equal(
  reset.state.assets.length,
  0,
  'Reset still cancels the durable write',
);
assert.equal(reset.state.save.appearance.drawingAssetId, 'old');
const unmounted = fixture();
const cleanup = unmounted.handlers.start();
await settle();
cleanup();
unmounted.resolveSave();
await settle();
assert.equal(unmounted.state.assets.length, 0);
assert.equal(unmounted.state.accepted, 0);
const failed = fixture();
failed.handlers.start();
await settle();
failed.rejectSave(new Error('Device storage is full'));
await settle();
assert.equal(failed.state.save.appearance.drawingAssetId, 'old');
assert.equal(failed.state.errors.at(-1), 'Device storage is full');
assert.equal(
  failed.context.acceptedArtwork.current,
  null,
  'Failed handoff remains retryable',
);
assert.equal(failed.state.busy, false);
assert.equal(failed.state.accepted, 0);
let sharedBusy = false;
const old = fixture({
  allowLateCommit: true,
  busySink: (value) => {
    sharedBusy = value;
  },
});
const newer = fixture({
  busySink: (value) => {
    sharedBusy = value;
  },
});
const cancelOld = old.handlers.start();
await settle();
cancelOld();
newer.handlers.start();
await settle();
assert.equal(sharedBusy, true);
old.resolveSave();
await settle();
assert.equal(
  sharedBusy,
  true,
  'Already-issued old transaction must not clear newer handoff busy state',
);
assert.equal(old.state.accepted, 0);
newer.resolveSave();
await settle();
assert.equal(sharedBusy, false);
const retry = fixture();
retry.handlers.start();
await settle();
retry.rejectSave(new Error('storage temporarily unavailable'));
await settle();
assert.equal(retry.context.acceptedArtwork.current, null);
retry.context.keepDrawingAsset = async (png, name) => ({
  png,
  name,
  id: 'retry-id',
});
retry.handlers.start();
await settle();
assert.equal(
  retry.state.save.appearance.drawingAssetId,
  'retry-id',
  'Explicit retry reuses existing PNG',
);
assert.equal(retry.state.accepted, 1);
assert.match(source, /onArtworkAccepted,\s*artworkRetry/);
assert.match(source, /setArtworkRetry\(\(attempt\) => attempt \+ 1\)/);
console.log(
  'PASS actual artwork handoff: durable preservation with latest friend choice, unchanged normal flow, reset, unmount and storage failures; no network.',
);
