import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync('app/use-drawing-previews.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
  },
}).outputText;
const SAVE_KEY = 'drawing-friend-companion-v1';
const id = (value) => value.toString(16).padStart(64, '0');
const keys = (value) => Object.keys(value).sort();
const asset = (checksum, png = `approved-${checksum}`) => ({
  id: checksum,
  png,
});

function createHarness() {
  const slots = [];
  const reads = [];
  const listeners = new Map();
  const listenerAdds = new Map();
  let cursor = 0,
    effects = [],
    dirty = false,
    mounted = true,
    currentIds = [],
    output,
    writes = 0,
    generation = 'initial',
    captureFailure = false,
    captures = 0;
  const exports = {};
  const window = {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
      listenerAdds.set(type, (listenerAdds.get(type) ?? 0) + 1);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
  };
  runInNewContext(compiled, {
    exports,
    queueMicrotask,
    window,
    require(name) {
      if (name === './companion-save') return { COMPANION_SAVE_KEY: SAVE_KEY };
      if (name === './drawing-assets')
        return {
          captureDrawingGeneration() {
            captures++;
            if (captureFailure) throw new Error('storage unavailable');
            return generation;
          },
          readDrawingAsset(checksum) {
            return new Promise((resolve, reject) => {
              reads.push({ id: checksum, resolve, reject });
            });
          },
        };
      if (name === 'react')
        return {
          useState(initial) {
            const index = cursor++;
            if (!(index in slots)) slots[index] = { value: initial };
            return [
              slots[index].value,
              (update) => {
                assert.ok(
                  mounted,
                  'No state update is permitted after unmount.',
                );
                writes++;
                const previous = slots[index].value;
                const next =
                  typeof update === 'function' ? update(previous) : update;
                if (!Object.is(previous, next)) {
                  slots[index].value = next;
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
          useEffect(work, dependencies) {
            const index = cursor++;
            const previous = slots[index];
            if (
              !previous ||
              dependencies.some(
                (value, i) => !Object.is(value, previous.dependencies[i]),
              )
            )
              effects.push(() => {
                previous?.cleanup?.();
                slots[index] = { dependencies, cleanup: work() };
              });
          },
        };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  const render = (ids = currentIds) => {
    currentIds = ids;
    cursor = 0;
    effects = [];
    dirty = false;
    output = exports.useDrawingPreviews(ids);
    for (const effect of effects) effect();
    return output;
  };
  const flush = async () => {
    for (let turn = 0; turn < 12; turn++) {
      await Promise.resolve();
      if (dirty && mounted) render();
    }
    return output;
  };
  return {
    reads,
    slots,
    listeners,
    listenerAdds,
    render,
    flush,
    get output() {
      return output;
    },
    get writes() {
      return writes;
    },
    get captures() {
      return captures;
    },
    generation(value) {
      generation = value;
    },
    failCapture(value) {
      captureFailure = value;
    },
    event(type, key) {
      for (const listener of listeners.get(type) ?? []) listener({ key });
    },
    unmount() {
      for (const slot of slots) slot?.cleanup?.();
      mounted = false;
    },
  };
}

// The actual hook normalizes IDs and never creates library-wide reads.
const capped = createHarness();
const hundred = Array.from({ length: 100 }, (_, index) => id(index + 1));
assert.deepEqual(
  keys(
    capped.render([undefined, 'bad', 'A'.repeat(64), id(1), id(1), ...hundred]),
  ),
  [],
);
assert.deepEqual(
  capped.reads.map((read) => read.id),
  hundred.slice(0, 6),
);
for (const read of capped.reads) read.resolve(asset(read.id));
await capped.flush();
assert.deepEqual(keys(capped.output), hundred.slice(0, 6));
assert.equal(
  capped.captures,
  2,
  'Each batch checks generation before and after reads.',
);
capped.render([...hundred]);
await capped.flush();
assert.equal(
  capped.reads.length,
  6,
  'An equivalent new array does not reload images.',
);
for (const type of ['drawing-friend-artworks-changed', 'focus', 'storage']) {
  assert.equal(capped.listeners.get(type).size, 1);
  assert.equal(capped.listenerAdds.get(type), 1);
}

// Page changes hide old heroes before effects run and release their state references.
assert.deepEqual(keys(capped.render([id(7), id(8)])), []);
await capped.flush();
assert.ok(!JSON.stringify(capped.slots).includes(`approved-${id(1)}`));
assert.deepEqual(
  capped.reads.slice(6).map((read) => read.id),
  [id(7), id(8)],
);
capped.reads[6].resolve(asset(id(7)));
capped.reads[7].reject(new Error('one unreadable image'));
await capped.flush();
assert.deepEqual(
  keys(capped.output),
  [id(7)],
  'One failed read does not hide another valid hero.',
);
assert.deepEqual(keys(capped.render([])), []);
await capped.flush();
assert.equal(capped.reads.length, 8, 'An empty page makes no image read.');
assert.ok(!JSON.stringify(capped.slots).includes(`approved-${id(7)}`));
capped.unmount();

// Old page results cannot return during rapid A -> B -> A navigation.
const race = createHarness();
race.render([id(1)]);
race.render([id(2)]);
race.render([id(1)]);
race.reads[2].resolve(asset(id(1), 'current-A'));
await race.flush();
race.reads[0].resolve(asset(id(1), 'stale-A'));
race.reads[1].resolve(asset(id(2), 'stale-B'));
await race.flush();
assert.equal(race.output[id(1)], 'current-A');
assert.deepEqual(keys(race.output), [id(1)]);
race.unmount();

// A reset midway through a batch discards every result, not a mixed generation.
const reset = createHarness();
reset.render([id(1), id(2)]);
reset.reads[0].resolve(asset(id(1), 'before-reset'));
await reset.flush();
reset.generation('new-generation');
reset.reads[1].resolve(asset(id(2), 'after-reset'));
await reset.flush();
assert.deepEqual(keys(reset.output), []);
reset.unmount();

for (const when of ['before', 'after']) {
  const blocked = createHarness();
  if (when === 'before') blocked.failCapture(true);
  blocked.render([id(1)]);
  if (when === 'after') {
    blocked.failCapture(true);
    blocked.reads[0].resolve(asset(id(1)));
  }
  await blocked.flush();
  assert.deepEqual(keys(blocked.output), []);
  assert.equal(blocked.reads.length, when === 'before' ? 0 : 1);
  blocked.unmount();
}

// The one shared listener set survives page changes, ignores unrelated storage,
// and invalidates an old callback immediately, before React flushes the refresh.
const refresh = createHarness();
refresh.render([id(1)]);
refresh.event('storage', 'unrelated');
await refresh.flush();
assert.equal(refresh.reads.length, 1);
refresh.event('drawing-friend-artworks-changed');
refresh.reads[0].resolve(asset(id(1), 'invalidated-before-effect'));
await refresh.flush();
assert.deepEqual(keys(refresh.output), []);
assert.equal(refresh.reads.length, 2);
refresh.reads[1].resolve(asset(id(1), 'refreshed-A'));
await refresh.flush();
assert.equal(refresh.output[id(1)], 'refreshed-A');
for (const [event, key] of [
  ['focus'],
  ['storage', SAVE_KEY],
  ['storage', null],
]) {
  const count = refresh.reads.length;
  refresh.event(event, key);
  assert.deepEqual(
    keys(refresh.render()),
    [],
    'Refresh never presents an unverified old hero.',
  );
  await refresh.flush();
  assert.equal(refresh.reads.length, count + 1);
  const read = refresh.reads.at(-1);
  read.resolve(event === 'focus' ? null : asset(id(1)));
  await refresh.flush();
  assert.deepEqual(keys(refresh.output), event === 'focus' ? [] : [id(1)]);
}
refresh.render([id(2)]);
await refresh.flush();
for (const type of ['drawing-friend-artworks-changed', 'focus', 'storage']) {
  assert.equal(refresh.listeners.get(type).size, 1);
  assert.equal(
    refresh.listenerAdds.get(type),
    1,
    'Paging does not multiply shared listeners.',
  );
}
const lateListener = [...refresh.listeners.get('focus')][0];
refresh.unmount();
const writesBeforeUnmount = refresh.writes;
refresh.reads.at(-1).resolve(asset(id(2), 'after-unmount'));
lateListener();
await refresh.flush();
assert.equal(refresh.writes, writesBeforeUnmount);
for (const active of refresh.listeners.values()) assert.equal(active.size, 0);

// A mismatched asset response is never shown under a different checksum key.
const mismatch = createHarness();
mismatch.render([id(1), id(2), id(3)]);
mismatch.reads[0].resolve(asset(id(2), 'wrong-hero'));
mismatch.reads[1].resolve(null);
mismatch.reads[2].resolve(asset(id(3)));
await mismatch.flush();
assert.deepEqual(keys(mismatch.output), [id(3)]);
mismatch.unmount();

console.log(
  'Drawing previews passed: actual hook caps reads at six valid unique IDs, stable pages, partial failures, stale/unmounted/reset rejection and shared refresh/listener cleanup; no network or renderer.',
);
