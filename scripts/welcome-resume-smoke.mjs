import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync('app/character-welcome.tsx', 'utf8');
const ast = ts.createSourceFile(
  'welcome.tsx',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let label, effect;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'welcomePlayLabel')
    label = node;
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect')
    effect = node.arguments[0];
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(label && effect);
const code = ts.transpileModule(
  `${label.getText(ast).replace(/^export /, '')}\n({ label: welcomePlayLabel, start: ${effect.getText(ast)} });`,
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  },
).outputText;
function fixture() {
  const key = 'companion-save-key';
  const state = { status: 'empty', reads: 0, updates: [], queued: [] };
  function events() {
    const listeners = new Map();
    return {
      listeners,
      addEventListener: (name, fn) => listeners.set(name, fn),
      removeEventListener: (name, fn) => {
        assert.equal(listeners.get(name), fn);
        listeners.delete(name);
      },
    };
  }
  const window = events(),
    document = { ...events(), visibilityState: 'visible' };
  const welcome = runInNewContext(code, {
    window,
    document,
    COMPANION_SAVE_KEY: key,
    setResumeStatus: (value) => state.updates.push(value),
    readCompanionSave: () => {
      state.reads++;
      return {
        status: state.status,
        get save() {
          throw new Error('Welcome must not inspect names, stories or images');
        },
      };
    },
    queueMicrotask: (fn) => state.queued.push(fn),
  });
  return { key, state, window, document, welcome };
}
const test = fixture();
const stop = test.welcome.start();
assert.equal(
  test.state.reads,
  0,
  'SSR and initial render do not read browser storage',
);
test.state.queued.shift()();
assert.deepEqual(test.state.updates, ['empty']);
for (const [status, expected] of [
  ['checking', '친구의 집 열기'],
  ['ready', '내 친구·책장으로 돌아가기'],
  ['empty', '그림 없이 3D 친구와 먼저 놀기'],
  ['corrupt', '보관 기록 확인하기'],
  ['future', '보관 기록 확인하기'],
  ['unavailable', '보관 기록 확인하기'],
])
  assert.equal(test.welcome.label(status), expected);
test.state.status = 'ready';
test.window.listeners.get('storage')({ key: 'unrelated' });
assert.equal(test.state.reads, 1);
test.window.listeners.get('storage')({ key: test.key });
assert.equal(test.state.updates.at(-1), 'ready');
test.state.status = 'empty';
test.window.listeners.get('storage')({ key: null });
assert.equal(
  test.state.updates.at(-1),
  'empty',
  'cross-tab reset restores the new-visitor action',
);
test.state.status = 'future';
for (const event of ['focus', 'pageshow']) test.window.listeners.get(event)();
assert.equal(test.state.updates.at(-1), 'future');
test.document.visibilityState = 'hidden';
const reads = test.state.reads;
test.document.listeners.get('visibilitychange')();
assert.equal(test.state.reads, reads);
test.document.visibilityState = 'visible';
test.document.listeners.get('visibilitychange')();
assert.equal(test.state.reads, reads + 1);
const late = test.window.listeners.get('focus');
stop();
late();
assert.equal(
  test.state.reads,
  reads + 1,
  'late refresh cannot update an unmounted welcome',
);
assert.equal(test.window.listeners.size + test.document.listeners.size, 0);
const early = fixture();
early.welcome.start()();
early.state.queued.shift()();
assert.equal(
  early.state.reads,
  0,
  'unmount before the microtask cancels the initial read',
);
assert.doesNotMatch(
  effect.getText(ast),
  /persist|write|IndexedDB|readDrawingAsset|CompanionStorageSession/,
);
assert.match(source, /className="creation-secondary" onClick=\{onPlay\}/);
console.log(
  'Welcome resume passed: actual read-only effect, no private fields, hydration, saved/empty/recovery labels, cross-tab reset, focus/pageshow/visibility and cleanup.',
);
