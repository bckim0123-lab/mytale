import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const readerPath = 'app/forest-narration-reader.tsx';
const readerSource = readFileSync(readerPath, 'utf8');
const speechSource = readFileSync('app/local-speech.ts', 'utf8');
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
function load(source, globals = {}, dependencies = {}) {
  const exports = {};
  runInNewContext(compile(source), {
    exports,
    ...globals,
    require(name) {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}
const local = {
  name: 'Local Korean',
  voiceURI: 'local-ko',
  lang: 'ko-KR',
  localService: true,
};
const remote = { ...local, voiceURI: 'remote-ko', localService: false };
function events() {
  const listeners = new Map();
  return {
    addEventListener(name, callback) {
      const set = listeners.get(name) ?? new Set();
      set.add(callback);
      listeners.set(name, set);
    },
    removeEventListener(name, callback) {
      listeners.get(name)?.delete(callback);
    },
    dispatch(name) {
      for (const callback of listeners.get(name) ?? []) callback();
    },
    count(name) {
      return listeners.get(name)?.size ?? 0;
    },
  };
}
function environment(options = {}) {
  const state = {
    voices: options.voices ?? [remote, local],
    spoken: [],
    active: new Set(),
    cancels: 0,
  };
  const synthesis = {
    ...events(),
    getVoices() {
      if (options.voicesThrow) throw new Error('device voices');
      return state.voices;
    },
    speak(utterance) {
      if (options.speakThrow) throw new Error('device speak');
      state.spoken.push(utterance);
      state.active.add(utterance);
    },
    cancel() {
      state.cancels++;
      state.active.clear();
      if (options.cancelThrow) throw new Error('device cancel');
    },
  };
  class Utterance {
    constructor(text) {
      if (options.constructorThrow) throw new Error('device utterance');
      this.text = text;
    }
  }
  const globals = {
    window: options.noApi
      ? {}
      : { speechSynthesis: synthesis, SpeechSynthesisUtterance: Utterance },
    document: { ...events(), hidden: false },
    SpeechSynthesisUtterance: Utterance,
  };
  const helpers = load(speechSource, globals);
  return { state, synthesis, globals, helpers };
}

const sameDependencies = (previous, next) =>
  previous &&
  next &&
  previous.length === next.length &&
  next.every((value, index) => Object.is(value, previous[index]));
let nextId = 0;
// Run the complete actual component, including its JSX onClick and effect
// dependency arrays. This small hook runner models synchronous ref writes,
// deferred state renders, effect cleanup, and stable callback dependencies.
function fixture(options = {}, source = readerSource) {
  const env = options.environment ?? environment(options);
  const slots = [];
  let cursor = 0;
  let dirty = true;
  let mounted = true;
  let pending = [];
  let tree;
  let props = {
    dialogue: '안녕, 작은 친구야.',
    objective: '함께 갈 길을 골라 줘.',
    choices: [{ label: '시냇물 길' }, { label: '비밀 정원' }],
    revisionKey: 0,
    suspended: false,
    ...options.props,
  };
  const ref = { current: null };
  const hooks = {
    forwardRef: (render) => render,
    useRef(value) {
      const index = cursor++;
      slots[index] ??= { kind: 'ref', value: { current: value } };
      return slots[index].value;
    },
    useState(initial) {
      const index = cursor++;
      slots[index] ??= {
        kind: 'state',
        value: typeof initial === 'function' ? initial() : initial,
      };
      return [
        slots[index].value,
        (next) => {
          const value =
            typeof next === 'function' ? next(slots[index].value) : next;
          if (!Object.is(value, slots[index].value)) {
            slots[index].value = value;
            dirty = true;
          }
        },
      ];
    },
    useId() {
      const index = cursor++;
      slots[index] ??= { kind: 'id', value: `forest-narration-${++nextId}` };
      return slots[index].value;
    },
    useCallback(callback, dependencies) {
      const index = cursor++;
      if (!sameDependencies(slots[index]?.dependencies, dependencies))
        slots[index] = { kind: 'callback', dependencies, value: callback };
      return slots[index].value;
    },
    useEffect(callback, dependencies) {
      const index = cursor++;
      if (!sameDependencies(slots[index]?.dependencies, dependencies)) {
        const previous = slots[index];
        const next = { kind: 'effect', dependencies, cleanup: null };
        slots[index] = next;
        pending.push(() => {
          previous?.cleanup?.();
          next.cleanup = callback();
        });
      }
    },
    useImperativeHandle(target, create, dependencies) {
      hooks.useEffect(() => {
        if (target) target.current = create();
        return () => {
          if (target) target.current = null;
        };
      }, [...dependencies, target]);
    },
  };
  const jsx = (type, elementProps) => ({ type, props: elementProps });
  const reader = load(source, env.globals, {
    react: hooks,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'lucide-react': { Square: 'square-icon', Volume2: 'volume-icon' },
    './local-speech': env.helpers,
    './forest-narration-reader.css': {},
  });
  function flush() {
    for (let turn = 0; dirty || pending.length; turn++) {
      assert.ok(turn < 20, 'No render/effect loop');
      if (dirty) {
        cursor = 0;
        dirty = false;
        tree = reader.ForestNarrationReader(props, ref);
      }
      const effects = pending;
      pending = [];
      for (const effect of effects) effect();
    }
  }
  function elements(node, type) {
    if (node === null || node === undefined || typeof node !== 'object')
      return [];
    if (Array.isArray(node))
      return node.flatMap((child) => elements(child, type));
    return [
      ...(node.type === type ? [node] : []),
      ...elements(node.props?.children, type),
    ];
  }
  function visibleText(node) {
    if (node === null || node === undefined || typeof node === 'boolean')
      return '';
    if (Array.isArray(node)) return node.map(visibleText).join('');
    if (typeof node !== 'object') return String(node);
    return visibleText(node.props?.children);
  }
  flush();
  return {
    ...env,
    reader,
    ref,
    flush,
    button: () => elements(tree, 'button')[0],
    hint: () => elements(tree, 'output')[0],
    text: () => visibleText(tree),
    click() {
      const button = elements(tree, 'button')[0];
      assert.equal(
        button.props.disabled,
        false,
        'Only enabled buttons can be clicked',
      );
      button.props.onClick();
      flush();
    },
    update(changes) {
      props = { ...props, ...changes };
      dirty = true;
      flush();
    },
    strictRemount() {
      for (const slot of slots) {
        if (slot.kind !== 'effect') continue;
        slot.cleanup?.();
        slot.cleanup = null;
        slot.dependencies = undefined;
      }
      dirty = true;
      flush();
    },
    unmount() {
      assert.ok(mounted);
      mounted = false;
      for (const slot of slots) if (slot.kind === 'effect') slot.cleanup?.();
    },
  };
}

const forest = load(readFileSync('app/forest-story.ts', 'utf8'));
const composer = fixture().reader.forestNarrationText;
let composed = 0;
for (const difficulty of ['simple', 'standard', 'challenge'])
  for (const route of ['river', 'garden'])
    for (const owl of ['listen', 'invite'])
      for (const ending of ['sky', 'home']) {
        let state = forest.initialForestState(difficulty);
        function inspect() {
          const view = forest.getForestView(state);
          // Extra fields must never leak hidden answers, actions, or reward text.
          const input = {
            ...view,
            hotspots: [{ label: 'HIDDEN-HOTSPOT' }],
            melody: ['HIDDEN-MELODY'],
            reward: 'HIDDEN-REWARD',
            choices: view.choices.map((choice) => ({
              ...choice,
              description: 'NOT-A-CHOICE-LABEL',
              event: { type: 'HIDDEN-EVENT' },
            })),
          };
          const expected = [view.dialogue.trim()];
          if (
            view.objective.trim() &&
            view.objective.trim() !== view.dialogue.trim()
          )
            expected.push(`지금 할 일. ${view.objective.trim()}`);
          if (view.choices.length)
            expected.push(
              `고를 수 있어요. ${view.choices.map((choice) => choice.label.trim()).join('\n또는, ')}`,
            );
          assert.equal(composer(input), expected.filter(Boolean).join('\n'));
          assert.doesNotMatch(composer(input), /HIDDEN|NOT-A-CHOICE/);
          composed++;
        }
        function event(value) {
          state = forest.transitionForest(state, value);
          inspect();
        }
        const interact = (id) => event({ type: 'interact', id });
        inspect();
        interact('owl-welcome');
        event({ type: 'choose-route', route });
        if (route === 'river') {
          for (const id of forest.FOREST_WOOD_IDS) interact(id);
          interact('river-bridge');
        } else {
          for (const id of forest.FOREST_SEED_IDS) interact(id);
          interact('garden-water');
        }
        event({ type: 'complete-craft', design: 'heart' });
        interact(route === 'river' ? 'river-gate' : 'garden-gate');
        interact('owl-grove');
        event({ type: 'choose-owl', choice: owl });
        for (const id of forest.getForestMelody(state)) interact(id);
        for (const id of forest.FOREST_LANTERN_IDS) interact(id);
        event({ type: 'choose-ending', choice: ending });
        assert.equal(state.chapter, 'complete');
      }
assert.equal(
  composer({ dialogue: ' 같은 문장 ', objective: '같은 문장', choices: [] }),
  '같은 문장',
);
assert.equal(
  composer({ dialogue: ' ', objective: '', choices: [{ label: ' ' }] }),
  '',
);

for (const options of [
  { voices: [remote] },
  { voices: [] },
  { noApi: true },
  { voicesThrow: true },
  { voices: [{ ...local, lang: 'en-US' }] },
  { voices: [{ ...local, localService: undefined }] },
  { voices: [{ ...local, lang: 'korean' }] },
]) {
  const test = fixture(options);
  assert.equal(test.button().props.disabled, true);
  assert.ok(test.text().includes(test.helpers.LOCAL_SPEECH_UNAVAILABLE));
  test.button().props.onClick(); // Guard even if invoked outside the disabled DOM button.
  test.flush();
  assert.equal(test.state.spoken.length, 0, 'No remote/default voice fallback');
  test.unmount();
}

const lifecycle = fixture();
assert.equal(lifecycle.state.spoken.length, 0, 'Mount does not narrate');
assert.equal(lifecycle.button().props['aria-pressed'], false);
assert.equal(
  lifecycle.button().props['aria-describedby'],
  lifecycle.hint().props.id,
);
assert.equal(
  lifecycle.hint().type,
  'output',
  'Availability/errors are a semantic status',
);
lifecycle.strictRemount();
assert.equal(
  lifecycle.state.spoken.length,
  0,
  'Strict effect replay does not narrate',
);
assert.equal(lifecycle.synthesis.count('voiceschanged'), 1);
assert.equal(lifecycle.globals.document.count('visibilitychange'), 1);
for (let tick = 0; tick < 10; tick++) {
  lifecycle.update({
    choices: [{ label: '시냇물 길' }, { label: '비밀 정원' }],
  });
  lifecycle.synthesis.dispatch('voiceschanged');
  lifecycle.flush();
}
assert.equal(
  lifecycle.state.spoken.length,
  0,
  'Renders/voice events never narrate',
);
lifecycle.click();
const initial = lifecycle.state.spoken.at(-1);
assert.equal(initial.voice, local, 'Remote listed first is skipped');
assert.equal(initial.lang, 'ko-KR');
assert.equal(initial.rate, 0.86);
assert.equal(initial.pitch, 1.04);
assert.equal(lifecycle.button().props['aria-pressed'], true);
assert.match(lifecycle.text(), /그만 읽기/);
lifecycle.update({ choices: [{ label: '시냇물 길' }, { label: '비밀 정원' }] });
assert.equal(
  typeof initial.onend,
  'function',
  'Equivalent text/new array does not interrupt',
);
lifecycle.synthesis.dispatch('voiceschanged');
lifecycle.flush();
assert.equal(
  typeof initial.onend,
  'function',
  'Same local voice remains active',
);

function assertStopped(test, utterance, label) {
  assert.equal(utterance.onend, null, `${label}: end callback detached`);
  assert.equal(utterance.onerror, null, `${label}: error callback detached`);
  assert.equal(
    test.button().props['aria-pressed'],
    false,
    `${label}: stop label cleared`,
  );
  assert.equal(test.state.active.size, 0, `${label}: device queue canceled`);
}
for (const changes of [
  { dialogue: '새 대사가 왔어요.' },
  { objective: '다음 행동이에요.' },
  { choices: [{ label: '새 선택지' }] },
  { revisionKey: 1 },
  {
    suspended: true,
    suspendedReason: '종소리 순서를 들은 뒤 이야기를 읽어 주세요.',
  },
]) {
  const test = fixture();
  test.click();
  const utterance = test.state.spoken.at(-1);
  test.update(changes);
  assertStopped(test, utterance, JSON.stringify(changes));
  assert.equal(
    test.state.spoken.length,
    1,
    'Change only stops; never auto restarts',
  );
  if (changes.suspended) {
    assert.equal(test.button().props.disabled, true);
    assert.match(test.text(), /종소리 순서를 들은 뒤/);
    test.button().props.onClick();
    test.flush();
    assert.equal(test.state.spoken.length, 1);
    test.update({ suspended: false });
    assert.equal(
      test.state.spoken.length,
      1,
      'Closing a modal/replay does not restart',
    );
  }
  test.unmount();
}

const hidden = fixture();
hidden.click();
const hiddenUtterance = hidden.state.spoken.at(-1);
hidden.globals.document.hidden = true;
hidden.globals.document.dispatch('visibilitychange');
hidden.flush();
assertStopped(hidden, hiddenUtterance, 'Hidden document');
hidden.button().props.onClick();
assert.equal(
  hidden.state.spoken.length,
  1,
  'Hidden document cannot start reading',
);
hidden.globals.document.hidden = false;
hidden.globals.document.dispatch('visibilitychange');
hidden.flush();
assert.equal(
  hidden.state.spoken.length,
  1,
  'Visibility restore never restarts',
);
hidden.click();
const unmountedUtterance = hidden.state.spoken.at(-1);
hidden.unmount();
assert.equal(unmountedUtterance.onend, null);
assert.equal(unmountedUtterance.onerror, null);
assert.equal(hidden.ref.current, null);
assert.equal(hidden.synthesis.count('voiceschanged'), 0);
assert.equal(hidden.globals.document.count('visibilitychange'), 0);

const rapid = fixture();
const rapidClick = rapid.button().props.onClick;
rapidClick();
const first = rapid.state.spoken.at(-1);
const lateEnd = first.onend;
const lateError = first.onerror;
rapidClick(); // No state render between these clicks.
rapid.flush();
assert.equal(
  rapid.state.spoken.length,
  1,
  'Rapid second click stops, never queues speech',
);
assertStopped(rapid, first, 'Rapid second click');
rapidClick();
rapid.flush();
const second = rapid.state.spoken.at(-1);
lateEnd();
lateError({ error: 'network' });
rapid.flush();
assert.equal(
  rapid.button().props['aria-pressed'],
  true,
  'Stale callbacks cannot stop a newer read',
);
assert.doesNotMatch(rapid.text(), /시작하지 못했어요/);
second.onend();
rapid.flush();
assert.equal(rapid.button().props['aria-pressed'], false);
assert.equal(second.onend, null);
assert.equal(second.onerror, null);

for (const option of ['speakThrow', 'constructorThrow']) {
  const test = fixture({ [option]: true });
  test.click();
  assert.equal(test.state.spoken.length, 0);
  assert.equal(test.button().props['aria-pressed'], false);
  assert.match(test.text(), /읽어 주기를 시작하지 못했어요/);
  test.unmount();
}
for (const error of ['audio-busy', 'canceled', 'interrupted']) {
  const test = fixture();
  test.click();
  const utterance = test.state.spoken.at(-1);
  utterance.onerror({ error });
  test.flush();
  assert.equal(test.button().props['aria-pressed'], false);
  assert.equal(utterance.onend, null);
  assert.equal(utterance.onerror, null);
  assert.equal(
    test.text().includes('시작하지 못했어요'),
    error === 'audio-busy',
  );
}
const cancelFailure = fixture({ cancelThrow: true });
cancelFailure.click();
assert.doesNotThrow(() => cancelFailure.ref.current.stop());
cancelFailure.flush();
assert.equal(cancelFailure.button().props['aria-pressed'], false);
assert.doesNotThrow(() => cancelFailure.unmount());

const voiceChange = fixture({ voices: [] });
assert.equal(voiceChange.button().props.disabled, true);
voiceChange.state.voices = [remote, local];
voiceChange.synthesis.dispatch('voiceschanged');
voiceChange.flush();
assert.equal(voiceChange.button().props.disabled, false);
assert.equal(voiceChange.state.spoken.length, 0);
voiceChange.click();
const removedVoice = voiceChange.state.spoken.at(-1);
voiceChange.state.voices = [remote];
voiceChange.synthesis.dispatch('voiceschanged');
voiceChange.flush();
assertStopped(voiceChange, removedVoice, 'Local voice removed');
assert.equal(voiceChange.button().props.disabled, true);
assert.ok(
  voiceChange.text().includes(voiceChange.helpers.LOCAL_SPEECH_UNAVAILABLE),
);
voiceChange.state.voices = [local];
voiceChange.synthesis.dispatch('voiceschanged');
voiceChange.flush();
voiceChange.click();
const replacedVoice = voiceChange.state.spoken.at(-1);
voiceChange.state.voices = [
  { ...local, voiceURI: 'another-local', name: 'Another Korean' },
];
voiceChange.synthesis.dispatch('voiceschanged');
voiceChange.flush();
assertStopped(voiceChange, replacedVoice, 'Local voice replaced');
assert.equal(voiceChange.state.spoken.length, 2, 'Voice change never restarts');
voiceChange.state.voices = [remote]; // No voiceschanged event before this click.
voiceChange.button().props.onClick();
voiceChange.flush();
assert.equal(
  voiceChange.state.spoken.length,
  2,
  'Voice rechecked at click time',
);
assert.equal(voiceChange.button().props.disabled, true);

// Exercise ownership against the actual existing book reader, not a fake
// independent cancel implementation. Parent stops before opening the book.
const bookSource = readFileSync('app/companion-storybook.tsx', 'utf8');
const bookAst = ts.createSourceFile(
  'book.tsx',
  bookSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const bookFunctions = [];
function visitBook(node) {
  if (
    ts.isFunctionDeclaration(node) &&
    ['readPage', 'stopSpeech'].includes(node.name?.text)
  )
    bookFunctions.push(node.getText(bookAst));
  ts.forEachChild(node, visitBook);
}
visitBook(bookAst);
assert.equal(bookFunctions.length, 2);
const handoff = fixture();
handoff.click();
const oldAdventure = handoff.state.spoken.at(-1);
const oldEnd = oldAdventure.onend;
const oldError = oldAdventure.onerror;
handoff.ref.current.stop();
handoff.flush();
const bookSpeech = { current: null };
const bookContext = {
  ...handoff.globals,
  ...handoff.helpers,
  speech: bookSpeech,
  speaking: false,
  book: { pages: ['함께 쓴 동화책이에요.'] },
  activePage: 0,
  storybookChapterTitle: () => '우리 책',
  setSpeaking(value) {
    bookContext.speaking = value;
  },
  setSpeechAvailable() {},
  setSpeechError() {},
};
const book = runInNewContext(
  compile(`${bookFunctions.join('\n')}\n({readPage, stopSpeech});`),
  bookContext,
);
book.readPage();
const bookUtterance = bookSpeech.current;
const cancelsBefore = handoff.state.cancels;
handoff.update({ suspended: true, revisionKey: 'book-open' });
oldEnd();
oldError({ error: 'network' });
handoff.flush();
handoff.unmount();
assert.equal(
  handoff.state.cancels,
  cancelsBefore,
  'Old cleanup never cancels newer book ownership',
);
assert.equal(bookSpeech.current, bookUtterance);
assert.ok(handoff.state.active.has(bookUtterance));
book.stopSpeech();
assert.equal(bookSpeech.current, null);

// Parent integration: evaluate the actual rendered JSX and actual transition
// functions. Neither a duplicated prop formula nor a fake stop-only handler
// can establish that the visible adventure is wired to this reader correctly.
const experienceSource = readFileSync('app/companion-experience.tsx', 'utf8');
function parentAst(source = experienceSource) {
  return ts.createSourceFile(
    'experience.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}
function findParent(ast, predicate) {
  const matches = [];
  function visit(node) {
    if (predicate(node)) matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return matches;
}
const experienceAst = parentAst();
function parentFunction(name, bindings, ast = experienceAst) {
  const declarations = findParent(
    ast,
    (node) =>
      (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) &&
      node.name?.getText(ast) === name,
  );
  assert.equal(declarations.length, 1, `Actual parent function ${name}`);
  const node = declarations[0];
  const expression = ts.isFunctionDeclaration(node)
    ? node
    : node.initializer.arguments[0];
  return runInNewContext(compile(`(${expression.getText(ast)})`), bindings);
}
const readerElement = findParent(
  experienceAst,
  (node) =>
    ts.isJsxSelfClosingElement(node) &&
    node.tagName.getText(experienceAst) === 'ForestNarrationReader',
);
assert.equal(
  readerElement.length,
  1,
  'One reader owns the current adventure narration',
);
const jsx = (type, props) => ({ type, props });
const parentJsx = compile(
  `export const element = (${readerElement[0].getText(experienceAst)});`,
);
function renderedReader(bindings) {
  const exports = {};
  runInNewContext(parentJsx, {
    exports,
    ...bindings,
    require(name) {
      assert.equal(name, 'react/jsx-runtime');
      return { jsx, jsxs: jsx };
    },
  });
  return exports.element;
}
const momentKeyFor = parentFunction('forestMomentKey', {});
const referenceReader = fixture();
const markerView = {
  dialogue: '지금 보이는 대사',
  objective: '지금 보이는 목표',
  choices: [{ label: '지금 보이는 선택' }],
};
const baseBindings = {
  ForestNarrationReader: referenceReader.reader.ForestNarrationReader,
  forestReader: referenceReader.ref,
  view: markerView,
  forest: {
    ...forest.initialForestState(),
    message: '읽으면 안 되는 원시 대사',
    moves: 7,
  },
  momentKey: 'arrival-false',
  mode: 'forest',
  book: null,
  chat: false,
  settings: false,
  toybox: null,
  replaying: false,
};
let parentCases = 0;
const viewDeclaration = findParent(
  experienceAst,
  (node) =>
    ts.isVariableDeclaration(node) &&
    node.name.getText(experienceAst) === 'view',
);
assert.equal(viewDeclaration.length, 1);
for (const difficulty of ['simple', 'standard', 'challenge'])
  for (const route of ['river', 'garden']) {
    const current = forest.transitionForest(
      forest.initialForestState(difficulty),
      { type: 'choose-route', route },
    );
    const actualView = runInNewContext(
      compile(`(${viewDeclaration[0].initializer.getText(experienceAst)})`),
      { forest: current, getForestView: forest.getForestView },
    );
    const expectedView = forest.getForestView(current);
    const props = renderedReader({
      ...baseBindings,
      forest: current,
      view: actualView,
      momentKey: momentKeyFor(current),
    }).props;
    assert.equal(props.dialogue, expectedView.dialogue);
    assert.equal(props.objective, expectedView.objective);
    assert.strictEqual(
      props.choices,
      actualView.choices,
      'Actual view declaration passes only current visible choices',
    );
    parentCases++;
  }
for (const mode of ['forest', 'home'])
  for (let mask = 0; mask < 32; mask++) {
    const bindings = { ...baseBindings, mode };
    for (const [index, name] of [
      'book',
      'chat',
      'settings',
      'toybox',
      'replaying',
    ].entries())
      bindings[name] = Boolean(mask & (1 << index));
    const element = renderedReader(bindings);
    assert.strictEqual(element.type, baseBindings.ForestNarrationReader);
    assert.strictEqual(element.props.ref, referenceReader.ref);
    assert.strictEqual(element.props.dialogue, markerView.dialogue);
    assert.strictEqual(element.props.objective, markerView.objective);
    assert.strictEqual(element.props.choices, markerView.choices);
    assert.equal(
      element.props.suspended,
      mode !== 'forest' || mask !== 0,
      'Actual suspension truth table',
    );
    assert.equal(
      element.props.suspendedReason?.includes('종소리 순서'),
      bindings.replaying ? true : undefined,
    );
    parentCases++;
  }
const sameWordsBefore = renderedReader(baseBindings).props;
const sameWordsAfter = renderedReader({
  ...baseBindings,
  forest: { ...baseBindings.forest, moves: 8 },
}).props;
assert.notEqual(
  sameWordsBefore.revisionKey,
  sameWordsAfter.revisionKey,
  'Same copy after a new move has a new reading identity',
);
assert.notEqual(
  sameWordsBefore.revisionKey,
  renderedReader({ ...baseBindings, momentKey: 'crossing-true' }).props
    .revisionKey,
);
referenceReader.update(sameWordsBefore);
referenceReader.click();
const revisionUtterance = referenceReader.state.spoken.at(-1);
referenceReader.update(sameWordsAfter);
assertStopped(
  referenceReader,
  revisionUtterance,
  'Actual JSX progress identity',
);
referenceReader.unmount();

const playControls = load(readFileSync('app/forest-play-controls.ts', 'utf8'));
function readyCraft(route = 'river', difficulty = 'standard') {
  let state = forest.transitionForest(forest.initialForestState(difficulty), {
    type: 'choose-route',
    route,
  });
  for (const id of route === 'river'
    ? forest.FOREST_WOOD_IDS
    : forest.FOREST_SEED_IDS)
    state = forest.transitionForest(state, { type: 'interact', id });
  return state;
}
function readyGrove() {
  let state = forest.transitionForest(readyCraft(), {
    type: 'complete-craft',
    design: 'heart',
  });
  state = forest.transitionForest(state, {
    type: 'interact',
    id: 'river-gate',
  });
  state = forest.transitionForest(state, {
    type: 'choose-owl',
    choice: 'invite',
  });
  return state;
}
function parentFixture(
  initial = forest.initialForestState(),
  ast = experienceAst,
) {
  const test = fixture({
    props: {
      ...forest.getForestView(initial),
      revisionKey: `${momentKeyFor(initial)}:${initial.moves}`,
    },
  });
  const trace = [];
  const waits = [];
  const timeouts = new Map();
  let nextTimer = 0;
  const actualStop = test.ref.current.stop;
  test.ref.current.stop = () => {
    trace.push('stop');
    actualStop();
  };
  const save = {
    forest: initial,
    name: '몽글',
    appearance: { kind: 'bunny' },
    completedAdventures: 0,
    unlockedAccessories: [],
    storyBooks: [],
  };
  const bindings = {
    ...forest,
    ...playControls,
    ForestNarrationReader: test.reader.ForestNarrationReader,
    forestReader: test.ref,
    save,
    saveRef: { current: save },
    friendSelection: { current: 0 },
    toyRequestEpoch: { current: 0 },
    toyOpening: { current: null },
    forestInteractionEnabled: { current: true },
    mounted: { current: true },
    mode: 'forest',
    book: null,
    chat: false,
    settings: false,
    toybox: null,
    replaying: false,
    artworkBusy: false,
    art: { loading: false, error: '' },
    age: '7–9세',
    timers: { current: [] },
    chatAbort: { current: null },
    gameStage: { current: null },
    world: {
      current: {
        stop: () => trace.push('world-stop'),
        react: (action) => trace.push(`react:${action}`),
        strikeBell: (id) => trace.push(`bell:${id}`),
      },
    },
    window: { matchMedia: () => ({ matches: false }) },
    forestMomentKey: momentKeyFor,
    setTimeout(callback) {
      trace.push('schedule');
      timeouts.set(++nextTimer, callback);
      return nextTimer;
    },
    clearTimeout(id) {
      timeouts.delete(id);
    },
    requestAnimationFrame() {
      throw new Error('Desktop fixture does not need a frame');
    },
    flush: () =>
      new Promise((resolve, reject) => {
        trace.push('flush');
        waits.push({ resolve, reject });
      }),
    readCompanionSave: () => ({
      status: 'ready',
      save: bindings.saveRef.current,
      snapshot: { generation: 'current' },
    }),
    commitSave(next) {
      trace.push('save');
      bindings.saveRef.current =
        typeof next === 'function' ? next(bindings.saveRef.current) : next;
      bindings.save = bindings.saveRef.current;
    },
    cancelBackupWork: () => trace.push('cancel-backup'),
    onExit: () => trace.push('exit'),
    onDrawing: () => trace.push('drawing'),
    playTone: () => trace.push('tone'),
  };
  for (const name of [
    'Toybox',
    'Walking',
    'ActiveNote',
    'Replaying',
    'ReplayStep',
    'PetSpeech',
    'MelodyHelp',
    'Mode',
    'Panel',
    'Book',
    'Chat',
    'Settings',
    'ResumedMomentKey',
    'GuardianQuestion',
    'GuardianAnswer',
    'GuardianChecked',
    'BackupStatus',
    'ResetPrompt',
    'ResetAnswer',
    'ChatStatus',
    'Busy',
  ])
    bindings[`set${name}`] = (value) => {
      trace.push(`set${name}`);
      bindings[name[0].toLowerCase() + name.slice(1)] = value;
    };
  for (const name of [
    'cancelToyRequest',
    'replayMelody',
    'dispatch',
    'openSettings',
  ])
    bindings[name] = parentFunction(name, bindings, ast);
  function syncReader() {
    const current = bindings.saveRef.current.forest;
    test.update(
      renderedReader({
        ...bindings,
        forest: current,
        momentKey: momentKeyFor(current),
        view: forest.getForestView(current),
      }).props,
    );
  }
  return {
    test,
    trace,
    waits,
    bindings,
    timeouts,
    syncReader,
    call: (name, ...args) => parentFunction(name, bindings, ast)(...args),
    read() {
      test.click();
      return test.state.spoken.at(-1);
    },
    assertImmediate(utterance, label) {
      // Do not render/flush effects until after checking synchronous ownership.
      assert.equal(
        utterance.onend,
        null,
        `${label}: stopped in the parent action, before any effect`,
      );
      assert.equal(utterance.onerror, null);
      assert.equal(test.state.active.size, 0);
      test.flush();
      assert.equal(test.button().props['aria-pressed'], false);
      parentCases++;
    },
  };
}
/** @type {[string, unknown[], string | null][]} */
const parentTransitions = [
  ['cancelToyRequest', [], 'setToybox'],
  ['cancelToyRequest', [false], null],
  ['goHome', [], 'setMode'],
  ['startAdventure', [], 'setMode'],
  ['openBook', [{ id: 'new-book' }], 'setBook'],
  ['openChat', [], 'setChat'],
  ['openSettings', [], 'setSettings'],
  ['exitCompanion', [], 'exit'],
  ['openDrawing', [], 'drawing'],
  ['closeToybox', [], 'setToybox'],
  ['closeDialog', [], 'setBook'],
];
for (const [action, args, boundary] of parentTransitions) {
  const parent = parentFixture();
  const utterance = parent.read();
  parent.call(action, ...args);
  parent.assertImmediate(utterance, action);
  if (boundary)
    assert.ok(
      parent.trace.indexOf('stop') < parent.trace.indexOf(boundary),
      `${action}: stops before transition`,
    );
  parent.syncReader();
  assert.equal(
    parent.test.state.spoken.length,
    1,
    `${action}: no automatic restart`,
  );
  parent.test.unmount();
}
const melodyParent = parentFixture(readyGrove());
const melodyUtterance = melodyParent.read();
melodyParent.call('replayMelody');
melodyParent.assertImmediate(melodyUtterance, 'replayMelody');
assert.equal(melodyParent.trace[0], 'stop');
assert.ok(
  melodyParent.trace.indexOf('stop') < melodyParent.trace.indexOf('schedule'),
);
melodyParent.syncReader();
assert.equal(melodyParent.test.button().props.disabled, true);
assert.match(melodyParent.test.text(), /종소리 순서를 들은 뒤/);
for (const callback of melodyParent.timeouts.values()) callback();
melodyParent.syncReader();
assert.equal(melodyParent.test.button().props.disabled, false);
assert.equal(melodyParent.test.state.spoken.length, 1);
melodyParent.test.unmount();

for (const [state, event] of [
  [forest.initialForestState(), { type: 'choose-route', route: 'garden' }],
  [
    readyGrove(),
    { type: 'interact', id: forest.getForestMelody(readyGrove())[0] },
  ],
  [readyGrove(), { type: 'interact', id: 'owl-grove' }],
]) {
  const parent = parentFixture(state);
  const utterance = parent.read();
  parent.call('dispatch', event);
  parent.assertImmediate(
    utterance,
    `dispatch:${event.type}:${event.id ?? event.route}`,
  );
  for (const boundary of ['save', 'schedule', 'tone'])
    if (parent.trace.includes(boundary))
      assert.ok(parent.trace.indexOf('stop') < parent.trace.indexOf(boundary));
  parent.syncReader();
  assert.equal(parent.test.state.spoken.length, 1);
  parent.test.unmount();
}
const noProgress = parentFixture();
const uninterrupted = noProgress.read();
noProgress.call('dispatch', { type: 'interact', id: 'not-a-hotspot' });
assert.equal(
  typeof uninterrupted.onend,
  'function',
  'Ignored actions do not interrupt the current guide',
);
assert.equal(noProgress.trace.includes('stop'), false);
noProgress.test.unmount();

for (const route of ['river', 'garden'])
  for (const outcome of ['open', 'leave', 'error']) {
    const parent = parentFixture(readyCraft(route));
    const utterance = parent.read();
    const pending = parent.call(
      'handleInteraction',
      route === 'river' ? 'river-bridge' : 'garden-water',
    );
    assert.equal(
      parent.waits.length,
      1,
      'Actual toy entry awaits durable progress',
    );
    parent.assertImmediate(
      utterance,
      `${route} toy entry before deferred flush`,
    );
    assert.ok(parent.trace.indexOf('stop') < parent.trace.indexOf('flush'));
    assert.equal(
      parent.bindings.toybox,
      null,
      'Reading stops before the delayed toy dialog opens',
    );
    if (outcome === 'leave') parent.call('openSettings');
    if (outcome === 'error')
      parent.waits[0].reject(new Error('Storage unavailable'));
    else parent.waits[0].resolve();
    await pending;
    assert.equal(Boolean(parent.bindings.toybox), outcome === 'open');
    parent.syncReader();
    assert.equal(
      parent.test.state.spoken.length,
      1,
      'Late toy completion/failure never restarts narration',
    );
    if (outcome === 'open')
      assert.equal(parent.test.button().props.disabled, true);
    parent.test.unmount();
  }

// Memory-only negative control reproduces the original missing immediate stop:
// suspended cannot help until the pending save resolves and the toybox opens.
const missingToyStop = experienceSource.replace(
  /if \(kind\) \{\r?\n\s+forestReader\.current\?\.stop\(\);/,
  'if (kind) {',
);
assert.notEqual(missingToyStop, experienceSource);
const delayedStop = parentFixture(readyCraft(), parentAst(missingToyStop));
const delayedUtterance = delayedStop.read();
const delayedEntry = delayedStop.call('handleInteraction', 'river-bridge');
assert.equal(
  typeof delayedUtterance.onend,
  'function',
  'Negative control: reading leaks across pending toy entry',
);
assert.equal(delayedStop.test.state.active.size, 1);
delayedStop.waits[0].resolve();
await delayedEntry;
delayedStop.syncReader();
assert.equal(
  delayedUtterance.onend,
  null,
  'Only the eventual toybox effect stopped this faulty variant',
);
delayedStop.test.unmount();

const css = readFileSync('app/forest-narration-reader.css', 'utf8');
assert.match(css, /min-height:\s*44px/);
assert.match(css, /min-width:\s*44px/);
assert.match(css, /:focus-visible/);
assert.doesNotMatch(
  readerSource,
  /fetch\(|setTimeout\(|setInterval\(|requestAnimationFrame\(/,
);

// The new tests must actually detect the two dangerous implementation regressions.
const noRevisionStop = readerSource.replace(
  '[text, revisionKey, suspended, stop]',
  '[text, suspended, stop]',
);
assert.notEqual(noRevisionStop, readerSource);
const negativeRevision = fixture({}, noRevisionStop);
negativeRevision.click();
negativeRevision.update({ revisionKey: 'advanced-with-same-words' });
assert.equal(
  negativeRevision.button().props['aria-pressed'],
  true,
  'Negative control: missing revision dependency reproduces stale narration',
);
negativeRevision.unmount();
const stateInsteadOfRef = readerSource.replace(
  'if (speech.current) {',
  'if (speaking) {',
);
assert.notEqual(stateInsteadOfRef, readerSource);
const negativeRapid = fixture({}, stateInsteadOfRef);
const staleClick = negativeRapid.button().props.onClick;
staleClick();
staleClick();
assert.equal(
  negativeRapid.state.spoken.length,
  2,
  'Negative control: state-only guard reproduces duplicate queued speech',
);
negativeRapid.unmount();
lifecycle.unmount();
console.log(
  `PASS forest narration: ${composed} actual age/route story views; ${parentCases} actual parent JSX/action cases; full reader hooks, local-only voices, explicit-only start, lifecycle/stale/rapid errors and real book handoff. No real audio or network.`,
);
