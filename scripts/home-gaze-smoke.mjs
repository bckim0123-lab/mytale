import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as T from 'three';
import ts from 'typescript';
import { createServer } from 'vite';

const source = readFileSync('app/companion-world-runtime.ts', 'utf8');
const ast = ts.createSourceFile(
  'runtime.ts',
  source,
  ts.ScriptTarget.Latest,
  true,
);
const nodes = [];
function visit(node) {
  nodes.push(node);
  ts.forEachChild(node, visit);
}
visit(ast);
function actualFunction(name) {
  const found = nodes.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === name,
  );
  assert.ok(found, `Actual ${name} function exists`);
  return found.getText(ast).replace(/^export\s+/, '');
}
const turn = nodes.find(
  (node) => ts.isMethodDeclaration(node) && node.name.getText(ast) === 'turn',
);
const disposal = nodes.find(
  (node) =>
    ts.isMethodDeclaration(node) &&
    node.name.getText(ast) === 'dispose' &&
    node.getText(ast).includes('renderer.forceContextLoss()'),
);
const intersection = nodes.find(
  (node) =>
    ts.isNewExpression(node) &&
    node.expression.getText(ast) === 'IntersectionObserver',
);
const gaze = nodes.find(
  (node) =>
    ts.isVariableStatement(node) &&
    node.getText(ast).startsWith('const gaze ='),
);
const reducedGuard = nodes.find(
  (node) =>
    ts.isIfStatement(node) &&
    node.expression.getText(ast) === 'home && reduced.matches',
);
const update = nodes.find(
  (node) =>
    ts.isExpressionStatement(node) &&
    ts.isCallExpression(node.expression) &&
    node.expression.expression.getText(ast) === 'creature.update',
);
assert.ok(turn && disposal && intersection && gaze && reducedGuard && update);
const compile = (value) =>
  ts.transpileModule(value, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
const helpers = runInNewContext(
  compile(
    `${actualFunction('getHomeGazeTarget')}\n${actualFunction('createWorldPointerGesture')}\n({ getHomeGazeTarget, createWorldPointerGesture });`,
  ),
  { T },
);
const options = { drawing: false, reducedMotion: false };
const center = { x: 200, y: 150, width: 400, height: 300 };
const neutral = (value) => {
  assert.equal(value.lookX, 0);
  assert.equal(value.lookY, 0);
};
neutral(helpers.getHomeGazeTarget(center, 0, options));
neutral(helpers.getHomeGazeTarget(null, 0, options));
for (const field of ['x', 'y', 'width', 'height']) {
  for (const value of [NaN, Infinity, -Infinity])
    neutral(
      helpers.getHomeGazeTarget({ ...center, [field]: value }, 0, options),
    );
}
for (const value of [NaN, Infinity, -Infinity])
  neutral(helpers.getHomeGazeTarget(center, value, options));
for (const invalid of [
  { width: 0 },
  { height: -1 },
  { x: -1 },
  { x: 401 },
  { y: -1 },
  { y: 301 },
])
  neutral(helpers.getHomeGazeTarget({ ...center, ...invalid }, 0, options));
assert.equal(
  helpers.getHomeGazeTarget({ ...center, x: 400 }, 0, options).lookX,
  0.45,
);
assert.equal(
  helpers.getHomeGazeTarget({ ...center, x: 0 }, 0, options).lookX,
  -0.45,
);
assert.equal(
  helpers.getHomeGazeTarget({ ...center, y: 300 }, 0, options).lookY,
  0.3,
);
assert.equal(
  helpers.getHomeGazeTarget({ ...center, y: 0 }, 0, options).lookY,
  -0.3,
);
for (const relativeYaw of [
  0,
  0.42,
  -0.42,
  Math.PI / 2,
  -Math.PI / 2,
  Math.PI,
]) {
  const point = { ...center, x: 400, y: 300 };
  const result = helpers.getHomeGazeTarget(point, relativeYaw, options);
  assert.ok(Number.isFinite(result.lookX) && Number.isFinite(result.lookY));
  assert.ok(result.lookX >= 0 && result.lookX <= 0.45);
  assert.ok(result.lookY >= 0 && result.lookY <= 0.3);
  if (Math.abs(relativeYaw) >= Math.PI / 2) {
    assert.ok(Math.abs(result.lookX) < 1e-12 && Math.abs(result.lookY) < 1e-12);
  }
  neutral(
    helpers.getHomeGazeTarget(point, relativeYaw, {
      ...options,
      reducedMotion: true,
    }),
  );
  assert.equal(
    helpers.getHomeGazeTarget(point, relativeYaw, { ...options, drawing: true })
      .lookY,
    0,
  );
}

const handlerCode = compile(`
let home = initialHome, paused = false, visible = true, disposed = false;
let homeGazePoint = null, orbit = 0.42, pressedTarget = null;
let width = 400, height = 300, frame = 0, last = 0, elapsed = 0;
let destination = null, pendingId = null, journeyTarget = null, pathQueue = [];
let action = 'idle', actionId = 0, actionUntil = 0;
const pointerGesture = createWorldPointerGesture();
const keys = new Set(), joystick = { set() {}, lengthSq: () => 0 };
const cursor = { visible: false }, hud = null, tags = [];
let creature = { root: new T.Group(), update(dt, time, input) { calls.frames.push(input); }, dispose() {} };
const camera = { position: new T.Vector3(0, 2.9, 6.1), aspect: 1, updateProjectionMatrix() {} };
const requestAnimationFrame = () => ++calls.scheduled;
const cancelAnimationFrame = () => {};
function pickForestTarget() { calls.picks++; return { id: 'forest-target' }; }
function walkTo(id) { calls.walks.push(id); }
function navigate() { calls.navigates++; }
function react(value) { calls.actions.push(value); }
${[
  'rememberHomeGaze',
  'pointerDown',
  'pointerMove',
  'pointerUp',
  'cancelPointerGesture',
  'pointerCancel',
  'cancelJourney',
  'stop',
  'setPaused',
  'blur',
  'resize',
  'pet',
  'animate',
]
  .map(actualFunction)
  .join('\n')}
function turn ${turn.getText(ast).slice('turn'.length)}
function dispose ${disposal.getText(ast).slice('dispose'.length)}
const intersect = ${intersection.arguments[0].getText(ast)};
function renderReaction() {
  const dt = 1 / 60, moving = false;
  elapsed += dt;
  ${reducedGuard.getText(ast)}
  ${gaze.getText(ast)}
  ${update.getText(ast)}
}
({ pointerDown, pointerMove, pointerUp, pointerCancel, stop, blur, setPaused, resize,
   animate, turn, dispose, intersect, renderReaction,
   useRig(value) { creature = value; },
   cameraYaw(value) { camera.position.set(Math.sin(value) * 6.1, 2.9, Math.cos(value) * 6.1); },
   snapshot: () => ({ point: homeGazePoint, orbit, owner: pointerGesture.pointerId, paused, visible, disposed }) });
`);
function fixture(home = true) {
  const calls = {
    frames: [],
    scheduled: 0,
    pets: 0,
    picks: 0,
    walks: [],
    navigates: 0,
    actions: [],
    removed: [],
    captures: new Set(),
  };
  const document = { hidden: false };
  const reduced = { matches: false };
  const noop = () => {};
  const renderer = {
    domElement: {
      getBoundingClientRect: () => ({
        left: 10,
        top: 20,
        width: 400,
        height: 300,
      }),
      setPointerCapture: (id) => calls.captures.add(id),
      hasPointerCapture: (id) => calls.captures.has(id),
      releasePointerCapture: (id) => calls.captures.delete(id),
      focus: noop,
      removeEventListener: (event) => calls.removed.push(event),
      remove: noop,
    },
    setSize: noop,
    dispose: noop,
    forceContextLoss: noop,
  };
  const api = runInNewContext(handlerCode, {
    T,
    ...helpers,
    initialHome: home,
    calls,
    document,
    reduced,
    renderer,
    host: { clientWidth: 400, clientHeight: 300 },
    options: { onStatus: noop, onPet: () => calls.pets++ },
    resizeObserver: { disconnect: noop },
    observer: { disconnect: noop },
    labelDisposers: [],
    keyDown: noop,
    keyUp: noop,
    window: { removeEventListener: noop },
    diorama: null,
    pawprints: { dispose: noop },
    sun: { shadow: { dispose: noop } },
    geometries: [],
    materials: [],
    textures: [],
    env: { dispose: noop },
    labelLayer: { remove: noop },
    scene: { clear: noop },
  });
  return { api, calls, document, reduced };
}
const pointer = {
  pointerId: 1,
  clientX: 410,
  clientY: 170,
  button: 0,
  buttons: 0,
  isPrimary: true,
  pointerType: 'mouse',
  type: 'pointermove',
};
const pointPresent = (test) => assert.ok(test.api.snapshot().point);
const pointCleared = (test) => assert.equal(test.api.snapshot().point, null);
const hover = fixture();
hover.api.pointerMove(pointer);
pointPresent(hover);
assert.equal(hover.api.snapshot().orbit, 0.42);
assert.equal(hover.api.snapshot().owner, null);
assert.equal(hover.calls.captures.size, 0);
hover.api.renderReaction();
assert.equal(
  hover.calls.frames.at(-1).lookX,
  0.45,
  'Actual frame sends gaze to the rig',
);
assert.equal(hover.calls.frames.at(-1).lookY, 0);
for (const ignored of [
  { isPrimary: false },
  { buttons: 1 },
  { pointerType: 'touch' },
  { pointerType: '' },
]) {
  const test = fixture();
  test.api.pointerMove({ ...pointer, ...ignored });
  pointCleared(test);
}
const pen = fixture();
pen.api.pointerMove({ ...pointer, pointerType: 'pen' });
pointPresent(pen);

const touch = fixture();
const pressed = {
  ...pointer,
  pointerType: 'touch',
  buttons: 1,
  type: 'pointerdown',
};
touch.api.pointerDown(pressed);
pointPresent(touch);
assert.equal(touch.api.snapshot().owner, 1);
const foreign = { ...pressed, pointerId: 2, isPrimary: false, clientX: 200 };
const ownedPoint = touch.api.snapshot().point;
touch.api.pointerDown(foreign);
touch.api.pointerMove(foreign);
touch.api.pointerUp(foreign);
touch.api.pointerCancel({ ...foreign, type: 'pointercancel' });
assert.equal(
  touch.api.snapshot().point,
  ownedPoint,
  'Another finger cannot change the gaze owner',
);
touch.api.pointerUp({ ...pressed, buttons: 0, type: 'pointerup' });
pointCleared(touch);
assert.equal(touch.calls.pets, 1, 'A stationary touch remains exactly one pet');
touch.api.pointerUp(pressed);
assert.equal(touch.calls.pets, 1);

const drag = fixture();
drag.api.pointerDown({ ...pressed, clientX: 100 });
for (let i = 1; i <= 12; i++)
  drag.api.pointerMove({
    ...pressed,
    clientX: 100 + i * 2,
    type: 'pointermove',
  });
pointCleared(drag);
assert.ok(Math.abs(drag.api.snapshot().orbit - (0.42 - 24 * 0.009)) < 1e-12);
drag.api.pointerCancel({ ...pressed, type: 'pointerleave' });
assert.equal(
  drag.api.snapshot().owner,
  1,
  'Leaving during capture does not cancel orbit',
);
drag.api.pointerUp({ ...pressed, clientX: 124, type: 'pointerup' });
assert.equal(drag.calls.pets, 0, 'An orbit never becomes a gaze-induced pet');

for (const event of ['pointercancel', 'lostpointercapture']) {
  const test = fixture();
  test.api.pointerDown(pressed);
  test.api.pointerCancel({ ...pressed, type: event });
  pointCleared(test);
  assert.equal(test.api.snapshot().owner, null);
  assert.equal(test.calls.pets, 0);
  const hovering = fixture();
  hovering.api.pointerMove(pointer);
  hovering.api.pointerCancel({ ...pointer, type: event });
  pointCleared(hovering);
}
const secondaryButton = fixture();
secondaryButton.api.pointerMove(pointer);
pointPresent(secondaryButton);
secondaryButton.api.pointerDown({ ...pointer, button: 2, buttons: 2 });
pointCleared(secondaryButton);
assert.equal(secondaryButton.api.snapshot().owner, null);
assert.equal(secondaryButton.calls.pets, 0);
for (const clear of [
  (test) => test.api.pointerCancel({ ...pointer, type: 'pointerleave' }),
  (test) => test.api.stop(),
  (test) => test.api.blur(),
  (test) => test.api.setPaused(true),
  (test) => test.api.resize(),
  (test) => test.api.turn(1),
  (test) => test.api.intersect([{ isIntersecting: false }]),
  (test) => {
    test.document.hidden = true;
    test.api.animate(16);
  },
  (test) => test.api.dispose(),
]) {
  const test = fixture();
  test.api.pointerMove(pointer);
  pointPresent(test);
  clear(test);
  pointCleared(test);
  assert.equal(test.calls.pets, 0);
}
for (const block of ['paused', 'hidden', 'offscreen', 'reduced']) {
  const test = fixture();
  if (block === 'paused') test.api.setPaused(true);
  if (block === 'hidden') test.document.hidden = true;
  if (block === 'offscreen') test.api.intersect([{ isIntersecting: false }]);
  if (block === 'reduced') test.reduced.matches = true;
  test.api.pointerMove(pointer);
  pointCleared(test);
}
hover.reduced.matches = true;
hover.api.renderReaction();
pointCleared(hover);
neutral(hover.calls.frames.at(-1));
hover.reduced.matches = false;
hover.api.renderReaction();
neutral(hover.calls.frames.at(-1));
const forest = fixture(false);
forest.api.pointerMove(pointer);
pointCleared(forest);
forest.api.pointerDown(pressed);
pointCleared(forest);
forest.api.pointerUp(pressed);
assert.equal(forest.calls.picks, 1);
assert.deepEqual(forest.calls.walks, ['forest-target']);
assert.equal(forest.calls.pets, 0);
forest.api.renderReaction();
neutral(forest.calls.frames.at(-1));
const cleanup = fixture();
cleanup.api.dispose();
assert.equal(
  cleanup.calls.removed.filter((event) => event === 'pointerleave').length,
  1,
);
assert.match(
  source,
  /if \(home\)\s*renderer\.domElement\.addEventListener\('pointerleave', pointerCancel\)/,
);

const server = await createServer({
  configFile: false,
  cacheDir: 'node_modules/.vite-home-gaze-test',
  root: process.cwd(),
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false },
});
const originalImage = globalThis.Image;
const originalDocument = globalThis.document;
try {
  const { createCreature, DEFAULT_APPEARANCE } = await server.ssrLoadModule(
    '/app/creature-rig.ts',
  );
  const { createDrawingCreature } = await server.ssrLoadModule(
    '/app/drawing-creature-rig.ts',
  );
  // Supply only a synthetic local decoder/canvas, then exercise the real alpha
  // geometry, materials and update function. No browser or image service runs.
  const decodedImages = [];
  globalThis.Image = class {
    naturalWidth = 64;
    naturalHeight = 80;
    onload = null;
    onerror = null;
    src = '';
    constructor() {
      decodedImages.push(this);
    }
  };
  globalThis.document = {
    // oxlint-disable-next-line typescript/no-deprecated -- Minimal local canvas test double.
    createElement() {
      const canvas = {
        width: 0,
        height: 0,
        getContext() {
          return {
            drawImage() {},
            getImageData() {
              const data = new Uint8ClampedArray(
                canvas.width * canvas.height * 4,
              );
              for (let y = 0; y < canvas.height; y++)
                for (let x = 0; x < canvas.width; x++)
                  if (
                    ((x - canvas.width / 2) / (canvas.width * 0.34)) ** 2 +
                      ((y - canvas.height / 2) / (canvas.height * 0.4)) ** 2 <
                    1
                  )
                    data.set([240, 180, 190, 255], (y * canvas.width + x) * 4);
              return { data };
            },
          };
        },
      };
      return canvas;
    },
  };
  const resourceSnapshot = (rig) => {
    const result = [];
    rig.root.traverse((node) => {
      const materials = Array.isArray(node.material)
        ? node.material
        : [node.material];
      result.push([
        node.uuid,
        node.geometry?.uuid,
        ...materials.flatMap((material) => [
          material?.uuid,
          material?.map?.uuid,
        ]),
      ]);
    });
    return result;
  };
  for (const drawing of [false, true]) {
    const appearance = { ...DEFAULT_APPEARANCE };
    const rig = drawing
      ? createDrawingCreature({
          ...appearance,
          drawingImage: 'data:image/png;base64,test',
        })
      : createCreature(appearance);
    if (drawing) decodedImages.at(-1).onload();
    const base = drawing
      ? createDrawingCreature({
          ...appearance,
          drawingImage: 'data:image/png;base64,test',
        })
      : createCreature(appearance);
    if (drawing) {
      decodedImages.at(-1).onload();
      assert.equal(await rig.ready, true);
      assert.equal(await base.ready, true);
      assert.ok(rig.root.getObjectByName('InflatedDrawingSilhouette'));
    }
    const originalAppearance = JSON.stringify(appearance);
    const originalResources = resourceSnapshot(rig);
    const test = fixture();
    test.api.useRig(rig);
    test.api.pointerMove({ ...pointer, clientY: 320 });
    for (let i = 0; i < 120; i++) {
      test.api.renderReaction();
      base.update(1 / 60, (i + 1) / 60, { moving: false, action: 'idle' });
    }
    const name = drawing ? 'DrawingBody' : 'HeadPivot';
    const pose = rig.root.getObjectByName(name).rotation;
    const baseline = base.root.getObjectByName(name).rotation;
    assert.ok(
      Math.abs(pose.y - baseline.y - (drawing ? 0.0675 : 0.153)) < 0.00001,
    );
    if (drawing) {
      assert.equal(
        pose.x,
        baseline.x,
        'Painted anatomy receives no synthetic head pitch',
      );
      assert.equal(rig.root.getObjectByName('HeadPivot'), undefined);
    } else assert.ok(Math.abs(pose.x - baseline.x - 0.063) < 0.00001);
    assert.equal(
      rig.root.rotation.y,
      0,
      'Gaze never rotates the world-facing root',
    );
    assert.equal(JSON.stringify(appearance), originalAppearance);
    assert.deepEqual(
      resourceSnapshot(rig),
      originalResources,
      'No mesh, geometry, material, texture or facial part is rebuilt',
    );
    test.api.cameraYaw(Math.PI);
    for (let i = 0; i < 120; i++) test.api.renderReaction();
    assert.ok(
      Math.abs(rig.root.getObjectByName(name).rotation.y) < 0.04,
      'Rear view returns to the existing idle pose',
    );
    rig.dispose();
    base.dispose();
  }
} finally {
  if (originalImage === undefined) delete globalThis.Image;
  else globalThis.Image = originalImage;
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
  await server.close();
}
console.log(
  'Home gaze passed: finite/front-only targets, actual pointer ownership/orbit/tap handlers, lifecycle clearing, forest isolation, and original rig/anatomy preservation; no browser/provider calls.',
);
