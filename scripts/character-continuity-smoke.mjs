import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import {
  DEFAULT_APPEARANCE,
  sameCreatureAppearance,
} from '../app/creature-types.ts';

const source = readFileSync('app/companion-world-runtime.ts', 'utf8');
const ast = ts.createSourceFile(
  'world.ts',
  source,
  ts.ScriptTarget.Latest,
  true,
);
let method;
const declarations = new Map();
function visit(node) {
  if (
    ts.isMethodDeclaration(node) &&
    node.name.getText(ast) === 'setAppearance'
  )
    method = node;
  if (
    ts.isVariableDeclaration(node) &&
    ['creature', 'currentAppearance'].includes(node.name.getText(ast))
  )
    declarations.set(node.name.getText(ast), node.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(method && declarations.size === 2);
const code = ts.transpileModule(
  `
let disposed = false;
let ${declarations.get('currentAppearance')};
let ${declarations.get('creature')};
({ ${method.getText(ast)},
  rig: () => creature,
  disposeWorld: () => disposed = true,
});`,
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  },
).outputText;
function fixture(appearance = { ...DEFAULT_APPEARANCE }, home = false) {
  const counts = {
    create: 0,
    dispose: 0,
    watch: 0,
    add: 0,
    remove: 0,
    reactions: [],
  };
  function transform(value) {
    return {
      value,
      clone() {
        return transform(this.value);
      },
      copy(other) {
        this.value = other.value;
      },
    };
  }
  const createCreature = () => {
    counts.create++;
    return {
      root: {
        position: transform(3.75),
        rotation: transform(1.5),
        scale: {
          value: 1,
          setScalar(value) {
            this.value = value;
          },
        },
      },
      dispose: () => counts.dispose++,
    };
  };
  const world = runInNewContext(code, {
    options: { appearance },
    home,
    createCreature,
    sameCreatureAppearance,
    watchDrawing: () => counts.watch++,
    scene: { remove: () => counts.remove++, add: () => counts.add++ },
    react: (action) => counts.reactions.push(action),
  });
  counts.reactions.push('celebrate');
  return { world, counts };
}
const base = {
  ...DEFAULT_APPEARANCE,
  drawingAssetId: 'whale-id',
  drawingImage: 'approved-whale-png',
};
const stable = fixture(base);
const original = stable.world.rig();
for (let index = 0; index < 8; index++) stable.world.setAppearance({ ...base });
stable.world.setAppearance({ ...base, pattern: 'plain', earStyle: 'upright' });
assert.equal(
  stable.world.rig(),
  original,
  'autosave clones preserve the exact live character and texture',
);
assert.deepEqual(
  stable.counts,
  {
    create: 1,
    dispose: 0,
    watch: 0,
    add: 0,
    remove: 0,
    reactions: ['celebrate'],
  },
  'progress/name saves cannot overwrite a collection or final-note celebration',
);

const changes = {
  kind: 'cat',
  bodyColor: '#ffcccc',
  accentColor: '#aaccee',
  accessory: 'flower',
  pattern: 'heart',
  earStyle: 'floppy',
  drawingAssetId: 'other-id',
  drawingImage: 'other-png',
};
const removeDrawing = fixture(base);
removeDrawing.world.setAppearance({ ...DEFAULT_APPEARANCE });
assert.equal(
  removeDrawing.counts.create,
  2,
  'returning from drawing to plush rebuilds once',
);
assert.equal(removeDrawing.counts.dispose, 1);
removeDrawing.world.setAppearance({ ...DEFAULT_APPEARANCE });
assert.equal(removeDrawing.counts.create, 2);
assert.deepEqual(
  Object.keys(changes).sort(),
  [...Object.keys(base), 'pattern', 'earStyle'].sort(),
);
for (const [field, value] of Object.entries(changes)) {
  for (const home of [true, false]) {
    const test = fixture(base, home);
    const next = { ...base, [field]: value };
    test.world.setAppearance(next);
    assert.equal(
      test.counts.create,
      2,
      `${field} creates the genuinely changed appearance`,
    );
    assert.equal(test.counts.dispose, 1);
    assert.equal(test.counts.watch, 1);
    assert.equal(test.counts.remove, 1);
    assert.equal(test.counts.add, 1);
    assert.equal(test.world.rig().root.position.value, 3.75);
    assert.equal(test.world.rig().root.rotation.value, 1.5);
    assert.equal(test.world.rig().root.scale.value, home ? 1 : 0.8);
    assert.deepEqual(test.counts.reactions, ['celebrate', 'wave']);
    test.world.setAppearance({ ...next });
    assert.equal(
      test.counts.create,
      2,
      'saving a changed appearance does not rebuild it again',
    );
    next.accentColor = '#eeeeee';
    test.world.setAppearance(next);
    assert.equal(
      test.counts.create,
      3,
      'runtime captures a value snapshot, not a caller-owned mutable reference',
    );
    test.world.disposeWorld();
    test.world.setAppearance(base);
    assert.equal(
      test.counts.create,
      3,
      'disposed world cannot create a new rig',
    );
  }
}
console.log(
  'Character continuity passed: actual runtime setter, unchanged autosave/name snapshots, default normalization, all eight visual fields, current reaction/position preservation and disposal.',
);
