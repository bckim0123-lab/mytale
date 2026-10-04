import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import {
  DEFAULT_APPEARANCE,
  sameCreatureAppearance,
} from '../app/creature-types.ts';

const nativeRequire = createRequire(import.meta.url);
const runtime = readFileSync('app/companion-world-runtime.ts', 'utf8');
const wrapper = readFileSync('app/companion-world.tsx', 'utf8');
const ast = ts.createSourceFile(
  'runtime.ts',
  runtime,
  ts.ScriptTarget.Latest,
  true,
);
function nodes(root, predicate) {
  const result = [];
  function visit(node) {
    if (predicate(node)) result.push(node);
    ts.forEachChild(node, visit);
  }
  visit(root);
  return result;
}
function actual(predicate) {
  const node = nodes(ast, predicate)[0];
  assert.ok(node, 'Actual runtime lifecycle code exists.');
  return node.getText(ast);
}
const watch = actual(
  (node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === 'watchDrawing',
);
const replacement = actual(
  (node) =>
    ts.isMethodDeclaration(node) && node.name.getText(ast) === 'setAppearance',
);
const dispose = actual(
  (node) =>
    ts.isMethodDeclaration(node) &&
    node.name.getText(ast) === 'dispose' &&
    node.getText(ast).includes('renderer.forceContextLoss()'),
);
const initialWatch = actual(
  (node) =>
    ts.isExpressionStatement(node) &&
    node.getText(ast) === 'watchDrawing(creature);',
);
const declarations = ['currentAppearance', 'creature'].map((name) =>
  actual(
    (node) => ts.isVariableDeclaration(node) && node.name.getText(ast) === name,
  ),
);
function compile(source) {
  return ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
}
const runtimeCode = compile(`
let disposed = false;
let ${declarations[0]};
let ${declarations[1]};
${watch}
${initialWatch}
({ ${replacement}, ${dispose}, rig: () => creature,
  setForest() {}, setPaused() {}, stop() {},
});`);
const rigCode = compile(readFileSync('app/drawing-creature-rig.ts', 'utf8'));
const plushCode = compile(readFileSync('app/creature-rig.ts', 'utf8'));
const wrapperCode = compile(wrapper);
const drawing = {
  ...DEFAULT_APPEARANCE,
  drawingAssetId: 'saved-illustration',
  drawingImage: 'data:image/png;base64,c3ludGhldGlj',
};

function harness(mode = 'home', initialAppearance = drawing) {
  const slots = [],
    worlds = [],
    images = [],
    timers = new Map();
  const events = [],
    resources = [];
  const host = new EventTarget();
  host.replaceChildren = () => events.push('clear-host');
  const window = new EventTarget();
  const document = new EventTarget();
  document.hidden = false;
  document.createElement = () => {
    const canvas = { width: 0, height: 0 };
    canvas.getContext = () => ({
      drawImage() {},
      getImageData() {
        const pixels = new Uint8ClampedArray(canvas.width * canvas.height * 4);
        for (let y = 0; y < canvas.height; y++)
          for (let x = 0; x < canvas.width; x++)
            if (
              ((x - canvas.width / 2) / (canvas.width * 0.35)) ** 2 +
                ((y - canvas.height / 2) / (canvas.height * 0.4)) ** 2 <
              1
            )
              pixels.set([245, 195, 210, 255], (y * canvas.width + x) * 4);
        return { data: pixels };
      },
    });
    return canvas;
  };
  const rigExports = {};
  runInNewContext(rigCode, {
    exports: rigExports,
    require: nativeRequire,
    document,
    Image: class {
      naturalWidth = 16;
      naturalHeight = 20;
      constructor() {
        images.push(this);
      }
    },
    setTimeout(callback, milliseconds) {
      assert.equal(milliseconds, 8000);
      const id = Symbol('decode-timeout');
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  });
  const plushExports = {};
  runInNewContext(plushCode, {
    exports: plushExports,
    require(name) {
      if (name === './drawing-creature-rig') return rigExports;
      if (name === './creature-types') return { DEFAULT_APPEARANCE };
      return nativeRequire(name);
    },
  });
  const noOp = () => {};
  function mountCompanionWorld(container, options) {
    assert.equal(container, host);
    const released = [];
    const resource = (name) => ({ dispose: () => released.push(name) });
    const renderer = {
      domElement: { removeEventListener: noOp, remove: noOp },
      dispose: () => released.push('renderer'),
      forceContextLoss() {
        // A synchronous context-loss event must not double-dispose this world.
        host.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
      },
    };
    const world = runInNewContext(runtimeCode, {
      options,
      home: options.mode === 'home',
      createCreature: plushExports.createCreature,
      sameCreatureAppearance,
      queueMicrotask,
      react: noOp,
      scene: { add: noOp, remove: noOp, clear: () => released.push('scene') },
      frame: 17,
      cancelAnimationFrame: () => released.push('frame'),
      resizeObserver: { disconnect: noOp },
      observer: { disconnect: noOp },
      blur: noOp,
      labelDisposers: [],
      renderer,
      pointerDown: noOp,
      pointerMove: noOp,
      pointerUp: noOp,
      pointerCancel: noOp,
      keyDown: noOp,
      keyUp: noOp,
      window,
      diorama: resource('diorama'),
      pawprints: resource('pawprints'),
      sun: { shadow: resource('shadow') },
      geometries: [resource('geometry')],
      materials: [resource('material')],
      textures: [resource('texture')],
      env: resource('environment'),
      labelLayer: { remove: noOp },
    });
    worlds.push({ world, options, released, originalRig: world.rig() });
    return world;
  }
  let cursor = 0,
    effects = [],
    dirty = false,
    mounted = true,
    output;
  let props = {
    mode,
    appearance: structuredClone(initialAppearance),
    forest: {
      chapter: 'garden',
      gardenBloom: true,
      choices: { craftDesign: 'heart' },
    },
    onInteract() {},
    onPet() {},
    onStatus: (text) => events.push(['status', text]),
    onReady: () => events.push('ready'),
    onUnavailable: () => events.push('unavailable'),
  };
  const ref = { current: null };
  const saved = JSON.stringify({
    appearance: props.appearance,
    forest: props.forest,
  });
  const exports = {};
  const changed = (old, deps) =>
    !old || deps.some((value, i) => !Object.is(value, old.deps[i]));
  const hooks = {
    forwardRef: (fn) => fn,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { value: initial };
      return [
        slots[index].value,
        (update) => {
          assert.ok(mounted, 'No wrapper state update after unmount.');
          const value =
            typeof update === 'function' ? update(slots[index].value) : update;
          if (!Object.is(slots[index].value, value)) {
            slots[index].value = value;
            dirty = true;
          }
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback(fn, deps) {
      const index = cursor++;
      if (changed(slots[index], deps)) slots[index] = { value: fn, deps };
      return slots[index].value;
    },
    useId: () => 'world-controls',
    useImperativeHandle(target, create) {
      target.current = create();
    },
    useEffect(work, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (changed(previous, deps))
        effects.push(() => {
          previous?.cleanup?.();
          slots[index] = { deps, cleanup: work() };
        });
    },
  };
  runInNewContext(wrapperCode, {
    exports,
    queueMicrotask,
    window,
    document,
    require(name) {
      if (name === 'react') return hooks;
      if (name === './companion-world-runtime') return { mountCompanionWorld };
      return nativeRequire(name);
    },
  });
  function elements(node) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(elements);
    return [node, ...elements(node.props?.children)];
  }
  const render = (patch = {}) => {
    props = { ...props, ...patch };
    cursor = 0;
    effects = [];
    dirty = false;
    output = exports.CompanionWorld(props, ref);
    for (const node of elements(output))
      if (node.props?.className === 'cw-webgl') node.props.ref.current = host;
    for (const effect of effects) effect();
    return output;
  };
  const flush = async () => {
    for (let count = 0; count < 12; count++) {
      await Promise.resolve();
      if (dirty && mounted) render();
    }
  };
  function trackRigResources(rig) {
    rig.root.traverse((object) => {
      if (!object.isMesh) return;
      const material = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const item of [
        object.geometry,
        ...material,
        ...material.map((item) => item.map).filter(Boolean),
      ]) {
        const record = { item, releases: 0 };
        item.addEventListener('dispose', () => record.releases++);
        resources.push(record);
      }
    });
  }
  render();
  return {
    images,
    worlds,
    events,
    timers,
    host,
    ref,
    resources,
    trackRigResources,
    render,
    flush,
    get html() {
      return renderToStaticMarkup(output);
    },
    get output() {
      return output;
    },
    get props() {
      return props;
    },
    assertSaved() {
      assert.equal(
        JSON.stringify({ appearance: props.appearance, forest: props.forest }),
        saved,
        'Display retry cannot replace the saved image or mutate story progress.',
      );
    },
    retry() {
      const button = elements(output).find(
        (node) =>
          node.type === 'button' && node.props.children === '3D 화면 다시 열기',
      );
      assert.ok(button, 'Actual JSX exposes an explicit retry button.');
      button.props.onClick();
    },
    unmount() {
      for (const slot of slots) slot.cleanup?.();
      mounted = false;
    },
  };
}

for (const mode of ['home', 'forest']) {
  for (const failure of ['decode', 'timeout']) {
    const test = harness(mode);
    await test.flush();
    assert.match(test.html, /aria-busy="true"/);
    assert.equal(
      test.events.includes('ready'),
      false,
      'A mounted empty cutout is not ready.',
    );
    const failedWorld = test.worlds[0];
    const staleLoad = test.images[0].onload;
    if (failure === 'decode') test.images[0].onerror();
    else [...test.timers.values()][0]();
    await test.flush();
    assert.match(test.html, /role="alert"/);
    assert.match(test.html, /3D 화면 다시 열기/);
    assert.match(test.html, /저장된 친구와 이야기는 그대로예요/);
    assert.equal(test.html.includes('아래의 이야기 모드'), mode === 'forest');
    assert.equal(
      failedWorld.originalRig.root.userData.drawingStatus,
      'disposed',
    );
    assert.equal(
      failedWorld.released.filter((name) => name === 'renderer').length,
      1,
    );
    assert.equal(
      test.events.filter((name) => name === 'unavailable').length,
      1,
    );
    assert.equal(test.events.includes('ready'), false);
    assert.equal(test.timers.size, 0);
    test.assertSaved();
    test.retry();
    await test.flush();
    assert.equal(test.worlds.length, 2);
    assert.match(test.html, /aria-busy="true"/);
    staleLoad();
    failedWorld.options.onCreatureStatus('ready');
    failedWorld.options.onCreatureStatus('error');
    await test.flush();
    assert.equal(
      test.events.includes('ready'),
      false,
      'A prior attempt cannot finish a retry.',
    );
    test.images[1].onload();
    await test.flush();
    assert.doesNotMatch(test.html, /3D 화면 다시 열기/);
    assert.match(test.html, /aria-busy="false"/);
    assert.equal(test.events.filter((name) => name === 'ready').length, 1);
    const successful = test.worlds[1].world.rig();
    assert.equal(successful.root.userData.drawingStatus, 'ready');
    assert.ok(successful.root.getObjectByName('InflatedDrawingSilhouette'));
    test.trackRigResources(successful);
    test.assertSaved();
    test.unmount();
    assert.equal(successful.root.userData.drawingStatus, 'disposed');
    assert.ok(test.resources.length >= 4);
    assert.ok(test.resources.every((resource) => resource.releases === 1));
    assert.equal(test.timers.size, 0);
  }
}

// Real replacement disposes A, whose ready promise resolves false. The actual
// watcher must ignore both that resolution and retained browser callbacks.
for (const replacementKind of ['drawing', 'plush']) {
  const test = harness();
  await test.flush();
  const old = test.worlds[0].world.rig();
  const lateLoad = test.images[0].onload;
  const lateError = test.images[0].onerror;
  const next =
    replacementKind === 'drawing'
      ? {
          ...drawing,
          drawingAssetId: 'new-saved-illustration',
          drawingImage: `${drawing.drawingImage}AA`,
        }
      : { ...DEFAULT_APPEARANCE };
  test.render({ appearance: next });
  await test.flush();
  assert.equal(old.root.userData.drawingStatus, 'disposed');
  lateLoad();
  lateError();
  await test.flush();
  assert.equal(test.events.includes('unavailable'), false);
  if (replacementKind === 'drawing') {
    assert.match(test.html, /aria-busy="true"/);
    assert.equal(test.events.includes('ready'), false);
    test.images[1].onload();
    await test.flush();
  } else {
    assert.equal(
      test.images.length,
      1,
      'Explicit plush selection does not generate or decode another drawing.',
    );
    assert.ok(test.worlds[0].world.rig().root.getObjectByName('BodyPivot'));
  }
  assert.equal(test.events.filter((name) => name === 'ready').length, 1);
  assert.doesNotMatch(test.html, /role="alert"/);
  test.unmount();
}

for (const immediate of [false, true]) {
  const test = harness();
  if (!immediate) await test.flush();
  const callbacks = test.images[0] && [
    test.images[0].onload,
    test.images[0].onerror,
  ];
  test.unmount();
  const before = test.events.length;
  callbacks?.forEach((callback) => callback());
  test.worlds[0]?.options.onCreatureStatus('ready');
  test.worlds[0]?.options.onCreatureStatus('error');
  await test.flush();
  assert.equal(
    test.events.length,
    before,
    'Unmount ignores lazy mount and late success/failure.',
  );
  assert.equal(test.timers.size, 0);
}

const plush = harness('home', DEFAULT_APPEARANCE);
await plush.flush();
assert.equal(plush.images.length, 0);
assert.equal(plush.events.filter((name) => name === 'ready').length, 1);
assert.match(plush.html, /aria-busy="false"/);
plush.host.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
await plush.flush();
assert.match(plush.html, /3D 화면 다시 열기/);
assert.equal(
  plush.worlds[0].released.filter((name) => name === 'renderer').length,
  1,
);
plush.unmount();

console.log(
  'World readiness passed: actual wrapper hooks/retry JSX + runtime watcher/replacement/disposal + real cutout/plush rigs; decode/timeout failure, honest loading/ready, retry success, resource ownership, replacement/unmount races, preserved saved image/story and context-loss fallback.',
);
