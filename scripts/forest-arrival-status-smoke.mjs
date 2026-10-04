import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext, runInNewContext } from 'node:vm';
import { Vector3, MathUtils } from 'three';
import ts from 'typescript';

function compile(text) {
  return ts.transpileModule(text, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
}
function source(file) {
  return ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}
function find(root, predicate) {
  let result;
  const visit = (node) => {
    if (predicate(node)) result = node;
    ts.forEachChild(node, visit);
  };
  visit(root);
  assert.ok(result, 'The actual source node exists.');
  return result;
}
function declaration(root, name) {
  const node = find(
    root,
    (candidate) =>
      (ts.isFunctionDeclaration(candidate) && candidate.name?.text === name) ||
      (ts.isVariableDeclaration(candidate) &&
        candidate.name.getText(root) === name &&
        candidate.initializer &&
        ts.isCallExpression(candidate.initializer) &&
        candidate.initializer.expression.getText(root) === 'useCallback'),
  );
  return ts.isFunctionDeclaration(node)
    ? node.getText(root)
    : `const ${name} = ${node.initializer.arguments[0].getText(root)};`;
}
function moduleFromFile(file) {
  const exports = {};
  runInNewContext(compile(readFileSync(file, 'utf8')), { exports });
  return exports;
}
const runtime = source('app/companion-world-runtime.ts');
const ui = source('app/companion-experience.tsx');
const story = moduleFromFile('app/forest-story.ts');
const { forestToyFor } = moduleFromFile('app/forest-play-controls.ts');
let grove = story.initialForestState('challenge');
for (const event of [
  { type: 'choose-route', route: 'garden' },
  ...story.FOREST_SEED_IDS.map((id) => ({ type: 'interact', id })),
  { type: 'complete-craft', design: 'heart' },
  { type: 'interact', id: 'garden-gate' },
  { type: 'choose-owl', choice: 'invite' },
])
  grove = story.transitionForest(grove, event);
assert.equal(grove.chapter, 'grove');

// Full actual animate() executes through navigation/arrival, then stops before
// camera/mesh rendering. No WebGL, DOM, storage, real timer, or network is used.
function harness(overrides = {}) {
  const calls = [],
    timeouts = new Map();
  const rendering = new Error('navigation-finished-before-rendering');
  let nextTimer = 0,
    nextFrame = 0,
    framesScheduled = 0;
  const statuses = [];
  const b = {
    ...story,
    forestToyFor,
    T: { Vector3, MathUtils },
    paused: false,
    disposed: false,
    document: { hidden: false },
    home: false,
    visible: true,
    frame: 0,
    last: 0,
    elapsed: 0,
    destination: null,
    journeyTarget: null,
    pendingId: null,
    pathQueue: [],
    keys: new Set(),
    joystick: new Vector3(),
    cursor: { visible: false, position: new Vector3() },
    creature: { root: { position: new Vector3(-4.2, 0, -2.9) } },
    moveVector: new Vector3(),
    camera: { position: new Vector3() },
    targetYaw: 0,
    actionUntil: 0,
    action: 'idle',
    forest: grove,
    view: story.getForestView(grove),
    nearestWalkablePoint: (point) => point,
    getCompanionNavigationPath: (_from, point) => [point],
    isForestWalkablePoint: () => true,
    cancelPointerGesture: () => {},
    forestPlushTargetYaw: () => {
      throw rendering;
    },
    arrivalFeedback: (id) => calls.push(`arrival:${id}`),
    requestAnimationFrame: () => {
      framesScheduled++;
      return ++nextFrame;
    },
    mounted: { current: true },
    forestInteractionEnabled: { current: true },
    mode: 'forest',
    book: null,
    settings: false,
    chat: false,
    toybox: null,
    toyOpening: { current: null },
    replaying: false,
    forestReader: { current: null },
    timers: { current: [] },
    saveRef: { current: { forest: grove, storyBooks: [] } },
    world: {
      current: {
        strikeBell: (id) => calls.push(`strike:${id}`),
        react: (action) => calls.push(`react:${action}`),
      },
    },
    window: { matchMedia: () => ({ matches: false }) },
    playTone: (id) => calls.push(`tone:${id}`),
    setActiveNote: () => {},
    setReplayStep: () => {},
    setPetSpeech: () => {},
    setMelodyHelp: () => {},
    setReplaying: (value) => {
      b.replaying = value;
    },
    commitSave: (next) => {
      calls.push('save');
      b.saveRef.current = next;
    },
    setTimeout: (fn, delay) => {
      timeouts.set(++nextTimer, { fn, delay });
      return nextTimer;
    },
    clearTimeout: (id) => timeouts.delete(id),
    ...overrides,
  };
  b.options = {
    onStatus: (text) => {
      statuses.push(text);
      calls.push(`status:${text}`);
    },
    onInteract: (id) => {
      calls.push(`interact:${id}`);
      return runInContext(`handleInteraction(${JSON.stringify(id)})`, context);
    },
  };
  b.setWalking = b.options.onStatus;
  const context = createContext(b);
  runInContext(
    compile(
      [
        ...[
          'navigate',
          'walkTo',
          'cancelJourney',
          'stop',
          'setPaused',
          'animate',
        ].map((name) => declaration(runtime, name)),
        ...['handleInteraction', 'replayMelody', 'dispatch'].map((name) =>
          declaration(ui, name),
        ),
      ].join('\n'),
    ),
    context,
  );
  return {
    b,
    calls,
    statuses,
    timeouts,
    call: (name, ...args) => runInContext(name, context)(...args),
    frame: () => {
      try {
        runInContext('animate(last + 16)', context);
      } catch (error) {
        assert.equal(error, rendering);
      }
    },
    arrive: () => {
      assert.ok(b.destination);
      b.creature.root.position.copy(b.destination);
      try {
        runInContext('animate(last + 16)', context);
      } catch (error) {
        assert.equal(error, rendering);
      }
    },
    finishTimers: () => {
      for (const [id, { fn }] of [...timeouts].sort(
        (a, z) => a[1].delay - z[1].delay,
      )) {
        timeouts.delete(id);
        fn();
      }
    },
    frames: () => framesScheduled,
    evaluate: (node) => runInContext(compile(node.getText(runtime)), context),
  };
}

// Reproduce the original bug using the actual five-note playback, runtime
// journey/arrival and React input guard, not a replica of any handler.
{
  const test = harness();
  test.call('replayMelody');
  assert.equal(test.b.replaying, true);
  test.call('walkTo', 'bell-dew');
  const saved = test.b.saveRef.current;
  const timerCount = test.timeouts.size;
  test.arrive();
  assert.equal(test.b.pendingId, null);
  assert.equal(test.b.destination, null);
  assert.equal(test.b.journeyTarget, null);
  assert.equal(test.b.cursor.visible, false);
  assert.equal(test.statuses.at(-1), '');
  assert.strictEqual(test.b.saveRef.current, saved);
  assert.equal(test.calls.includes('save'), false);
  assert.equal(
    test.timeouts.size,
    timerCount,
    'Ignored arrival creates no timer.',
  );
  test.finishTimers();
  assert.equal(test.b.replaying, false);
  assert.equal(test.statuses.at(-1), '');
  assert.equal(test.timeouts.size, 0);
}

// After playback, the same real arrival accepts one note and saves once.
{
  const test = harness();
  test.call('replayMelody');
  test.finishTimers();
  test.calls.length = 0;
  const first = story.getForestMelody(grove)[0];
  test.call('walkTo', first);
  test.arrive();
  assert.equal(test.b.saveRef.current.forest.melody, 1);
  assert.equal(test.calls.filter((call) => call === 'save').length, 1);
  assert.ok(
    test.calls.indexOf('status:') < test.calls.indexOf(`interact:${first}`),
  );
  assert.equal(
    test.calls.filter((call) => call === `strike:${first}`).length,
    1,
  );
  test.finishTimers();
  const callCount = test.calls.length;
  for (let frame = 0; frame < 20; frame++) test.frame();
  assert.equal(
    test.calls.length,
    callCount,
    'Idle frames do not clear later feedback again.',
  );
  assert.equal(test.frames(), 21, 'Arrival adds no extra animation loop.');
  assert.equal(test.timeouts.size, 0);
  test.b.disposed = true;
  test.frame();
  assert.equal(test.frames(), 21, 'A disposed world does not reschedule.');
}

// A callback captured before a modal/exit can reject input too. Travel status
// still ends, without relaxing any screen, playback or lifetime guard.
for (const blocked of [
  { replaying: true },
  { book: { id: 'saved-book' } },
  { settings: true },
  { chat: true },
  { mode: 'home' },
  { forestInteractionEnabled: { current: false } },
  { mounted: { current: false } },
]) {
  const test = harness(blocked);
  test.call('walkTo', 'bell-dew');
  test.arrive();
  assert.equal(test.statuses.at(-1), '');
  assert.equal(test.calls.includes('save'), false);
  assert.equal(test.timeouts.size, 0);
}

// Clearing before dispatch is essential: a new action or error owns its text.
for (const message of [
  '다음 종을 찾아보자.',
  '모험 저장을 확인하지 못했어요.',
]) {
  const test = harness();
  test.b.options.onInteract = () => test.b.options.onStatus(message);
  test.call('walkTo', 'bell-dew');
  test.arrive();
  assert.equal(test.statuses.at(-1), message);
  test.call('stop');
  test.frame();
  assert.equal(
    test.statuses.at(-1),
    message,
    'Idle cleanup preserves new feedback.',
  );
}

// Pause cancels, replacement belongs only to the newest destination, and
// an intermediate waypoint must not announce arrival early.
{
  const test = harness();
  test.call('walkTo', 'bell-dew');
  test.call('setPaused', true);
  assert.equal(test.statuses.at(-1), '');
  test.b.options.onStatus('책을 닫으면 이어서 놀자.');
  test.frame();
  test.call('setPaused', false);
  test.frame();
  assert.equal(test.statuses.at(-1), '책을 닫으면 이어서 놀자.');
  assert.equal(
    test.calls.some((call) => call.startsWith('interact:')),
    false,
  );
}
{
  const test = harness({ replaying: true });
  test.call('walkTo', 'bell-dew');
  test.call('walkTo', 'bell-star');
  test.b.pathQueue.push(test.b.destination.clone().add(new Vector3(0.1, 0, 0)));
  const before = test.statuses.length;
  test.arrive();
  assert.equal(
    test.statuses.length,
    before,
    'A waypoint is not final arrival.',
  );
  assert.equal(test.b.pendingId, 'bell-star');
  test.arrive();
  assert.equal(test.statuses.at(-1), '');
  assert.deepEqual(
    test.calls.filter((call) => call.startsWith('interact:')),
    ['interact:bell-star'],
  );
}
{
  const test = harness();
  test.call('walkTo', 'bell-dew');
  test.call('navigate', new Vector3(1, 0, 1), null);
  test.arrive();
  assert.equal(
    test.statuses.at(-1),
    '',
    'An ordinary ground destination also ends travel.',
  );
  assert.equal(
    test.calls.some((call) => call.startsWith('interact:')),
    false,
  );
}

// Execute setForest's real stale-target cancellation gate. No ghost arrival
// can subsequently erase new chapter feedback or dispatch the removed target.
{
  const test = harness();
  test.call('walkTo', 'bell-dew');
  test.b.view = { hotspots: [] };
  const staleTargetGate = find(
    runtime,
    (node) =>
      ts.isIfStatement(node) &&
      node.expression.getText(runtime).includes('pendingId &&') &&
      node.expression.getText(runtime).includes('view.hotspots.some'),
  );
  test.evaluate(staleTargetGate);
  test.b.options.onStatus('등불을 켜러 가자.');
  test.frame();
  assert.equal(test.b.pendingId, null);
  assert.equal(test.statuses.at(-1), '등불을 켜러 가자.');
  assert.equal(
    test.calls.some((call) => call.startsWith('interact:')),
    false,
  );
}

console.log(
  'Forest arrival status smoke passed: actual navigation/arrival and UI guards, five-note replay, accepted/ignored input, clear-before-feedback, pause/replacement/stale targets, and unchanged timer/frame lifetime.',
);
