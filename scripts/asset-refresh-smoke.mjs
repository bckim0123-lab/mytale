import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const compiled = ts.transpileModule(
  readFileSync('app/use-drawing-asset.ts', 'utf8'),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  },
).outputText;
const state = [];
let cursor = 0;
let effects = [];
const pending = [];
const exports = {};
runInNewContext(compiled, {
  exports,
  queueMicrotask,
  window: new EventTarget(),
  require: (id) => {
    if (id === 'react')
      return {
        useState: (initial) => {
          const slot = cursor++;
          if (!(slot in state)) state[slot] = initial;
          return [
            state[slot],
            (value) => {
              state[slot] =
                typeof value === 'function' ? value(state[slot]) : value;
            },
          ];
        },
        useEffect: (work) => effects.push(work),
      };
    if (id === './drawing-assets')
      return {
        readDrawingAsset: (id) =>
          new Promise((resolve, reject) =>
            pending.push({ id, resolve, reject }),
          ),
      };
    throw new Error(`Unexpected dependency ${id}`);
  },
});
function render(id) {
  cursor = 0;
  effects = [];
  return exports.useDrawingAsset(id);
}
const settle = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};
render('A');
let cleanup = effects[1]();
await settle();
pending.shift().resolve({ png: 'approved-A' });
await settle();
assert.equal(render('A').png, 'approved-A');
cleanup();
cleanup = effects[1]();
await settle();
assert.equal(
  render('A').png,
  'approved-A',
  'focus/metadata refresh preserves the same validated image while reading',
);
assert.equal(render('A').loading, true);
pending.shift().resolve({ png: 'approved-A' });
await settle();
assert.equal(render('A').png, 'approved-A');
assert.equal(render('A').loading, false);

// A refreshing image is not allowed to leak into a different friend's view.
cleanup();
cleanup = effects[1]();
await settle();
const lateA = pending.shift();
assert.equal(
  render('B').png,
  undefined,
  'changing IDs never flashes another friend',
);
cleanup();
cleanup = effects[1]();
lateA.resolve({ png: 'late-A' });
await settle();
assert.equal(render('B').png, undefined);
pending.shift().resolve({ png: 'approved-B' });
await settle();
assert.equal(render('B').png, 'approved-B');

for (const outcome of ['missing', 'error']) {
  cleanup();
  cleanup = effects[1]();
  await settle();
  const read = pending.shift();
  if (outcome === 'missing') read.resolve(null);
  else read.reject(new Error('storage failed'));
  await settle();
  assert.equal(
    render('B').png,
    undefined,
    `${outcome} cannot retain an unverified picture`,
  );
  assert.ok(render('B').error);
}
cleanup();
cleanup = effects[1]();
await settle();
const before = JSON.stringify(state);
cleanup();
pending.shift().resolve({ png: 'after-unmount' });
await settle();
assert.equal(
  JSON.stringify(state),
  before,
  'unmounted reader ignores late artwork',
);
assert.equal(
  render(undefined).png,
  undefined,
  'clearing the selected asset hides it immediately',
);
console.log(
  'Artwork refresh passed: actual hook retains same-ID art without 3D remount, rejects cross-ID/stale/missing/error results and respects cleanup.',
);
