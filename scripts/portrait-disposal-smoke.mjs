import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import ts from 'typescript';

// Execute the real effect with real Three scene objects and offline GPU doubles.
// Only capture its otherwise-detached promise so a finally rejection fails here.
const source = readFileSync('app/companion-portrait.tsx', 'utf8');
const ast = ts.createSourceFile(
  'companion-portrait.tsx',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let effect;
function visit(node) {
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(ast) === 'useEffect'
  ) {
    assert.equal(effect, undefined, 'One portrait allocation effect exists');
    effect = node.arguments[0];
    assert.equal(node.arguments[1].getText(ast), '[signature]');
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(effect);
const actual = effect.getText(ast);
assert.equal(actual.match(/void \(async \(\) =>/g)?.length, 1);
const code = ts.transpileModule(
  `let pending; const start = ${actual.replace('void (async () =>', 'pending = (async () =>')};
   const cleanup = start(); ({ get pending() { return pending; }, cleanup });`,
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  },
).outputText;

const releaseOrder = [
  'rig',
  'environment',
  'room',
  'pmrem',
  'renderer',
  'context',
];
const signature = JSON.stringify({ kind: 'bunny', bodyColor: '#b6dced' });
function deferred() {
  let resolve;
  const promise = new Promise((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
function harness(options = {}) {
  const releases = [];
  const allocations = [];
  const states = [];
  const setupError = new Error(`Synthetic setup failure: ${options.failSetup}`);
  const acquire = (name) => {
    allocations.push(name);
    if (options.failSetup === name) throw setupError;
  };
  const release = (name) => () => {
    releases.push(name);
    if (options.failCleanup === name || options.failCleanup === 'all')
      throw new Error(`Synthetic GPU cleanup failure: ${name}`);
  };
  const modules = {
    three: {
      ...THREE,
      WebGLRenderer: class {
        constructor() {
          acquire('renderer');
        }
        domElement = {
          toDataURL: () => {
            acquire('snapshot');
            return 'data:image/png;base64,' + 'x'.repeat(600);
          },
        };
        setSize() {
          acquire('setup');
        }
        setPixelRatio() {}
        setClearColor() {}
        render() {
          acquire('render');
          if (options.cancelOnRender) test.cleanup();
        }
        dispose = release('renderer');
        forceContextLoss = release('context');
      },
      PMREMGenerator: class {
        constructor() {
          acquire('pmrem');
        }
        fromScene() {
          acquire('environment');
          return { texture: {}, dispose: release('environment') };
        }
        dispose = release('pmrem');
      },
    },
    './creature-rig': {
      createCreature(appearance) {
        assert.equal(
          JSON.stringify(appearance),
          options.signature ?? signature,
        );
        acquire('rig');
        return {
          root: new THREE.Group(),
          update() {},
          dispose: release('rig'),
        };
      },
    },
    'three/examples/jsm/environments/RoomEnvironment.js': {
      RoomEnvironment: class {
        constructor() {
          acquire('room');
        }
        dispose = release('room');
      },
    },
  };
  const test = runInNewContext(code, {
    signature: options.signature ?? signature,
    queueMicrotask,
    setPortrait(value) {
      states.push(value);
      options.onState?.(value);
    },
    require(name) {
      assert.ok(name in modules, 'Only known, offline modules may load');
      return options.importGate
        ? options.importGate.then(() => modules[name])
        : modules[name];
    },
  });
  return { ...test, releases, allocations, states, setupError };
}

// A failing release cannot change a successful snapshot, skip another resource,
// reject the async task, or run any release again on React effect cleanup.
for (const failCleanup of [undefined, ...releaseOrder, 'all']) {
  const test = harness({ failCleanup });
  await assert.doesNotReject(test.pending);
  assert.deepEqual(test.releases, releaseOrder);
  assert.equal(test.states.at(-1).signature, signature);
  assert.ok(test.states.at(-1).src.startsWith('data:image/png'));
  assert.equal(test.states.at(-1).unavailable, false);
  test.cleanup();
  test.cleanup();
  assert.deepEqual(test.releases, releaseOrder, 'Each resource releases once');
}

// Failed setup retains the unavailable fallback while releasing everything
// acquired before that failure, even when all of those releases also fail.
const failedSetupReleases = {
  renderer: [],
  setup: ['renderer', 'context'],
  pmrem: ['renderer', 'context'],
  room: ['pmrem', 'renderer', 'context'],
  environment: ['room', 'pmrem', 'renderer', 'context'],
  rig: ['environment', 'room', 'pmrem', 'renderer', 'context'],
  render: releaseOrder,
  snapshot: releaseOrder,
};
for (const [failSetup, expected] of Object.entries(failedSetupReleases)) {
  for (const failCleanup of [undefined, 'all']) {
    const test = harness({ failSetup, failCleanup });
    await assert.doesNotReject(test.pending);
    assert.deepEqual(test.releases, expected);
    assert.equal(test.states.at(-1).src, null);
    assert.equal(test.states.at(-1).loading, false);
    assert.equal(test.states.at(-1).unavailable, true);
    assert.equal(test.states.filter((state) => state.unavailable).length, 1);
    test.cleanup();
    test.cleanup();
    assert.deepEqual(test.releases, expected);
  }
}

// Synchronous context loss/unmount during render drains the stack exactly once,
// prevents success publication, and makes the finally cleanup harmless.
for (const failCleanup of [undefined, ...releaseOrder, 'all']) {
  const test = harness({ cancelOnRender: true, failCleanup });
  await assert.doesNotReject(test.pending);
  assert.deepEqual(test.releases, releaseOrder);
  assert.equal(
    test.states.some((state) => state.src || state.unavailable),
    false,
  );
  test.cleanup();
  assert.deepEqual(test.releases, releaseOrder);
}

// Replacing an old signature during lazy imports allocates no old renderer and
// cannot overwrite the next friend's already-completed portrait.
const gate = deferred();
let displayed;
const old = harness({
  importGate: gate.promise,
  onState: (state) => {
    displayed = state;
  },
});
await Promise.resolve();
old.cleanup();
const nextSignature = JSON.stringify({ kind: 'bear', bodyColor: '#f7b9bd' });
const current = harness({
  signature: nextSignature,
  failCleanup: 'all',
  onState: (state) => {
    displayed = state;
  },
});
await assert.doesNotReject(current.pending);
gate.resolve();
await assert.doesNotReject(old.pending);
assert.equal(displayed.signature, nextSignature);
assert.ok(displayed.src);
assert.deepEqual(old.allocations, []);
assert.deepEqual(old.releases, []);
assert.deepEqual(current.releases, releaseOrder);
old.cleanup();
current.cleanup();

// Generated portraits never enter the 3D allocation effect at all.
const drawing = harness({
  signature: JSON.stringify({ drawingAssetId: 'a'.repeat(64) }),
});
assert.equal(drawing.pending, undefined);
assert.equal(drawing.cleanup, undefined);
assert.deepEqual(drawing.allocations, []);

console.log(
  'Portrait disposal passed: actual effect, every throwing disposer/setup stage, preserved success/fallback, independent context release, idempotence, render cancellation and old-signature import races; offline GPU doubles only.',
);
