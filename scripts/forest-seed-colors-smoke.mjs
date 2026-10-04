import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext, runInNewContext } from 'node:vm';
import * as Three from 'three';
import ts from 'typescript';

const text = readFileSync('app/companion-world-runtime.ts', 'utf8');
const ast = ts.createSourceFile(
  'runtime.ts',
  text,
  ts.ScriptTarget.Latest,
  true,
);
function find(predicate) {
  let result;
  const visit = (node) => {
    if (predicate(node)) result = node;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(result);
  return result;
}
function declaration(name) {
  const node = find(
    (item) =>
      (ts.isFunctionDeclaration(item) || ts.isVariableDeclaration(item)) &&
      item.name?.getText(ast) === name,
  );
  return ts.isFunctionDeclaration(node)
    ? node.getText(ast)
    : `const ${node.getText(ast)};`;
}
function compile(source) {
  return ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
}
const story = {};
runInNewContext(compile(readFileSync('app/forest-story.ts', 'utf8')), {
  exports: story,
});
const forest = story.transitionForest(story.initialForestState(), {
  type: 'choose-route',
  route: 'garden',
});
const seeds = story
  .getForestView(forest)
  .hotspots.filter((hot) => hot.kind === 'seed');
assert.equal(seeds.length, 3);
const fixtures = [
  ...seeds,
  { id: 'wood-fern', kind: 'wood' },
  { id: 'unknown-object', kind: 'unknown' },
  { id: 'garden-water', kind: 'water' },
].map((hot) => ({
  x: 0,
  z: 0,
  available: true,
  complete: false,
  label: hot.id,
  ...hot,
}));
const geometries = new Set();
const materials = new Set();
const sphere = new Three.SphereGeometry(1, 8, 6);
const cylinder = new Three.CylinderGeometry(1, 1, 1, 8);
const halo = new Three.RingGeometry(0.1, 0.2, 8);
[sphere, cylinder, halo].forEach((geometry) => geometries.add(geometry));
const b = {
  T: Three,
  materials,
  geometries,
  sphere,
  cylinder,
  sharedHaloGeometry: halo,
  forest,
  view: null,
  home: false,
  hotGroup: new Three.Group(),
  hotObjects: [],
  bellObjects: new Map(),
  labelDisposers: [],
  tags: [],
  bridgeGroup: {},
  garden: {},
  gardenBeds: new Map(),
  lanternGarden: {},
  lanternBulbs: new Map(),
  labelLayer: { replaceChildren() {}, appendChild() {} },
  document: { createElement: () => ({ style: {}, setAttribute() {} }) },
  bindForestHotspotButton: () => () => {},
  getForestView: () => ({ hotspots: fixtures }),
};
const context = createContext(b);
runInContext(
  compile(
    [
      ...[
        'mat',
        'pink',
        'mint',
        'gold',
        'leaf',
        'bark',
        'glow',
        'waterMat',
      ].map(declaration),
      'const hitMaterial = mat("#ffffff");',
      ...['mesh', 'ball', 'rebuild'].map(declaration),
    ].join('\n'),
  ),
  context,
);
const ownedBefore = { materials: materials.size, geometries: geometries.size };
const colors = new Map();
for (let repeat = 0; repeat < 30; repeat++) {
  runInContext('rebuild()', context);
  for (const hot of b.hotGroup.children) {
    const visible = hot.children.filter(
      (child) => child.material !== runInContext('hitMaterial', context),
    );
    const body = visible[0];
    assert.ok(body instanceof Three.Mesh);
    assert.ok(
      materials.has(body.material),
      'Every body reuses a world-owned material.',
    );
    colors.set(hot.userData.hotspotId, body.material.color.getHexString());
    if (hot.userData.hotspotId === 'wood-fern') {
      assert.equal(
        visible.length,
        4,
        'Wood retains its three bark logs and halo.',
      );
      assert.ok(
        visible
          .slice(0, 3)
          .every((mesh) => mesh.material === runInContext('bark', context)),
      );
    } else {
      assert.equal(
        visible.length,
        3,
        'Seed/fallback retains the body, leaf and halo.',
      );
      assert.equal(body.geometry, sphere, 'No new seed geometry is created.');
    }
  }
}
assert.deepEqual(
  Array.from(seeds, (hot) => [hot.id, hot.label, colors.get(hot.id)]),
  [
    ['seed-peach', '복숭아빛 씨앗', 'edada9'],
    ['seed-mint', '민트빛 씨앗', '92b99a'],
    ['seed-gold', '꿀빛 씨앗', 'f7ca72'],
  ],
);
assert.equal(colors.get('wood-fern'), 'a98765');
assert.equal(colors.get('unknown-object'), 'f7ca72');
assert.equal(colors.get('garden-water'), '82cbd1');
assert.deepEqual(
  { materials: materials.size, geometries: geometries.size },
  ownedBefore,
  'Thirty rebuilds allocate no extra materials or geometry.',
);
const disposed = new Map();
for (const resource of [...materials, ...geometries])
  resource.addEventListener('dispose', () =>
    disposed.set(resource, (disposed.get(resource) ?? 0) + 1),
  );
for (const collection of ['materials', 'geometries']) {
  const cleanup = find(
    (node) =>
      ts.isExpressionStatement(node) &&
      node.getText(ast).startsWith(`${collection}.forEach(`) &&
      node.getText(ast).includes('.dispose()'),
  );
  runInContext(compile(cleanup.getText(ast)), context);
}
assert.equal(disposed.size, materials.size + geometries.size);
assert.ok([...disposed.values()].every((count) => count === 1));
console.log(
  'Forest seed colors smoke passed: actual Three.js rebuild matches three seed labels/colors, preserves wood/water/fallback meshes, reuses shared resources and disposes each once.',
);
