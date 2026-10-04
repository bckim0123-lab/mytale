import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync('app/companion-experience.tsx', 'utf8');
const ast = ts.createSourceFile(
  'experience.tsx',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
function findAll(predicate) {
  const found = [];
  const visit = (node) => {
    if (predicate(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return found;
}
function compile(text) {
  return ts.transpileModule(text, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
}
function evaluate(node, bindings, name) {
  const text = node.getText(ast);
  const code = name ? `${text}\n${name}` : `(${text})`;
  return runInNewContext(compile(code), { ...bindings });
}
function load(name, bindings) {
  const node = findAll(
    (candidate) =>
      ts.isFunctionDeclaration(candidate) && candidate.name?.text === name,
  )[0];
  if (node) return evaluate(node, bindings, name);
  const callback = findAll(
    (candidate) =>
      ts.isVariableDeclaration(candidate) &&
      candidate.name.getText(ast) === name &&
      candidate.initializer &&
      ts.isCallExpression(candidate.initializer) &&
      candidate.initializer.expression.getText(ast) === 'useCallback',
  )[0];
  assert.ok(callback, `Actual UI function ${name} exists.`);
  return evaluate(callback.initializer.arguments[0], bindings);
}
function moduleFromFile(filename) {
  const exports = {};
  runInNewContext(compile(readFileSync(filename, 'utf8')), { exports });
  return exports;
}
const {
  initialForestState,
  transitionForest,
  FOREST_WOOD_IDS,
  FOREST_BELL_IDS,
  getForestMelody,
  getForestEnding,
} = moduleFromFile('app/forest-story.ts');
const { forestToyFor, forestToyStillCurrent } = moduleFromFile(
  'app/forest-play-controls.ts',
);
function readyForest() {
  let state = transitionForest(initialForestState(), {
    type: 'choose-route',
    route: 'river',
  });
  for (const id of FOREST_WOOD_IDS)
    state = transitionForest(state, { type: 'interact', id });
  return state;
}
function harness(overrides = {}) {
  const waits = [],
    openings = [],
    errors = [],
    actions = [];
  const save = { name: '몽글', storyBooks: [], forest: readyForest() };
  const noop = () => {};
  const bindings = {
    mode: 'forest',
    book: null,
    settings: false,
    chat: false,
    toybox: null,
    replaying: false,
    age: '7–9세',
    artworkBusy: false,
    art: { loading: false, error: '' },
    mounted: { current: true },
    friendSelection: { current: 0 },
    toyOpening: { current: null },
    toyRequestEpoch: { current: 0 },
    forestInteractionEnabled: { current: true },
    save,
    saveRef: { current: save },
    timers: { current: [] },
    world: { current: { stop: noop, react: noop } },
    chatAbort: { current: null },
    audio: { current: null },
    backupOperation: { current: false },
    artworkEpoch: { current: 0 },
    resetAnswer: '지우기',
    acceptedArtwork: { current: null },
    colorRequest: { current: 0 },
    initialForestState,
    forestToyFor,
    forestToyStillCurrent,
    clearTimeout,
    Date,
    window: { matchMedia: () => ({ matches: false }) },
    readCompanionSave: () => ({
      status: 'ready',
      save: bindings.saveRef.current,
      snapshot: { generation: 'initial' },
    }),
    flush: () =>
      new Promise((resolve, reject) => waits.push({ resolve, reject })),
    setToybox: (value) => {
      bindings.toybox = value;
      if (value) openings.push(value);
    },
    setBackupStatus: (value) => errors.push(value),
    setMode: (value) => {
      bindings.mode = value;
    },
    setBook: (value) => {
      bindings.book = value;
    },
    setSettings: (value) => {
      bindings.settings = value;
    },
    setChat: (value) => {
      bindings.chat = value;
    },
    dispatch: (value) => actions.push(value),
    commitSave: noop,
    onExit: noop,
    onDrawing: noop,
    playTone: noop,
    setWalking: noop,
    setActiveNote: noop,
    setReplaying: noop,
    setReplayStep: noop,
    setMelodyHelp: noop,
    setPetSpeech: noop,
    setPanel: noop,
    setResetPrompt: noop,
    setResetAnswer: noop,
    setGuardianAnswer: noop,
    setGuardianChecked: noop,
    setGuardianQuestion: noop,
    setChatStatus: noop,
    setBusy: noop,
    setBackupBusy: noop,
    setPendingBackup: noop,
    setArtLibrary: noop,
    setConsent: noop,
    setMessages: noop,
    setInput: noop,
    setNotice: noop,
    onArtworkAccepted: noop,
    reset: async () => ({ ok: false, error: 'Simulated reset failure' }),
    clearDrawingAssets: async () => {},
    listDrawingAssets: async () => [],
    ...overrides,
  };
  bindings.cancelToyRequest = load('cancelToyRequest', bindings);
  bindings.openSettings = load('openSettings', bindings);
  bindings.closeDialog = (...args) => load('closeDialog', bindings)(...args);
  return {
    bindings,
    waits,
    openings,
    errors,
    actions,
    call: (name, ...args) => load(name, bindings)(...args),
  };
}

// A real pending flush must never place a toy over the destination screen.
for (const destination of [
  'goHome',
  'openSettings',
  'openBook',
  'openChat',
  'exitCompanion',
  'openDrawing',
]) {
  const test = harness();
  const pending = test.call('handleInteraction', 'river-bridge');
  assert.equal(test.waits.length, 1);
  test.call(destination, { id: 'keepsake' });
  test.waits[0].resolve();
  await pending;
  assert.equal(
    test.openings.length,
    0,
    `${destination} cancels the old request even when forest data is unchanged.`,
  );
  assert.equal(test.bindings.toyOpening.current, null);
  assert.equal(test.actions.length, 0);
}

// Test the actual unmount cleanup and reset click handler, not replicas.
const mountedEffect = findAll(
  (node) =>
    ts.isCallExpression(node) &&
    node.expression.getText(ast) === 'useEffect' &&
    node.arguments[0]?.getText(ast).includes('mounted.current = true'),
)[0];
assert.ok(mountedEffect);
const resetClick = findAll(
  (node) =>
    ts.isArrowFunction(node) &&
    node.getText(ast).includes('const result = await reset()') &&
    node.parent &&
    ts.isJsxExpression(node.parent),
)[0];
assert.ok(resetClick);
for (const destination of ['unmount', 'reset-failed', 'reset-succeeded']) {
  const test = harness();
  const pending = test.call('handleInteraction', 'river-bridge');
  if (destination === 'unmount') {
    const effect = evaluate(mountedEffect.arguments[0], test.bindings);
    effect()();
  } else {
    if (destination === 'reset-succeeded')
      test.bindings.reset = async () => ({ ok: true });
    await evaluate(resetClick, test.bindings)();
  }
  test.waits[0].resolve();
  await pending;
  assert.equal(
    test.openings.length,
    0,
    `${destination} revokes pending opening.`,
  );
  assert.equal(test.bindings.forestInteractionEnabled.current, false);
}

// An old request may settle after a second request has begun. Its finally and
// catch must not unlock the second request or announce a stale error.
for (const rejectOld of [false, true]) {
  const test = harness();
  const first = test.call('handleInteraction', 'river-bridge');
  test.call('goHome');
  test.call('startAdventure');
  const second = test.call('handleInteraction', 'river-bridge');
  assert.equal(test.waits.length, 2);
  const currentEpoch = test.bindings.toyOpening.current;
  if (rejectOld) test.waits[0].reject(new Error('Old write failed'));
  else test.waits[0].resolve();
  await first;
  assert.equal(test.openings.length, 0);
  assert.equal(test.errors.length, 0);
  assert.equal(
    test.bindings.toyOpening.current,
    currentEpoch,
    'Old finally cannot clear newer opening ownership.',
  );
  await test.call('handleInteraction', 'river-bridge');
  assert.equal(
    test.waits.length,
    2,
    'The active request still suppresses duplicate openings.',
  );
  test.waits[1].resolve();
  await second;
  assert.equal(test.openings.length, 1);
  assert.equal(test.openings[0].requestEpoch, currentEpoch);
  assert.equal(test.bindings.toyOpening.current, null);
}

// Screen guards cover both current renders and already-captured world callbacks.
for (const inactive of [
  { mode: 'home' },
  { book: { id: 'old' } },
  { settings: true },
  { chat: true },
  { mounted: { current: false } },
]) {
  const test = harness(inactive);
  await test.call('handleInteraction', 'river-bridge');
  await test.call('handleInteraction', 'wood-fern');
  assert.equal(test.waits.length, 0);
  assert.equal(test.actions.length, 0);
}
{
  const test = harness();
  const oldCallback = load('handleInteraction', test.bindings);
  test.call('goHome');
  await oldCallback('river-bridge');
  assert.equal(
    test.waits.length,
    0,
    'A stale forest callback cannot start a request after leaving.',
  );
  test.call('startAdventure');
  test.call('openSettings');
  test.call('closeDialog');
  const pending = test.call('handleInteraction', 'river-bridge');
  assert.equal(
    test.waits.length,
    1,
    'Closing a forest dialog restores valid interaction.',
  );
  test.waits[0].resolve();
  await pending;
  const staleFinish = load('finishToy', test.bindings);
  test.call('closeToybox');
  staleFinish('heart');
  assert.equal(
    test.actions.length,
    0,
    'A dismissed modal cannot apply a late completion.',
  );
}
{
  const test = harness();
  const pending = test.call('handleInteraction', 'river-bridge');
  test.waits[0].reject(new Error('Current write failed'));
  await pending;
  assert.equal(test.openings.length, 0);
  assert.equal(
    test.errors.length,
    1,
    'Current failures still show the storage guidance.',
  );
  assert.equal(test.bindings.toyOpening.current, null);
}
{
  const test = harness();
  const pending = test.call('handleInteraction', 'river-bridge');
  test.bindings.saveRef.current = {
    ...test.bindings.save,
    forest: transitionForest(test.bindings.save.forest, {
      type: 'interact',
      id: 'secret-shell',
    }),
  };
  test.waits[0].resolve();
  await pending;
  assert.equal(
    test.openings.length,
    0,
    'The existing source-state guard remains intact.',
  );
}

function dispatchHarness(forest) {
  const calls = [];
  const test = harness();
  const b = test.bindings;
  b.saveRef.current = { ...b.save, forest };
  Object.assign(b, {
    transitionForest,
    getForestEnding,
    replayMelody: () => calls.push('replay'),
    setTimeout: () => 1,
    commitSave: (next) => {
      b.saveRef.current = next;
      calls.push('save');
    },
    playTone: (id) => calls.push(`tone:${id}`),
    setActiveNote: (id) => calls.push(`highlight:${id}`),
    world: {
      current: {
        strikeBell: (id) => calls.push(`strike:${id}`),
        react: (action) => calls.push(`react:${action}`),
      },
    },
  });
  return {
    calls,
    current: () => b.saveRef.current.forest,
    dispatch: load('dispatch', b),
  };
}
let grove = transitionForest(readyForest(), {
  type: 'complete-craft',
  design: 'star',
});
grove = transitionForest(grove, { type: 'interact', id: 'river-gate' });
const beforeOwl = grove;
grove = transitionForest(grove, { type: 'choose-owl', choice: 'invite' });
const melody = getForestMelody(grove);
let almostFinished = grove;
for (const id of melody.slice(0, -1))
  almostFinished = transitionForest(almostFinished, { type: 'interact', id });
{
  const test = dispatchHarness(almostFinished);
  const finalNote = melody.at(-1);
  test.dispatch({ type: 'interact', id: finalNote });
  assert.equal(test.current().chapter, 'festival');
  assert.equal(
    test.calls.filter((call) => call === `strike:${finalNote}`).length,
    1,
  );
  assert.ok(
    test.calls.indexOf(`strike:${finalNote}`) <
      test.calls.indexOf('react:celebrate'),
  );
  assert.equal(
    test.calls.at(-1),
    'react:celebrate',
    'Final celebration is not overwritten by the bell wave.',
  );
}
for (const [state, id] of [
  [initialForestState(), 'bell-dew'],
  [beforeOwl, 'bell-dew'],
  [grove, 'bell-imaginary'],
  [{ ...grove, chapter: 'festival' }, 'bell-dew'],
]) {
  const test = dispatchHarness(state);
  test.dispatch({ type: 'interact', id });
  assert.strictEqual(test.current(), state);
  assert.deepEqual(
    test.calls,
    [],
    'Ignored events neither mutate saves nor play misleading feedback.',
  );
}
{
  const test = dispatchHarness(grove);
  const wrongNote = FOREST_BELL_IDS.find((id) => id !== melody[0]);
  test.dispatch({ type: 'interact', id: wrongNote });
  assert.equal(test.current().chapter, 'grove');
  assert.equal(
    test.calls.filter((call) => call === `strike:${wrongNote}`).length,
    1,
  );
  assert.ok(test.calls.includes(`tone:${wrongNote}`));
  assert.ok(!test.calls.includes('react:celebrate'));
}

// Execute the real native-dialog effect: content replacement must recover
// lost focus, while normal renders leave an active control alone.
const dialogEffect = findAll(
  (node) => ts.isCallExpression(node) &&
    node.expression.getText(ast) === 'useEffect' &&
    node.arguments[0]?.getText(ast).includes('current.showModal()'),
)[0];
assert.ok(dialogEffect);
for (const state of ['new', 'switched', 'focused', 'closed', 'absent']) {
  const calls = [];
  const inside = {};
  const doc = { activeElement: state === 'focused' ? inside : {} };
  const target = { focus: (options) => calls.push(['focus', options.preventScroll]) };
  const current = {
    open: state !== 'new',
    contains: (element) => element === inside,
    showModal() { this.open = true; doc.activeElement = inside; calls.push('show'); },
    close() { this.open = false; calls.push('close'); },
    querySelector: (selector) => { calls.push(selector); return target; },
  };
  evaluate(dialogEffect.arguments[0], {
    dialog: { current: state === 'absent' ? null : current },
    document: doc,
    world: { current: { stop: () => calls.push('stop') } },
    book: state === 'closed' ? null : {}, chat: false, settings: false,
  })();
  if (state === 'new') assert.deepEqual(calls, ['stop', 'show']);
  if (state === 'switched') assert.deepEqual(calls, ['stop', '.csb-screen-page', ['focus', true]]);
  if (state === 'focused') assert.deepEqual(calls, ['stop']);
  if (state === 'closed') assert.deepEqual(calls, ['close']);
  if (state === 'absent') assert.deepEqual(calls, []);
}

console.log(
  'Forest UI race smoke passed: actual delayed-flush handlers, navigation/dialog/unmount/reset cancellation, stale callback rejection, newer-request ownership and preserved normal play; no browser/network.',
);
