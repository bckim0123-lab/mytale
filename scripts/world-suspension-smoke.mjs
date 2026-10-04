import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const runtime = readFileSync('app/companion-world-runtime.ts', 'utf8');
const ast = ts.createSourceFile(
  'runtime.ts',
  runtime,
  ts.ScriptTarget.Latest,
  true,
);
function findAll(root, predicate) {
  const result = [];
  function visit(node) {
    if (predicate(node)) result.push(node);
    ts.forEachChild(node, visit);
  }
  visit(root);
  return result;
}
function actualFunction(name) {
  const node = findAll(
    ast,
    (item) => ts.isFunctionDeclaration(item) && item.name?.text === name,
  )[0];
  assert.ok(node, `Actual runtime function ${name} exists`);
  return node.getText(ast);
}
const environmentFactory = ts.transpileModule(
  `${actualFunction('createWorldEnvironment')} createWorldEnvironment;`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
function lightingHarness(failAt, cleanupThrows = false) {
  const calls = [];
  const originalError = new Error(`lighting failure: ${failAt}`);
  const cleanup = (name) => () => {
    calls.push(name);
    if (cleanupThrows) throw new Error(`cleanup failure: ${name}`);
  };
  const environment = { texture: {}, dispose: cleanup('target') };
  const renderer = {
    dispose: cleanup('renderer'),
    forceContextLoss: cleanup('context'),
    domElement: { remove: cleanup('canvas') },
  };
  const factory = runInNewContext(environmentFactory, {
    T: {
      PMREMGenerator: class {
        constructor(receivedRenderer) {
          assert.equal(receivedRenderer, renderer);
          if (failAt === 'pmrem') throw originalError;
        }
        fromScene(room, blur) {
          assert.ok(room);
          assert.equal(blur, 0.04);
          if (failAt === 'render') throw originalError;
          return environment;
        }
        dispose = cleanup('pmrem');
      },
    },
    RoomEnvironment: class {
      constructor() {
        if (failAt === 'room') throw originalError;
      }
      dispose = cleanup('room');
    },
  });
  return { run: () => factory(renderer), calls, originalError, environment };
}
for (const failAt of ['pmrem', 'room', 'render']) {
  for (const cleanupThrows of [false, true]) {
    const lighting = lightingHarness(failAt, cleanupThrows);
    assert.throws(
      lighting.run,
      (error) => error === lighting.originalError,
      'Cleanup preserves the original error for the world fallback.',
    );
    assert.deepEqual(lighting.calls, [
      ...(failAt === 'render' ? ['room'] : []),
      ...(failAt !== 'pmrem' ? ['pmrem'] : []),
      'renderer',
      'context',
      'canvas',
    ]);
  }
}
for (const cleanupThrows of [false, true]) {
  const lighting = lightingHarness(null, cleanupThrows);
  assert.equal(lighting.run(), lighting.environment);
  assert.deepEqual(
    lighting.calls,
    ['room', 'pmrem'],
    'Successful startup keeps the returned target and renderer alive for world.dispose().',
  );
}
const actualMount = actualFunction('mountCompanionWorld');
assert.match(actualMount, /const env = createWorldEnvironment\(renderer\)/);
assert.doesNotMatch(actualMount, /new (?:T\.PMREMGenerator|RoomEnvironment)/);
assert.ok(
  actualMount.indexOf('createWorldEnvironment(renderer)') <
    actualMount.indexOf('const geometries ='),
  'Lighting initialization cleanup runs before world-owned geometry allocation.',
);
const code = ts.transpileModule(
  `
let paused = true, disposed = false, frame = 0, last = 1000, elapsed = 7;
let visible = true, home = false, destination = null;
let scheduled = 0, stopped = 0;
const document = { hidden: false };
const keys = new Set();
const joystick = { lengthSq: () => 0 };
const moveVector = { set: () => { throw new Error('scene-work-reached'); } };
const requestAnimationFrame = () => ++scheduled;
const stop = () => stopped++;
${actualFunction('animate')}
${actualFunction('setPaused')}
({ animate, setPaused, snapshot: () => ({ paused, frame, last, elapsed, scheduled, stopped }),
   hidden: value => document.hidden = value, visible: value => visible = value,
   disposed: value => disposed = value });
`,
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  },
).outputText;
const world = runInNewContext(code);
world.animate(1060);
assert.equal(
  world.snapshot().elapsed,
  7,
  'covered world does not advance animations or simulation',
);
assert.equal(
  world.snapshot().last,
  1060,
  'paused frame updates clock so resume cannot jump',
);
assert.equal(
  world.snapshot().scheduled,
  1,
  'only one lightweight next frame remains scheduled',
);
world.setPaused(true);
assert.equal(
  world.snapshot().stopped,
  1,
  'opening a covering dialog cancels travel/input',
);
world.setPaused(false);
assert.equal(world.snapshot().paused, false);
assert.equal(
  world.snapshot().stopped,
  1,
  'resuming does not reconstruct or restart the scene',
);
world.hidden(true);
world.animate(1110);
assert.equal(
  world.snapshot().elapsed,
  7,
  'background-tab suspension remains effective',
);
world.hidden(false);
world.visible(false);
world.animate(1160);
assert.equal(
  world.snapshot().elapsed,
  7,
  'idle offscreen suspension remains effective',
);
world.visible(true);
assert.throws(
  () => world.animate(1200),
  /scene-work-reached/,
  'uncovering resumes the actual scene path',
);
assert.equal(world.snapshot().elapsed, 7.04);
const beforeDispose = world.snapshot().scheduled;
world.disposed(true);
world.animate(1250);
assert.equal(
  world.snapshot().scheduled,
  beforeDispose,
  'disposed world never reschedules',
);

const travelStop = runInNewContext(
  ts.transpileModule(
    `
let destination = { x: 1 }, pendingId = 'garden-gate', journeyTarget = { x: 2 }, pathQueue = [1];
const keys = new Set(['w']), joystick = { set() {} }, cursor = { visible: true };
const statuses = [], options = { onStatus: text => statuses.push(text) };
function cancelPointerGesture() {}
${actualFunction('cancelJourney')}
${actualFunction('stop')}
${actualFunction('keyDown')}
const home = false, paused = false;
({ stop, keyDown, cancelJourney, statuses, start: () => { destination = {}; pendingId = 'garden-gate'; journeyTarget = {}; }, snapshot: () => ({ destination, pendingId, journeyTarget, pathQueue, visible: cursor.visible, keyCount: keys.size }) });
`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText,
);
travelStop.stop();
assert.equal(travelStop.statuses.length, 1);
assert.equal(
  travelStop.statuses[0],
  '',
  'Canceled travel cannot retain an in-progress status.',
);
assert.equal(travelStop.snapshot().destination, null);
assert.equal(travelStop.snapshot().pendingId, null);
assert.equal(travelStop.snapshot().journeyTarget, null);
assert.equal(travelStop.snapshot().pathQueue.length, 0);
assert.equal(travelStop.snapshot().keyCount, 0);
assert.equal(travelStop.snapshot().visible, false);
travelStop.stop();
assert.equal(
  travelStop.statuses.length,
  1,
  'Idle cleanup preserves unrelated load/error messages.',
);
travelStop.start();
travelStop.keyDown({ key: 'ArrowRight', preventDefault() {} });
assert.equal(travelStop.snapshot().destination, null);
assert.equal(
  travelStop.statuses.length,
  2,
  'Keyboard steering clears automatic-travel status.',
);
travelStop.start();
travelStop.cancelJourney();
assert.equal(
  travelStop.statuses.length,
  3,
  'Manual joystick cancellation clears automatic-travel status.',
);
const steeringBranch = findAll(
  ast,
  (node) =>
    ts.isIfStatement(node) &&
    node.expression.getText(ast) === 'moveVector.lengthSq() > 0.04',
)[0];
assert.ok(steeringBranch);
assert.match(
  steeringBranch.thenStatement.getText(ast),
  /cancelJourney\(\)/,
  'The actual animation steering branch uses the same cancellation.',
);

const wrapper = readFileSync('app/companion-world.tsx', 'utf8');
const disposeNode = findAll(
  ast,
  (node) =>
    ts.isMethodDeclaration(node) &&
    node.name.getText(ast) === 'dispose' &&
    node.getText(ast).includes('renderer.forceContextLoss()'),
)[0];
assert.ok(disposeNode);
const disposalCalls = [];
const record = (name) => () => disposalCalls.push(name);
const disposable = (name) => ({ dispose: record(name) });
const disposal = runInNewContext(
  ts.transpileModule(
    `
let disposed = false;
function dispose() ${disposeNode.body.getText(ast)}
({ dispose, isDisposed: () => disposed });
`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText,
  {
    frame: 17,
    cancelAnimationFrame: record('frame'),
    resizeObserver: { disconnect: record('resize') },
    observer: { disconnect: record('intersection') },
    blur: record('blur'),
    labelDisposers: [record('labels')],
    renderer: {
      domElement: { removeEventListener() {}, remove: record('canvas') },
      dispose: record('renderer'),
      // Model an unavailable WEBGL_lose_context extension: no implicit cleanup.
      forceContextLoss() {},
    },
    pointerDown() {},
    pointerMove() {},
    pointerUp() {},
    pointerCancel() {},
    keyDown() {},
    keyUp() {},
    window: { removeEventListener() {} },
    creature: disposable('creature'),
    diorama: disposable('diorama'),
    pawprints: disposable('instance-buffer'),
    sun: { shadow: disposable('shadow-target') },
    geometries: [disposable('geometry')],
    materials: [disposable('material')],
    textures: [disposable('texture')],
    env: disposable('environment'),
    labelLayer: { remove: record('label-layer') },
    scene: { clear: record('scene') },
  },
);
disposal.dispose();
assert.equal(disposal.isDisposed(), true);
for (const resource of [
  'frame',
  'resize',
  'intersection',
  'creature',
  'diorama',
  'instance-buffer',
  'shadow-target',
  'geometry',
  'material',
  'texture',
  'environment',
  'renderer',
  'canvas',
  'label-layer',
  'scene',
]) {
  assert.equal(
    disposalCalls.filter((item) => item === resource).length,
    1,
    `${resource} released without context-loss support`,
  );
}
const disposedCount = disposalCalls.length;
disposal.dispose();
assert.equal(
  disposalCalls.length,
  disposedCount,
  'Repeated cleanup is harmless.',
);

const wrapperAst = ts.createSourceFile(
  'wrapper.tsx',
  wrapper,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const mount = findAll(
  wrapperAst,
  (node) =>
    ts.isCallExpression(node) &&
    node.expression.getText(wrapperAst) === 'mountCompanionWorld',
)[0];
assert.ok(
  mount.arguments[1].properties.some(
    (node) =>
      ts.isPropertyAssignment(node) &&
      node.name.getText(wrapperAst) === 'paused' &&
      node.initializer.getText(wrapperAst) === 'latest.current.paused',
  ),
  'lazy world mount receives the latest covering-dialog state',
);
const effects = findAll(
  wrapperAst,
  (node) =>
    ts.isCallExpression(node) &&
    node.expression.getText(wrapperAst) === 'useEffect',
);
const mountEffect = effects.find((node) =>
  node.arguments[0].getText(wrapperAst).includes('mountCompanionWorld'),
);
assert.doesNotMatch(
  mountEffect.arguments[1].getText(wrapperAst),
  /paused/,
  'pause never remounts or loses forest position',
);
const pauseEffect = effects.find((node) =>
  node.arguments[0].getText(wrapperAst).includes('world.setPaused'),
);
assert.match(pauseEffect.arguments[1].getText(wrapperAst), /props\.paused/);
assert.match(
  pauseEffect.arguments[0].getText(wrapperAst),
  /if \(props\.paused\)[\s\S]*queueMicrotask[\s\S]*if \(!canceled\) stop\(\)/,
  'wrapper releases captured joystick and held keys too',
);
const experience = readFileSync('app/companion-experience.tsx', 'utf8');
assert.equal(
  (
    experience.match(
      /paused=\{Boolean\(book \|\| chat \|\| settings \|\| toybox\)\}/g,
    ) || []
  ).length,
  2,
  'home and forest both pause under every full-cover dialog',
);
const css = readFileSync('app/companion.css', 'utf8');
assert.match(
  css,
  /\.cw-world-forest \.cw-webgl\s*\{\s*touch-action:\s*pan-y;/,
  'forest allows vertical reading gestures',
);
assert.match(
  wrapper,
  /style=\{\{ touchAction: 'none' \}\}/,
  'joystick retains dedicated game gestures',
);
console.log(
  'World suspension passed: lighting startup failures/cleanup ownership, actual frame guard/clock, dialog pause/resume, lazy mount, no remount, disposal and forest-only vertical scrolling.',
);
