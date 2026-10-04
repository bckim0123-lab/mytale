import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as T from 'three';

const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
const exports = {};
runInNewContext(compile(readFileSync('app/moon-tree-expression.ts', 'utf8')), {
  exports,
});
const { moonTreeExpression } = exports;
for (const ending of [undefined, null, 'invalid'])
  for (const time of [null, -1, 0, 1, 100, NaN, Infinity])
    assert.deepEqual(
      JSON.parse(JSON.stringify(moonTreeExpression(ending, time, false))),
      { eyeOpen: 0, stretch: 0, wave: 0 },
    );
for (const ending of ['sky', 'home']) {
  const settled = moonTreeExpression(ending, null, false);
  for (const time of [4, 8, 1e6])
    assert.deepEqual(moonTreeExpression(ending, time, false), settled);
  for (const time of [null, -1, 0, 0.5, 100, NaN, Infinity])
    assert.deepEqual(moonTreeExpression(ending, time, true), settled);
  for (const time of [-1, NaN, Infinity])
    assert.deepEqual(
      moonTreeExpression(ending, time, false),
      moonTreeExpression(ending, 0, false),
    );
  for (const fps of [30, 60]) {
    let previous = moonTreeExpression(ending, 0, false);
    for (let frame = 1; frame <= fps * 8; frame++) {
      const pose = moonTreeExpression(ending, frame / fps, false);
      assert.ok(Object.values(pose).every(Number.isFinite));
      assert.ok(pose.eyeOpen >= previous.eyeOpen && pose.eyeOpen <= 1);
      assert.ok(pose.stretch >= previous.stretch && pose.stretch <= 0.14);
      assert.ok(Math.abs(pose.wave) <= 0.07);
      assert.ok(Math.abs(pose.wave - previous.wave) < 0.01);
      assert.ok(Math.abs(pose.eyeOpen - previous.eyeOpen) < 0.022);
      previous = pose;
    }
  }
}
assert.equal(moonTreeExpression('sky', 1.2, false).eyeOpen, 0.5);
assert.equal(moonTreeExpression('home', 1.2, false).eyeOpen, 0);
assert.notEqual(moonTreeExpression('home', 0.5, false).wave, 0);

// Execute the actual tree construction and pose function with real Three meshes.
const runtime = readFileSync('app/companion-world-runtime.ts', 'utf8');
const start = runtime.indexOf('  const moonTree = new T.Group();');
const end = runtime.indexOf('  const woodlandDetails = new T.Group();', start);
assert.ok(start > 0 && end > start);
const geometries = new Set();
const materials = new Set();
const sphere = new T.SphereGeometry(1, 20, 14);
const cylinder = new T.CylinderGeometry(1, 1, 1, 20);
const geo = (value) => {
  geometries.add(value);
  return value;
};
const mat = (color) => {
  const value = new T.MeshStandardMaterial({ color });
  materials.add(value);
  return value;
};
const mesh = (g, m, parent, p, scale = [1, 1, 1]) => {
  const result = new T.Mesh(g, m);
  result.position.fromArray(p);
  result.scale.fromArray(scale);
  parent.add(result);
  return result;
};
const scene = new T.Scene();
const b = {
  T,
  scene,
  addForestRoot: (root) => scene.add(root),
  home: false,
  sphere,
  cylinder,
  geo,
  mat,
  mesh,
  ball: (parent, material, point, scale) =>
    mesh(sphere, material, parent, point, scale),
  dark: mat('#333c3a'),
  cream: mat('#fff1c9'),
  pink: mat('#edada9'),
  leaf: mat('#6eaa88'),
  gold: mat('#f7ca72'),
  forest: { ending: null },
  moonWakeStartedAt: null,
  elapsed: 0,
  reduced: { matches: false },
  moonTreeExpression,
};
const tree = runInNewContext(
  compile(
    `${runtime.slice(start, end)}\n({moonTree,moonFace,moonEyes,moonCanopy,moonBranches,moonSmile,poseMoonTree});`,
  ),
  b,
);
const identities = [];
tree.moonTree.traverse((item) => {
  if (item.isMesh) identities.push([item, item.geometry, item.material]);
});
assert.equal(
  tree.moonFace.children.length,
  5,
  'Two eye groups, two cheeks, one smile',
);
let faceMeshes = 0;
tree.moonFace.traverse((item) => {
  if (item.isMesh) faceMeshes++;
});
assert.equal(faceMeshes, 7, 'Seven tiny face meshes, no per-frame allocation');
assert.ok(
  geometries.has(tree.moonSmile.geometry),
  'Unique smile geometry belongs to world disposal',
);
assert.ok(identities.every(([, , material]) => materials.has(material)));
assert.equal(tree.moonTree.name, 'MoonTree');
tree.poseMoonTree();
assert.equal(tree.moonEyes[0].scale.y, 0.12);
scene.updateMatrixWorld(true);
for (let index = 0; index < 2; index++) {
  const position = tree.moonBranches[index].children[0].getWorldPosition(
    new T.Vector3(),
  );
  assert.ok(Math.abs(position.x - (index ? 0.55 : -0.55)) < 1e-12);
  assert.ok(
    Math.abs(position.y - 2.25) < 1e-12,
    'Sleep pose preserves original branch geometry',
  );
}
for (const ending of ['sky', 'home']) {
  b.forest = { ending };
  b.moonWakeStartedAt = 10;
  for (const time of [10, 10.5, 11.2, 12.4, 14, 100]) {
    b.elapsed = time;
    tree.poseMoonTree();
    const pose = moonTreeExpression(ending, time - 10, false);
    assert.equal(tree.moonEyes[0].scale.y, 0.12 + pose.eyeOpen * 0.88);
    assert.equal(tree.moonBranches[0].rotation.z, pose.stretch + pose.wave);
    assert.equal(tree.moonBranches[1].rotation.z, -pose.stretch + pose.wave);
    assert.equal(tree.moonCanopy[1].position.x, -1.45 - pose.stretch * 1.15);
    assert.equal(tree.moonCanopy[2].position.x, 1.5 + pose.stretch * 1.15);
  }
}
b.forest = { ending: 'sky' };
b.moonWakeStartedAt = null;
b.elapsed = 0;
tree.poseMoonTree();
assert.equal(tree.moonEyes[0].scale.y, 1, 'Restored sky begins awake');
b.moonWakeStartedAt = 0;
b.reduced.matches = true;
tree.poseMoonTree();
assert.equal(
  tree.moonEyes[0].scale.y,
  1,
  'Reduced motion is immediately settled',
);
b.reduced.matches = false;
tree.poseMoonTree();
assert.equal(
  tree.moonEyes[0].scale.y,
  1,
  'Disabling reduced motion cannot rewind a revealed ending',
);
for (const reducedMotion of [false, true]) {
  b.forest = { ending: 'home' };
  b.moonWakeStartedAt = reducedMotion ? 0 : null;
  b.elapsed = 0.5;
  b.reduced.matches = reducedMotion;
  tree.poseMoonTree();
  assert.equal(
    tree.moonBranches[0].rotation.z,
    0.06,
    'Restored/reduced home ending is settled',
  );
  assert.equal(tree.moonEyes[0].scale.y, 0.12);
  b.reduced.matches = false;
  tree.poseMoonTree();
  assert.equal(
    tree.moonBranches[0].rotation.z,
    0.06,
    'Home goodbye cannot restart after motion preference changes',
  );
}
b.forest = { ending: null };
tree.poseMoonTree();
assert.equal(tree.moonEyes[0].scale.y, 0.12);
assert.equal(tree.moonCanopy[1].position.x, -1.45);
assert.equal(
  tree.moonBranches[0].rotation.z,
  0,
  'Fresh adventure resets the pose',
);
for (const [object, geometry, material] of identities) {
  assert.equal(object.geometry, geometry);
  assert.equal(object.material, material);
}

// Integration: choice changes establish one wake clock; ordinary saves don't.
const ast = ts.createSourceFile(
  'runtime.ts',
  runtime,
  ts.ScriptTarget.Latest,
  true,
);
const candidates = [];
function visit(node) {
  if (
    ts.isIfStatement(node) &&
    node.expression.getText(ast) === 'next.ending !== forest.ending'
  )
    candidates.push(node);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.equal(candidates.length, 1);
const sync = compile(candidates[0].getText(ast));
const clocks = {
  next: { ending: 'sky' },
  forest: { ending: null },
  elapsed: 5,
  endingStartedAt: null,
  moonWakeStartedAt: null,
};
runInNewContext(sync, clocks);
assert.equal(clocks.moonWakeStartedAt, 5);
clocks.forest = clocks.next;
clocks.elapsed = 10;
runInNewContext(sync, clocks);
assert.equal(clocks.moonWakeStartedAt, 5);
clocks.next = { ending: null };
runInNewContext(sync, clocks);
assert.equal(clocks.moonWakeStartedAt, null);
assert.match(runtime, /const skyEnding[^;]+;\s*poseMoonTree\(\);/);
for (const item of geometries) item.dispose();
for (const item of materials) item.dispose();
sphere.dispose();
cylinder.dispose();
console.log(
  'Moon tree passed: finite sky wake/home wave, exact restore/reset/reduced poses, 30/60fps continuity, actual Three face/branch ownership and one-shot clock integration.',
);
