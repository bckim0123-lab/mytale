import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync('app/page.tsx', 'utf8');
const ast = ts.createSourceFile(
  'page.tsx',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
function find(predicate) {
  const found = [];
  function visit(node) {
    if (predicate(node)) found.push(node);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return found;
}
function evaluate(code, bindings) {
  return runInNewContext(
    ts.transpileModule(code, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.React,
      },
    }).outputText,
    { Blob, AbortController, DOMException, ...bindings },
  );
}
function arrow(name, bindings) {
  const node = find(
    (node) => ts.isVariableDeclaration(node) && node.name.getText(ast) === name,
  )[0];
  assert.ok(node?.initializer, `Actual ${name} handler exists`);
  return evaluate(`(${node.initializer.getText(ast)})`, bindings);
}
function effect(needle, bindings) {
  const node = find(
    (node) =>
      ts.isCallExpression(node) &&
      node.expression.getText(ast) === 'useEffect' &&
      node.arguments[0]?.getText(ast).includes(needle),
  )[0];
  assert.ok(node, `Actual effect ${needle} exists`);
  return evaluate(`(${node.arguments[0].getText(ast)})`, bindings)();
}
function fixture(results = ['approved-2d', '', 'approved-3d'], books = []) {
  const state = {
    generated: results,
    savedStorybooks: books,
    image: 'original-source',
    generationStatuses: ['ready', 'unrequested', 'ready'],
  };
  const readers = [],
    decoders = [];
  const setters = Object.fromEntries(
    [...source.matchAll(/\b(set[A-Z][A-Za-z0-9]*)\(/g)].map(([, name]) => [
      name,
      (value) => {
        const key = name[3].toLowerCase() + name.slice(4);
        state[key] = typeof value === 'function' ? value(state[key]) : value;
      },
    ]),
  );
  class Reader {
    readyState = 0;
    result = null;
    constructor() {
      readers.push(this);
    }
    readAsDataURL(file) {
      this.readyState = 1;
      this.file = file;
    }
    abort() {
      this.readyState = 2;
    }
    complete() {
      this.readyState = 2;
      this.result = `decoded:${this.file.name}`;
      this.onload?.();
    }
  }
  class DecodedImage {
    width = 120;
    height = 100;
    constructor() {
      decoders.push(this);
    }
  }
  const bindings = {
    ...setters,
    generated: results,
    savedStorybooks: books,
    image: state.image,
    characterInput: {
      current: {
        consent: true,
        uploadEpoch: 0,
        reading: false,
        reader: null,
        decoder: null,
        retryUntil: 0,
      },
    },
    drawingReplacement: { current: null },
    generationRequest: { current: new AbortController() },
    generationRun: { current: 0 },
    chatRequest: { current: new AbortController() },
    reviewTickets: { current: {} },
    FileReader: Reader,
    Image: DecodedImage,
    preferredStyle: 2,
    defaultPersona: { name: '별콩' },
    imageInputLimitError: () => null,
    createLocalCharacterPreview: (image) => ({
      image: `preview:${image.src}`,
      cutout: true,
    }),
    document: {
      createElement: () => {
        const canvas = { width: 0, height: 0 };
        canvas.getContext = () => ({
          fillRect() {},
          drawImage(image) {
            canvas.source = image.src;
          },
        });
        canvas.toDataURL = () => `prepared:${canvas.source}`;
        return canvas;
      },
    },
    // Confirmation may not secretly save or request another image.
    keepDrawingAsset: () => assert.fail('No automatic storage'),
    requestVariant: () => assert.fail('No automatic generation'),
    fetch: () => assert.fail('No external request'),
    persistCompanionSave: () => assert.fail('No automatic record storage'),
    clearDrawingAssets: () => assert.fail('Do not delete kept artwork'),
    clearCompanionSave: () => assert.fail('Do not delete the durable library'),
    downloadLocalFile: () => assert.fail('No automatic export'),
    stopPageSpeech: () => {},
  };
  for (const name of [
    'cancelImagePreparation',
    'offerDrawingReplacement',
    'confirmDrawingReplacement',
    'getCharacterRetryRemainingSeconds',
    'updatePhotoConsent',
    'openLatestIllustratedBook',
    'load',
  ])
    bindings[name] = (...args) => arrow(name, bindings)(...args);
  return {
    state,
    bindings,
    readers,
    decoders,
    prepare(name = 'new.png', practice = false) {
      bindings.load({ name, size: 1000, type: 'image/png' }, practice);
      readers.at(-1).complete();
      decoders.at(-1).onload();
    },
  };
}

// A validated candidate never destroys approved work until explicit confirmation.
for (const practice of [false, true]) {
  const test = fixture();
  const before = [...test.state.generated];
  test.prepare(practice ? 'practice.webp' : 'camera.jpg', practice);
  assert.equal(test.state.drawingReplacementOpen, true);
  assert.deepEqual(test.state.generated, before);
  assert.equal(test.state.image, 'original-source');
  assert.equal(test.bindings.characterInput.current.reading, false);
  test.bindings.confirmDrawingReplacement();
  assert.equal(test.state.generated.length, 0);
  assert.equal(test.state.practiceDrawing, practice);
  assert.match(test.state.image, /^prepared:/);
  assert.equal(test.bindings.drawingReplacement.current, null);
  const accepted = test.state.image;
  test.bindings.confirmDrawingReplacement();
  assert.equal(test.state.image, accepted, 'Repeated confirmation is a no-op');
}
{
  const test = fixture([]);
  test.prepare();
  assert.equal(test.state.drawingReplacementOpen, false);
  assert.match(
    test.state.image,
    /^prepared:/,
    'A first source needs no replacement prompt',
  );
}

// Local-preview books need the same protection even if no AI image ever passed.
// Preserve exact snapshots so the existing explicit archive handler can locate
// the book by its original pages reference, rather than manufacturing a new one.
const localBooks = [
  {
    id: 'older-local-book',
    title: '바다에서 만난 친구',
    pages: [{ title: '첫 모험', body: '함께 헤엄쳤어요.' }],
    image: 'original-ocean-preview',
    theme: 1,
    trail: [{ trait: 'kindness' }],
    imageSource: 'local',
  },
  {
    id: 'latest-local-book',
    title: '하늘에서 쓴 이야기',
    pages: [{ title: '두 번째 모험', body: '같이 구름을 건넜어요.' }],
    image: 'original-cloud-preview',
    theme: 2,
    trail: [{ trait: 'courage' }],
    imageSource: 'local',
  },
];
for (const action of ['cancel', 'view', 'replace']) {
  const test = fixture([], localBooks);
  const pendingFriend = { png: 'previous-reviewed-handoff', name: '이전 친구' };
  test.state.companionArtwork = pendingFriend;
  test.prepare('new-source.png');
  assert.equal(
    test.state.drawingReplacementOpen,
    true,
    'A local-only book also requires confirmation',
  );
  assert.equal(test.state.savedStorybooks, localBooks);
  assert.equal(
    test.state.companionArtwork,
    pendingFriend,
    'Preparing a replacement is not accepting it',
  );
  if (action === 'cancel') test.bindings.cancelImagePreparation();
  if (action === 'view') {
    const staleApply = test.bindings.drawingReplacement.current.apply;
    test.bindings.openLatestIllustratedBook();
    staleApply();
    assert.equal(test.state.step, 'book');
    assert.equal(test.state.storybook, localBooks[1].pages);
    assert.equal(test.state.storybookImage, localBooks[1].image);
    assert.equal(test.state.storybookTheme, localBooks[1].theme);
    assert.equal(test.state.adventureTrail, localBooks[1].trail);
    assert.equal(test.state.page, 0);
    assert.match(test.state.bookArchiveStatus, /책장에 보관하기/);
  }
  if (action === 'replace') {
    test.bindings.confirmDrawingReplacement();
    assert.equal(test.state.savedStorybooks.length, 0);
    assert.equal(
      test.state.companionArtwork,
      null,
      'Only accepted replacement clears the old pending handoff',
    );
    assert.match(test.state.image, /new-source/);
  } else {
    assert.equal(
      test.state.savedStorybooks,
      localBooks,
      `${action} preserves every local book`,
    );
    assert.equal(test.state.image, 'original-source');
    assert.equal(test.state.companionArtwork, pendingFriend);
  }
}
{
  const test = fixture([], []);
  const before = structuredClone(test.state);
  test.bindings.openLatestIllustratedBook();
  assert.deepEqual(
    test.state,
    before,
    'An empty book list cannot open a made-up book',
  );
}
{
  const test = fixture([], localBooks);
  test.prepare('pending-before-reset.png');
  const staleApply = test.bindings.drawingReplacement.current.apply;
  test.state.companionArtwork = {
    png: 'pending-before-reset',
    name: '이전 친구',
  };
  arrow('reset', {
    ...test.bindings,
    closeCamera: () => {},
    resetAdventureGame: () => {},
    colorChoices: [{ value: 'original' }],
    focusChoices: ['source'],
    genderChoices: ['none'],
    moodChoices: [{ name: 'calm' }],
    worldChoices: [{ name: 'forest' }],
  })();
  assert.equal(test.state.companionArtwork, null);
  assert.equal(test.state.generated.length, 0);
  assert.equal(test.state.savedStorybooks.length, 0);
  assert.equal(test.state.image, null);
  assert.equal(test.bindings.drawingReplacement.current, null);
  assert.equal(test.bindings.characterInput.current.consent, false);
  staleApply();
  test.bindings.confirmDrawingReplacement();
  assert.equal(
    test.state.companionArtwork,
    null,
    'Late source work cannot revive a session-cleared friend',
  );
  assert.equal(test.state.image, null);
}
{
  const test = fixture();
  test.prepare('old-candidate.png');
  const staleApply = test.bindings.drawingReplacement.current.apply;
  test.prepare('latest-candidate.png');
  test.bindings.confirmDrawingReplacement();
  const newHandoff = { png: 'new-reviewed-friend', name: '새 친구' };
  test.state.companionArtwork = newHandoff;
  staleApply();
  assert.equal(
    test.state.companionArtwork,
    newHandoff,
    'An old candidate cannot clear a newer pending handoff',
  );
}

// The actual conditional dialog never offers a dead friend action for a
// book-only session, and offers both destinations when both kinds exist.
const replacementDialogNode = find(
  (node) =>
    ts.isJsxElement(node) &&
    node.openingElement.tagName.getText(ast) === 'dialog' &&
    node.getText(ast).includes('drawing-replacement-dialog'),
)[0];
assert.ok(replacementDialogNode);
for (const kinds of ['friend', 'book', 'both']) {
  const calls = [];
  const dialog = evaluate(`(${replacementDialogNode.getText(ast)})`, {
    React: {
      createElement: (type, props, ...children) => ({ type, props, children }),
    },
    drawingReplacementDialog: { current: null },
    generated: kinds === 'book' ? [] : ['approved'],
    savedStorybooks: kinds === 'friend' ? [] : localBooks,
    cancelImagePreparation: () => calls.push('cancel'),
    openCompletedCharacter: () => calls.push('friend'),
    openLatestIllustratedBook: () => calls.push('book'),
    confirmDrawingReplacement: () => calls.push('replace'),
  });
  const labels = buttons(dialog).map(textOf);
  assert.equal(
    labels.some((label) => label.includes('완성 친구 보러')),
    kinds !== 'book',
  );
  assert.equal(
    labels.some((label) => label.includes('만든 책 보러')),
    kinds !== 'friend',
  );
  if (kinds !== 'friend') {
    buttons(dialog)
      .find((button) => textOf(button).includes('만든 책 보러'))
      .props.onClick();
    assert.deepEqual(calls, ['book']);
    assert.match(textOf(dialog), /책 목록/);
  }
}
for (const failure of ['type', 'size', 'header', 'decode', 'canvas']) {
  const test = fixture();
  if (failure === 'header')
    test.bindings.imageInputLimitError = () => 'too many pixels';
  if (failure === 'canvas')
    test.bindings.document.createElement = () => ({ getContext: () => null });
  test.bindings.load({
    name: failure === 'type' ? 'bad.txt' : 'bad.png',
    type: failure === 'type' ? 'text/plain' : 'image/png',
    size: failure === 'size' ? 9 * 1024 * 1024 : 1000,
  });
  test.readers[0]?.complete();
  if (test.decoders[0]) {
    if (failure === 'decode') test.decoders[0].onerror();
    else test.decoders[0].onload();
  }
  assert.equal(
    test.state.drawingReplacementOpen,
    false,
    `${failure} does not ask for replacement`,
  );
  assert.equal(test.state.generated.length, 3);
  assert.equal(test.state.image, 'original-source');
  assert.ok(test.state.uploadError);
}
for (const action of ['cancel', 'withdraw', 'leave', 'unmount']) {
  const test = fixture();
  test.prepare('A.png');
  const staleApply = test.bindings.drawingReplacement.current.apply;
  if (action === 'withdraw') test.bindings.updatePhotoConsent(false);
  else if (action === 'leave')
    effect("step !== 'upload'", {
      ...test.bindings,
      step: 'welcome',
      cameraStream: { current: null },
      cameraRequest: { current: 0 },
      queueMicrotask: (callback) => callback(),
    });
  else if (action === 'unmount')
    effect('cameraStream.current?.getTracks()', {
      ...test.bindings,
      cameraStream: { current: null },
    })();
  else test.bindings.cancelImagePreparation();
  assert.equal(test.bindings.drawingReplacement.current, null);
  test.bindings.confirmDrawingReplacement();
  staleApply();
  assert.equal(
    test.state.generated.length,
    3,
    `${action} preserves approved images`,
  );
  assert.equal(
    test.state.image,
    'original-source',
    `${action} prevents stale prepared-image commits`,
  );
}
{
  const test = fixture();
  test.prepare('A.png');
  const oldApply = test.bindings.drawingReplacement.current.apply;
  test.prepare('B.png');
  oldApply();
  assert.equal(test.state.image, 'original-source');
  test.bindings.confirmDrawingReplacement();
  assert.equal(
    test.state.image,
    'prepared:decoded:B.png',
    'Only the latest offered file can replace the source',
  );
}
{
  const test = fixture();
  test.bindings.load({ name: 'slow-A.png', type: 'image/png', size: 100 });
  test.readers[0].complete();
  const oldDecode = test.decoders[0].onload;
  test.prepare('B.png');
  oldDecode();
  test.bindings.confirmDrawingReplacement();
  assert.equal(
    test.state.image,
    'prepared:decoded:B.png',
    'Late decode cannot replace the current confirmation',
  );
}
{
  const test = fixture();
  test.prepare('A.png');
  test.bindings.load({ name: 'bad.txt', type: 'text/plain', size: 100 });
  test.bindings.confirmDrawingReplacement();
  assert.equal(
    test.state.image,
    'original-source',
    'Invalid later input also invalidates the previous pending confirmation',
  );
}

// Native modal provides tab containment. Open on the safe cancel action, handle
// Escape without committing, and return focus without forcing disconnected UI.
{
  let focused = 0,
    returned = 0,
    opened = 0,
    closed = 0;
  class Element {
    isConnected = true;
    focus() {
      returned++;
    }
  }
  const previous = new Element();
  const dialog = {
    open: false,
    showModal() {
      this.open = true;
      opened++;
    },
    close() {
      this.open = false;
      closed++;
    },
    querySelector: (selector) => {
      assert.equal(selector, '[data-replacement-cancel]');
      return {
        focus() {
          focused++;
        },
      };
    },
  };
  const cleanup = effect('const dialog = drawingReplacementDialog.current', {
    drawingReplacementOpen: true,
    drawingReplacementDialog: { current: dialog },
    document: { activeElement: previous },
    HTMLElement: Element,
  });
  assert.equal(opened, 1);
  assert.equal(focused, 1);
  cleanup();
  assert.equal(closed, 1);
  assert.equal(returned, 1);
  const cancel = find(
    (node) => ts.isJsxAttribute(node) && node.name.getText(ast) === 'onCancel',
  )[0];
  const test = fixture();
  test.prepare();
  let prevented = false;
  evaluate(
    `(${cancel.initializer.expression.getText(ast)})`,
    test.bindings,
  )({
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(test.bindings.drawingReplacement.current, null);
  assert.equal(test.state.generated.length, 3);
}

// Render the actual companion return. The scene stays at the same React child
// position in every phase; status CTA only changes view, never invokes an API.
const branch = find(
  (node) =>
    ts.isIfStatement(node) &&
    node.expression.getText(ast) === "step === 'companion'",
)[0];
const companionCode = `function render(){${branch.getText(ast)};return null;} render();`;
function textOf(node) {
  if (typeof node === 'string') return node;
  if (!node || typeof node !== 'object') return '';
  return (node.children ?? []).map(textOf).join(' ');
}
function buttons(node) {
  if (!node || typeof node !== 'object') return [];
  return [
    ...(node.type === 'button' ? [node] : []),
    ...(node.children ?? []).flatMap(buttons),
  ];
}
const renderedNotices = new Map();
for (const phase of [
  'generating',
  'reviewing',
  'complete',
  'failed',
  'dismissed',
]) {
  const views = [];
  const dismiss = [];
  const scope = {
    React: {
      Fragment: 'fragment',
      createElement: (type, props, ...children) => ({ type, props, children }),
    },
    CompanionExperience: 'CompanionExperience',
    step: 'companion',
    generating: phase === 'generating',
    generationBusy: phase === 'generating' || phase === 'reviewing',
    generationReviewOnly: phase === 'reviewing',
    generationFailed: phase === 'failed',
    generationFailureDismissed: phase === 'dismissed',
    arrivalDismissed: phase === 'dismissed',
    generated: ['', '', 'approved-result'],
    selectedHasAiCharacter: false,
    chosenImage: 'source-preview',
    visibleGenerationPhaseLabel:
      '투명 배경, 원본의 특징과 귀여움을 검사하고 있어요',
    guardianVerified: true,
    photoConsent: true,
    image: 'source',
    age: '7–9세',
    companionArtwork: null,
    acknowledgeCompanionArtwork: () => {},
    setStep: (step) => views.push(step),
    openGenerationView: () => views.push('character'),
    openCompletedCharacter: () => views.push('completed'),
    setArrivalDismissed: (value) => dismiss.push(value),
    setGenerationFailureDismissed: (value) => dismiss.push(value),
  };
  const tree = evaluate(companionCode, scope);
  assert.equal(
    tree.children[1].type,
    'CompanionExperience',
    'Scene position must remain stable across status changes',
  );
  if (phase === 'dismissed') {
    assert.equal(tree.children[0], false);
    continue;
  }
  const notice = tree.children[0];
  renderedNotices.set(phase, notice);
  assert.equal(notice.type, 'aside');
  const actions = buttons(notice);
  assert.ok(actions.length);
  actions[0].props.onClick();
  assert.deepEqual(views, [phase === 'complete' ? 'completed' : 'character']);
  assert.match(
    textOf(notice),
    phase === 'failed'
      ? /문제 확인/
      : phase === 'complete'
        ? /완성 친구 보기/
        : /진행 보기/,
  );
  if (phase === 'reviewing') assert.match(textOf(notice), /검사를 이어가/);
  if (actions[1]) {
    actions[1].props.onClick();
    assert.deepEqual(dismiss, [true, true]);
  }
}
for (const selected of [0, 2]) {
  const picks = [],
    steps = [],
    dismiss = [];
  arrow('openCompletedCharacter', {
    generated: ['', '', 'approved'],
    pick: selected,
    setPick: (value) => picks.push(value),
    setArrivalDismissed: (value) => dismiss.push(value),
    openGenerationView: () => steps.push('character'),
  })();
  assert.deepEqual(picks, [2]);
  assert.deepEqual(steps, ['character']);
  assert.deepEqual(dismiss, [true]);
}
{
  const picks = [];
  arrow('openCompletedCharacter', {
    generated: [],
    pick: 2,
    setPick: (value) => picks.push(value),
    setArrivalDismissed: () => assert.fail(),
    openGenerationView: () => assert.fail(),
  })();
  assert.equal(picks.length, 0);
}
const css = readFileSync('app/character-result-recovery.css', 'utf8');
assert.match(css, /min-height: 44px/);
assert.match(css, /calc\(100vw - 24px\)/);
assert.match(css, /flex-wrap: wrap/);
assert.match(source, /aria-labelledby="drawing-replacement-title"/);
console.log(
  'Character result recovery passed: actual companion render and view-only actions, friend/local-book replacement protection, exact latest-book recovery, pending-handoff reset/source cleanup, stale-candidate/consent/navigation/unmount guards, no automatic save/generation, native-dialog focus/Escape and 320px layout contracts.',
);

// Optional, isolated visual fixture. This serializes the very JSX exercised
// above; no app component, storage record or provider request runs in the page.
if (process.argv.includes('--write-fixture')) {
  const escape = (value) =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  function html(node) {
    if (typeof node === 'string') return escape(node);
    if (typeof node === 'number') return `${node}`;
    if (!node || typeof node !== 'object') return '';
    const attrs = Object.entries(node.props ?? {})
      .filter(
        ([key, value]) =>
          key !== 'ref' &&
          !key.startsWith('on') &&
          value !== false &&
          value !== undefined &&
          value !== null,
      )
      .map(([key, value]) => {
        const name = key === 'className' ? 'class' : key;
        assert.ok(
          typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean',
          'Fixture only serializes primitive JSX attributes',
        );
        return value === true ? ` ${name}` : ` ${name}="${escape(`${value}`)}"`;
      })
      .join('');
    const action =
      node.type === 'button'
        ? ` data-fixture-action="${escape(textOf(node).trim())}"`
        : '';
    return `<${node.type}${attrs}${action}>${(node.children ?? []).map(html).join('')}</${node.type}>`;
  }
  const dialogNode = find(
    (node) =>
      ts.isJsxElement(node) &&
      node.openingElement.tagName.getText(ast) === 'dialog' &&
      node.getText(ast).includes('drawing-replacement-dialog'),
  )[0];
  assert.ok(dialogNode, 'Fixture uses the actual replacement dialog JSX');
  const dialog = evaluate(`(${dialogNode.getText(ast)})`, {
    React: {
      createElement: (type, props, ...children) => ({ type, props, children }),
    },
    drawingReplacementDialog: { current: null },
    generated: ['synthetic-approved-friend'],
    savedStorybooks: [{ id: 'synthetic-book' }],
    cancelImagePreparation: () => {},
    openCompletedCharacter: () => {},
    openLatestIllustratedBook: () => {},
    confirmDrawingReplacement: () => {},
  });
  const globals = readFileSync('app/globals.css', 'utf8').replace(
    /^@import[^;]+;\s*/gm,
    '',
  );
  const companionCss = readFileSync('app/companion.css', 'utf8');
  const frameStyles = `${globals}\n${companionCss}\n${css}\nbody{font-family:system-ui,sans-serif}.fixture-info{padding:12px;font:13px/1.6 system-ui,sans-serif;color:#435948;background:#fff9df}.fixture-playground{min-height:1150px;padding:16px;background:linear-gradient(#eef4e4,#fff3cf);font:14px/1.7 system-ui,sans-serif}.fixture-output{display:block;margin:12px 0;padding:10px;background:white;border:1px solid #d6dfce;overflow-wrap:anywhere}.fixture-open,.fixture-focus-after{min-height:44px;margin:8px;padding:10px 14px;border:1px solid #427256;border-radius:10px;background:white;color:#315b43;font:14px system-ui,sans-serif}.fixture-footer{margin-top:860px}.fixture-dialog-shell{padding:18px 12px;min-height:650px}.fixture-header svg{width:18px;height:18px}.fixture-header .cw-icon{font-size:18px}`;
  const header = `<header class="cw-header fixture-header"><button class="cw-brand" data-fixture-action="그림친구 처음으로"><span>✦</span>그림친구<small>작은 상상이 사는 곳</small></button><nav aria-label="친구 메뉴"><button class="is-active" data-fixture-action="친구의 집"><svg aria-hidden="true" viewBox="0 0 20 20"><path d="M3 10L10 3L17 10V17H3Z" fill="none" stroke="currentColor"/></svg>친구의 집</button><button data-fixture-action="달빛 숲"><svg aria-hidden="true" viewBox="0 0 20 20"><path d="M10 3L3 14H17ZM10 14V19" fill="none" stroke="currentColor"/></svg>달빛 숲</button></nav><button class="cw-icon" aria-label="보호자와 함께 보기" data-fixture-action="보호자와 함께 보기">⚙</button></header>`;
  const behavior = `
    const output=document.querySelector('[data-fixture-output]');
    const metrics=document.querySelector('[data-fixture-metrics]');
    const dialog=document.querySelector('dialog');
    const opener=document.querySelector('[data-fixture-open]');
    function report(action){output.textContent='합성 동작: '+action+' — 실제 데이터 변경 없음';}
    function closeDialog(action){report(action);if(dialog?.open)dialog.close();opener?.focus();}
    for(const button of document.querySelectorAll('[data-fixture-action]')) button.addEventListener('click',()=>{
      const action=button.getAttribute('data-fixture-action');
      if(dialog?.contains(button))closeDialog(action);else report(action);
    });
    opener?.addEventListener('click',()=>{dialog.showModal();dialog.querySelector('[data-replacement-cancel]')?.focus();report('확인창 열기');});
    dialog?.addEventListener('cancel',event=>{event.preventDefault();closeDialog('취소 · Esc');});
    function measure(){metrics.textContent='iframe 폭 '+innerWidth+'px · 문서 폭 '+document.documentElement.scrollWidth+'px · 가로 넘침 '+(document.documentElement.scrollWidth>innerWidth?'있음':'없음');}
    addEventListener('resize',measure);measure();
  `;
  function documentFor(content, isDialog = false) {
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; img-src data:"><style>${frameStyles}</style></head><body>${isDialog ? `<main class="app fixture-dialog-shell"><p class="fixture-info">합성 교체 확인창 · 실제 그림 없음</p>${content}<button type="button" class="fixture-open" data-fixture-open>확인창 열기</button><button type="button" class="fixture-focus-after" data-fixture-action="확인창 밖 다음 버튼">확인창 밖 다음 버튼</button><output class="fixture-output" data-fixture-output>버튼을 누르면 동작명만 표시해요.</output><output class="fixture-output" data-fixture-metrics></output></main>` : `${content}<main class="cw-app">${header}<section class="fixture-playground"><p>합성 모험 자리입니다. 실제 게임·친구·책은 열지 않아요.</p><output class="fixture-output" data-fixture-output>생성 소식 버튼과 내비게이션은 동작명만 표시해요.</output><output class="fixture-output" data-fixture-metrics></output><p>아래로 스크롤해 알림과 헤더의 겹침을 확인하세요.</p><p class="fixture-footer">스크롤 끝 · 위 메뉴를 가리는 영역이 있는지 확인</p><button class="fixture-focus-after" data-fixture-action="맨 아래 검수 버튼">맨 아래 검수 버튼</button></section></main>`}<script>${behavior}</script></body></html>`;
  }
  const frames = [
    ['생성 중', documentFor(html(renderedNotices.get('generating')))],
    ['완료', documentFor(html(renderedNotices.get('complete')))],
    ['실패', documentFor(html(renderedNotices.get('failed')))],
    ['새 그림 교체 확인', documentFor(html(dialog), true)],
  ];
  const page = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>그림친구 · 합성 320px 회복 흐름 검수</title><style>body{margin:0;padding:24px;background:#e9ece7;color:#263d30;font:15px/1.6 system-ui,sans-serif}h1{font-size:24px}h2{font-size:18px}main{display:grid;grid-template-columns:repeat(auto-fit,320px);gap:24px}iframe{display:block;width:320px;height:660px;border:0;outline:1px solid #849c8c;background:white}section{width:320px}code{font-size:13px}p{max-width:1000px}</style></head><body><h1>합성 검수: 캐릭터 생성 결과 보호</h1><p>실제 서비스 데이터·저장소·유료 API를 사용하지 않습니다. 현재 JSX와 일반 CSS, companion CSS, recovery CSS를 복사한 독립 화면입니다. 각 iframe의 실제 뷰포트는 320px입니다. 생성 소식 버튼은 동작명만 기록합니다. 교체 확인창은 ‘확인창 열기’를 직접 눌러 Esc·Tab 순환·닫은 뒤 초점 복귀를 확인하세요. iframe은 저장소 접근 불가 sandbox이며 네트워크 요청을 차단합니다.</p><main>${frames.map(([label, doc]) => `<section><h2>${label}</h2><iframe title="합성 320px 검수 · ${label}" sandbox="allow-scripts" srcdoc="${escape(doc)}"></iframe></section>`).join('')}</main></body></html>`;
  const outputDirectory = resolve('outputs');
  const outputFile = resolve(
    outputDirectory,
    'character-result-recovery-qa.html',
  );
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputFile, page, 'utf8');
  console.log(`Synthetic visual fixture written: ${outputFile}`);
}
