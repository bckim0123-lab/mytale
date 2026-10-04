import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import * as Three from 'three';

const runtimePath = path.resolve('app/companion-world-runtime.ts');
const source = readFileSync(runtimePath, 'utf8');
const ast = ts.createSourceFile(
  'runtime.ts',
  source,
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
const animate = nodes(
  ast,
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'animate',
)[0];
const membership = nodes(
  ast,
  (node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === 'addForestRoot',
)[0];
assert.ok(animate && membership);
const presentationGate = nodes(
  animate,
  (node) =>
    ts.isIfStatement(node) && node.expression.getText(ast) === '!visible',
);
const homeGates = nodes(
  animate,
  (node) =>
    ts.isIfStatement(node) &&
    node.expression.getText(ast) === '!home' &&
    !node.elseStatement,
);
assert.equal(presentationGate.length, 1);
assert.equal(
  homeGates.length,
  3,
  'Only three forest-effect blocks are excluded from home updates.',
);

// Negative control restores the previous scene membership/update/render work in
// memory only. It changes no assets, math, animation clocks or source files.
const replacements = [
  {
    start: membership.body.getStart(ast),
    end: membership.body.end,
    text: '{ scene.add(root); }',
  },
  ...presentationGate.map((node) => ({
    start: node.getStart(ast),
    end: node.end,
    text: '',
  })),
  ...homeGates.map((node) => ({
    start: node.getStart(ast),
    end: node.end,
    text: node.thenStatement.statements
      .map((statement) => statement.getText(ast))
      .join('\n'),
  })),
].sort((a, b) => b.start - a.start);
let baselineSource = source;
for (const edit of replacements)
  baselineSource =
    baselineSource.slice(0, edit.start) +
    edit.text +
    baselineSource.slice(edit.end);

const compiled = new Map();
function compile(filename, content) {
  const key = filename + content;
  if (!compiled.has(key))
    compiled.set(
      key,
      ts.transpileModule(content, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
        },
      }).outputText,
    );
  return compiled.get(key);
}
function harness(runtimeSource = source, reducedMotion = false) {
  const metrics = {
    renders: 0,
    projections: 0,
    dom: 0,
    matrices: 0,
    hiddenMatrices: 0,
  };
  const scenes = [],
    renderers = [],
    intersections = [],
    resizes = [],
    resources = [],
    objects = [];
  const frames = new Map();
  let now = 0,
    nextFrame = 0;
  class Element extends EventTarget {
    constructor() {
      super();
      this.children = [];
      this.clientWidth = 320;
      this.clientHeight = 340;
      this.offsetWidth = 100;
      this.offsetHeight = 44;
      this.style = new Proxy(
        {},
        {
          set(target, key, value) {
            metrics.dom++;
            target[key] = value;
            return true;
          },
        },
      );
    }
    set hidden(value) {
      metrics.dom++;
      this.isHidden = value;
    }
    get hidden() {
      return this.isHidden;
    }
    set textContent(value) {
      metrics.dom++;
      this.text = value;
    }
    get textContent() {
      return this.text;
    }
    appendChild(child) {
      metrics.dom++;
      this.children.push(child);
      child.parentNode = this;
    }
    replaceChildren() {
      metrics.dom++;
      this.children = [];
    }
    remove() {
      metrics.dom++;
      this.parentNode?.children.splice(
        this.parentNode.children.indexOf(this),
        1,
      );
    }
    setAttribute() {
      metrics.dom++;
    }
    closest() {
      return null;
    }
    getBoundingClientRect() {
      return {
        left: 0,
        top: 0,
        right: this.clientWidth,
        bottom: this.clientHeight,
        width: this.clientWidth,
        height: this.clientHeight,
      };
    }
    hasPointerCapture() {
      return false;
    }
    releasePointerCapture() {}
    setPointerCapture() {}
    focus() {}
    getContext() {
      return {
        drawImage() {},
        getImageData: () => {
          const data = new Uint8ClampedArray(this.width * this.height * 4);
          for (let y = 0; y < this.height; y++)
            for (let x = 0; x < this.width; x++)
              if (
                ((x - this.width / 2) / (this.width * 0.35)) ** 2 +
                  ((y - this.height / 2) / (this.height * 0.4)) ** 2 <
                1
              )
                data.set([242, 180, 190, 255], (y * this.width + x) * 4);
          return { data };
        },
      };
    }
  }
  const window = Object.assign(new EventTarget(), {
    devicePixelRatio: 3,
    matchMedia: () =>
      Object.assign(new EventTarget(), { matches: reducedMotion }),
  });
  const document = Object.assign(new EventTarget(), {
    hidden: false,
    createElement: () => new Element(),
  });
  function own(item) {
    if (
      item.isBufferGeometry ||
      item.isMaterial ||
      item.isTexture ||
      item.isInstancedMesh
    ) {
      const record = { item, disposals: 0 };
      item.addEventListener('dispose', () => record.disposals++);
      resources.push(record);
    }
    if (item.isObject3D) objects.push(item);
    return item;
  }
  class Renderer {
    constructor(options) {
      this.domElement = new Element();
      this.shadowMap = {};
      this.options = options;
      this.disposals = 0;
      renderers.push(this);
    }
    setPixelRatio(value) {
      this.pixelRatio = value;
    }
    setSize(width, height) {
      this.size = [width, height];
    }
    render(scene, camera) {
      metrics.renders++;
      // WebGLRenderer's real scene update path (Three r180 line 1536), without GPU.
      scene.updateMatrixWorld();
      camera.updateMatrixWorld();
      this.camera = camera;
    }
    dispose() {
      this.disposals++;
    }
    forceContextLoss() {}
  }
  class Scene extends Three.Scene {
    constructor() {
      super();
      scenes.push(this);
    }
  }
  class Vector3 extends Three.Vector3 {
    project(camera) {
      metrics.projections++;
      return super.project(camera);
    }
  }
  const namespace = {
    ...Three,
    WebGLRenderer: Renderer,
    Scene,
    Vector3,
    PMREMGenerator: class {
      fromScene() {
        const texture = own(new Three.Texture());
        return {
          texture,
          dispose() {
            texture.dispose();
          },
        };
      }
      dispose() {}
    },
  };
  for (const [name, value] of Object.entries(namespace)) {
    if (typeof value !== 'function' || !value.prototype) continue;
    if (
      value.prototype instanceof Three.BufferGeometry ||
      value === Three.BufferGeometry ||
      value.prototype instanceof Three.Material ||
      value === Three.Material ||
      value.prototype instanceof Three.Texture ||
      value === Three.Texture ||
      value.prototype instanceof Three.Object3D ||
      value === Three.Object3D
    )
      namespace[name] = new Proxy(value, {
        construct(target, args, newTarget) {
          return own(Reflect.construct(target, args, newTarget));
        },
      });
  }
  const cache = new Map();
  function load(filename) {
    const full = path.resolve(filename);
    if (cache.has(full)) return cache.get(full);
    const exports = {};
    cache.set(full, exports);
    runInNewContext(
      compile(
        full,
        full === runtimePath ? runtimeSource : readFileSync(full, 'utf8'),
      ),
      {
        exports,
        require(specifier) {
          if (specifier === 'three') return namespace;
          if (specifier.includes('RoomEnvironment'))
            return {
              RoomEnvironment: class extends Three.Group {
                dispose() {}
              },
            };
          assert.ok(
            specifier.startsWith('.'),
            'Only repository modules and Three are allowed.',
          );
          return load(path.resolve(path.dirname(full), specifier + '.ts'));
        },
        window,
        document,
        queueMicrotask,
        performance: { now: () => now },
        requestAnimationFrame(callback) {
          const id = ++nextFrame;
          frames.set(id, callback);
          return id;
        },
        cancelAnimationFrame: (id) => frames.delete(id),
        IntersectionObserver: class {
          constructor(callback) {
            this.callback = callback;
            intersections.push(this);
          }
          observe() {}
          disconnect() {
            this.disconnected = true;
          }
        },
        ResizeObserver: class {
          constructor(callback) {
            this.callback = callback;
            resizes.push(this);
          }
          observe() {}
          disconnect() {
            this.disconnected = true;
          }
        },
        Image: class {
          naturalWidth = 16;
          naturalHeight = 20;
          set src(value) {
            if (value) queueMicrotask(() => this.onload?.());
          }
        },
        setTimeout,
        clearTimeout,
      },
    );
    return exports;
  }
  const { mountCompanionWorld } = load(runtimePath);
  const { DEFAULT_APPEARANCE } = load('app/creature-types.ts');
  const { initialForestState, getForestView } = load('app/forest-story.ts');
  function mount(mode, { drawing = false, state = initialForestState() } = {}) {
    const arrived = [],
      statuses = [];
    const appearance = drawing
      ? {
          ...DEFAULT_APPEARANCE,
          drawingAssetId: 'synthetic',
          drawingImage: 'data:image/png;base64,c3ludGhldGlj',
        }
      : DEFAULT_APPEARANCE;
    const host = new Element();
    const world = mountCompanionWorld(host, {
      mode,
      forest: state,
      appearance,
      onInteract: (id) => arrived.push(id),
      onPet() {},
      onStatus() {},
      onCreatureStatus: (status) => statuses.push(status),
    });
    const scene = scenes.at(-1),
      renderer = renderers.at(-1),
      intersection = intersections.at(-1),
      resize = resizes.at(-1);
    const hero = scene.getObjectByName(
      drawing ? 'DrawingPuppet' : 'DrawingFriend',
    );
    scene.traverse((object) => {
      const update = object.updateMatrix;
      object.updateMatrix = function () {
        metrics.matrices++;
        for (let parent = this; parent; parent = parent.parent)
          if (!parent.visible) {
            metrics.hiddenMatrices++;
            break;
          }
        return update.call(this);
      };
    });
    return {
      world,
      scene,
      renderer,
      hero,
      host,
      arrived,
      statuses,
      state,
      target: getForestView(state).hotspots.find(
        (hot) => hot.available && !hot.complete,
      )?.id,
      visible: (value) => intersection.callback([{ isIntersecting: value }]),
      intersection,
      resize,
    };
  }
  return {
    mount,
    frames,
    metrics,
    resources,
    objects,
    renderers,
    document,
    initialForestState,
    resetMetrics() {
      for (const key of Object.keys(metrics)) metrics[key] = 0;
    },
    async flush() {
      for (let i = 0; i < 8; i++) await Promise.resolve();
    },
    tick(count = 1) {
      for (let i = 0; i < count; i++) {
        now += 1000 / 60;
        const pending = [...frames.values()];
        frames.clear();
        pending.forEach((callback) => callback(now));
      }
    },
    assertReleased() {
      assert.equal(frames.size, 0);
      assert.ok(resources.length > 0);
      assert.ok(
        resources.every((resource) => resource.disposals === 1),
        'All geometry/material/texture/instance owners dispose exactly once, including detached home roots.',
      );
      assert.ok(renderers.every((renderer) => renderer.disposals === 1));
    },
  };
}

function sceneBudget(scene) {
  let meshes = 0,
    hiddenMeshes = 0;
  function visit(object, visible) {
    visible &&= object.visible;
    if (object.isMesh || object.isPoints) {
      meshes++;
      if (!visible) hiddenMeshes++;
    }
    object.children.forEach((child) => visit(child, visible));
  }
  visit(scene, true);
  return { meshes, hiddenMeshes };
}
const geometryHashes = new WeakMap();
function geometryHash(geometry) {
  if (!geometryHashes.has(geometry)) {
    const hash = createHash('sha256');
    for (const attribute of [
      ...Object.values(geometry.attributes),
      geometry.index,
    ].filter(Boolean))
      hash.update(
        Buffer.from(
          attribute.array.buffer,
          attribute.array.byteOffset,
          attribute.array.byteLength,
        ),
      );
    geometryHashes.set(geometry, hash.digest('hex'));
  }
  return geometryHashes.get(geometry);
}
function visibleSnapshot(mount) {
  const result = [];
  mount.scene.traverseVisible((object) => {
    if (!object.isMesh && !object.isPoints && !object.isLight) return;
    const materials = !object.material
      ? []
      : Array.isArray(object.material)
        ? object.material
        : [object.material];
    result.push({
      type: object.type,
      name: object.name,
      matrix: object.matrixWorld.elements,
      geometry: object.geometry && geometryHash(object.geometry),
      intensity: object.intensity,
      color: object.color?.toArray(),
      castShadow: object.castShadow,
      materials: materials.map((material) => ({
        type: material.type,
        color: material.color?.toArray(),
        emissive: material.emissive?.toArray(),
        intensity: material.emissiveIntensity,
        opacity: material.opacity,
        roughness: material.roughness,
        metalness: material.metalness,
        vertex: material.vertexShader,
        fragment: material.fragmentShader,
      })),
    });
  });
  return JSON.stringify({
    objects: result,
    camera: mount.renderer.camera?.matrixWorld.elements,
    projection: mount.renderer.camera?.projectionMatrix.elements,
    background: mount.scene.background?.toArray(),
    exposure: mount.renderer.toneMappingExposure,
    dpr: mount.renderer.pixelRatio,
  });
}

const budgets = {};
for (const drawing of [false, true]) {
  for (const mode of ['home', 'forest']) {
    const snapshots = [];
    for (const [version, code] of [
      ['before', baselineSource],
      ['after', source],
    ]) {
      const test = harness(code),
        mounted = test.mount(mode, { drawing });
      await test.flush();
      test.tick();
      test.resetMetrics();
      test.tick(60);
      assert.equal(mounted.statuses.at(-1), 'ready');
      assert.equal(
        mounted.renderer.pixelRatio,
        1.5,
        'Existing mobile DPR is unchanged.',
      );
      snapshots.push(visibleSnapshot(mounted));
      if (mode === 'home' && !drawing)
        budgets[version] = { ...sceneBudget(mounted.scene), ...test.metrics };
      if (mode === 'home' && version === 'after') {
        assert.equal(test.metrics.hiddenMatrices, 0);
        assert.equal(mounted.scene.getObjectByName('MoonTree'), undefined);
        const fireflies = test.objects.find(
          (object) =>
            object.isPoints && object.geometry.attributes.position.count === 36,
        );
        const pawprints = test.objects.find(
          (object) => object.isInstancedMesh && object.count === 20,
        );
        assert.equal(
          fireflies.geometry.attributes.position.version,
          0,
          'Home never rewrites its detached forest particles.',
        );
        assert.equal(
          pawprints.instanceMatrix.version,
          0,
          'Home never computes detached forest pawprint matrices.',
        );
      }
      mounted.world.dispose();
      mounted.world.dispose();
      test.assertReleased();
    }
    assert.equal(
      snapshots[1],
      snapshots[0],
      `${mode}/${drawing ? 'cutout' : 'plush'} visible geometry/materials/poses/camera/shaders remain exactly equal.`,
    );
  }
}
assert.equal(budgets.before.meshes, 516);
assert.equal(budgets.after.meshes, 149);
assert.equal(budgets.before.hiddenMatrices, 26100);
assert.equal(budgets.after.hiddenMatrices, 0);
assert.equal(budgets.before.matrices, 37260);
assert.equal(budgets.after.matrices, 11100);

const journeys = {};
for (const [version, code] of [
  ['before', baselineSource],
  ['after', source],
]) {
  const test = harness(code),
    mounted = test.mount('forest');
  await test.flush();
  test.tick();
  mounted.visible(false);
  mounted.world.walkTo(mounted.target);
  test.resetMetrics();
  test.tick(360);
  assert.deepEqual(mounted.arrived, [mounted.target]);
  journeys[version] = {
    ...test.metrics,
    position: mounted.hero.position.toArray(),
  };
  if (version === 'after') {
    assert.equal(test.metrics.renders, 0);
    assert.equal(test.metrics.projections, 0);
    assert.equal(test.metrics.dom, 0);
    mounted.visible(true);
    test.tick();
    assert.equal(test.metrics.renders, 1, 'Reentry renders on its next frame.');
    assert.ok(test.metrics.projections > 0 && test.metrics.dom > 0);
    assert.deepEqual(
      mounted.arrived,
      [mounted.target],
      'Visibility cannot repeat arrival.',
    );
    const stable = mounted.hero.position.clone();
    test.tick(60);
    assert.deepEqual(mounted.hero.position.toArray(), stable.toArray());
  }
  mounted.world.dispose();
  test.assertReleased();
}
assert.equal(
  journeys.before.renders,
  29,
  'Negative control reproduces the audited offscreen rendering.',
);
assert.deepEqual(journeys.after.position, journeys.before.position);

for (const mode of ['home', 'forest'])
  for (const reduced of [false, true]) {
    const test = harness(source, reduced),
      mounted = test.mount(mode);
    await test.flush();
    test.tick();
    for (const suspend of ['paused', 'hidden', 'offscreen-idle']) {
      if (suspend === 'paused') mounted.world.setPaused(true);
      if (suspend === 'hidden') test.document.hidden = true;
      if (suspend === 'offscreen-idle') mounted.visible(false);
      const pose = mounted.hero.position.clone();
      test.resetMetrics();
      test.tick(180);
      assert.equal(test.metrics.renders, 0);
      assert.equal(test.metrics.projections, 0);
      assert.equal(test.metrics.dom, 0);
      assert.deepEqual(mounted.hero.position.toArray(), pose.toArray());
      mounted.world.setPaused(false);
      test.document.hidden = false;
      mounted.visible(true);
      test.tick();
      assert.equal(test.metrics.renders, 1);
    }
    if (mode === 'forest') {
      mounted.visible(false);
      mounted.world.walkTo(mounted.target);
      mounted.world.setPaused(true);
      test.tick(180);
      assert.equal(
        mounted.arrived.length,
        0,
        'Dialog pause retains existing travel cancellation.',
      );
      mounted.world.setPaused(false);
      mounted.world.walkTo(mounted.target);
      test.resetMetrics();
      test.tick(360);
      assert.deepEqual(mounted.arrived, [mounted.target]);
      assert.equal(test.metrics.renders, 0);
    }
    const staleFrame = [...test.frames.values()][0];
    mounted.world.dispose();
    test.resetMetrics();
    mounted.visible(true);
    staleFrame(100000);
    test.tick(60);
    assert.equal(test.metrics.renders, 0);
    assert.equal(test.metrics.projections, 0);
    assert.equal(test.metrics.dom, 0);
    assert.equal(mounted.intersection.disconnected, true);
    assert.equal(mounted.resize.disconnected, true);
    test.assertReleased();
  }

// Actual mode remounts cannot retain a previous renderer or omit forest roots.
const transitions = harness();
for (const mode of ['home', 'forest', 'home', 'forest', 'home']) {
  const mounted = transitions.mount(mode);
  await transitions.flush();
  transitions.tick(2);
  assert.equal(
    Boolean(mounted.scene.getObjectByName('MoonTree')),
    mode === 'forest',
  );
  mounted.world.setPaused(true);
  transitions.tick(4);
  mounted.world.setPaused(false);
  transitions.tick();
  mounted.world.dispose();
  transitions.assertReleased();
}
console.log(
  JSON.stringify({
    homeBefore: budgets.before,
    homeAfter: budgets.after,
    offscreenRenderBefore: journeys.before.renders,
    offscreenRenderAfter: journeys.after.renders,
  }),
);
console.log(
  'World performance passed: actual runtime + Three call counts, not GPU/FPS claims; identical visible plush/cutout/forest output, offscreen arrival/reentry, paused/hidden/reduced/disposed guards, mode remounts and exact detached-resource disposal.',
);
