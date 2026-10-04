import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const compile = (code) =>
  ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
function functions(file, names) {
  const source = readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const found = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text))
      found.push(node.getText(ast));
    if (
      ts.isVariableDeclaration(node) &&
      names.includes(node.name.getText(ast))
    )
      found.push(`const ${node.getText(ast)};`);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(found.length, names.length);
  return compile(`${found.join('\n')}\n({ ${names.join(',')} });`);
}
const helper = compile(readFileSync('app/local-speech.ts', 'utf8'));
const pageCode = functions('app/page.tsx', [
  'stopPageSpeech',
  'readLocalText',
  'toggleReadAloud',
  'speakAdventureGuide',
]);
const bookCode = functions('app/companion-storybook.tsx', [
  'stopSpeech',
  'readPage',
]);
const local = { name: 'Local Korean', lang: 'ko-KR', localService: true };
const remote = { name: 'Remote Korean', lang: 'ko-KR', localService: false };
function fixture(options = {}) {
  const state = {
    voices: options.voices ?? [remote, local],
    spoken: [],
    cancels: 0,
    notice: '',
  };
  const synthesis = {
    getVoices: () => {
      if (options.voicesThrow) throw new Error('device');
      return state.voices;
    },
    cancel: () => {
      state.cancels++;
      if (options.cancelThrow) throw new Error('device');
    },
    speak: (utterance) => {
      if (options.speakThrow) throw new Error('device');
      state.spoken.push(utterance);
    },
  };
  class Utterance {
    constructor(text) {
      if (options.constructorThrow) throw new Error('device');
      this.text = text;
    }
  }
  const window = options.noApi
    ? {}
    : { speechSynthesis: synthesis, SpeechSynthesisUtterance: Utterance };
  const exports = {};
  runInNewContext(helper, { window, exports });
  const speech = { current: null };
  const context = {
    ...exports,
    window,
    SpeechSynthesisUtterance: Utterance,
    activeSpeech: speech,
    speech,
    age: '4–6세',
    readingAloud: false,
    adventureSpeaking: false,
    speaking: false,
    currentStoryPage: { title: '내 이름', body: '우리 모험', quote: '안녕' },
    book: { pages: ['함께 쓴 이야기'] },
    activePage: 0,
    storybookChapterTitle: () => '우리 책',
    setReadingAloud: (value) => {
      context.readingAloud = value;
    },
    setAdventureSpeaking: (value) => {
      context.adventureSpeaking = value;
    },
    setSpeaking: (value) => {
      context.speaking = value;
    },
    setSpeechNotice: (value) => {
      state.notice = value;
    },
    setSpeechError: (value) => {
      state.notice = value;
    },
    setSpeechAvailable: (value) => {
      state.available = value;
    },
  };
  return {
    state,
    speech,
    context,
    helpers: exports,
    page: runInNewContext(pageCode, context),
    book: runInNewContext(bookCode, context),
  };
}
for (const path of ['legacy-book', 'guide', 'saved-book']) {
  const play = (test) =>
    path === 'legacy-book'
      ? test.page.toggleReadAloud()
      : path === 'guide'
        ? test.page.speakAdventureGuide('아이의 모험 안내')
        : test.book.readPage();
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
    play(test);
    assert.equal(
      test.state.spoken.length,
      0,
      `${path}: no default/remote voice fallback`,
    );
    assert.equal(test.state.notice, test.helpers.LOCAL_SPEECH_UNAVAILABLE);
    assert.equal(test.speech.current, null);
  }
  for (const option of ['speakThrow', 'constructorThrow']) {
    const test = fixture({ [option]: true });
    play(test);
    assert.equal(test.state.spoken.length, 0);
    assert.equal(test.speech.current, null);
    assert.equal(
      test.context.readingAloud ||
        test.context.adventureSpeaking ||
        test.context.speaking,
      false,
    );
    assert.match(test.state.notice, /읽어 주기를 시작하지 못했어요/);
  }
  const test = fixture();
  play(test);
  const first = test.state.spoken[0];
  assert.equal(first.voice, local, `${path}: skip remote listed first`);
  assert.equal(first.lang, 'ko-KR');
  const staleEnd = first.onend,
    staleError = first.onerror;
  play(test);
  assert.equal(test.speech.current, null);
  assert.equal(first.onend, null);
  assert.equal(first.onerror, null);
  play(test);
  const second = test.speech.current;
  staleEnd();
  staleError({ error: 'network' });
  assert.equal(
    test.speech.current,
    second,
    `${path}: stale callbacks cannot stop new reading`,
  );
  assert.equal(test.state.notice, '');
  second.onerror({ error: 'audio-busy' });
  assert.equal(test.speech.current, null);
  test.state.voices = [remote];
  play(test);
  assert.equal(
    test.state.spoken.length,
    2,
    `${path}: recheck voice at click time`,
  );
  assert.equal(test.state.notice, test.helpers.LOCAL_SPEECH_UNAVAILABLE);
}
const throwingCancel = fixture({ cancelThrow: true });
throwingCancel.page.toggleReadAloud();
assert.doesNotThrow(() => throwingCancel.page.stopPageSpeech());
assert.equal(throwingCancel.speech.current, null);
const exports = {};
runInNewContext(helper, { exports });
assert.equal(exports.localKoreanVoice(), null, 'SSR safe');
const pageSource = readFileSync('app/page.tsx', 'utf8');
assert.match(
  pageSource,
  /<Button onClick=\{\(\) => setStep\('companion'\)\}>\s*<Play \/> AI 없이/,
);
assert.match(pageSource, /active = false;\s*cancelLocalSpeech\(activeSpeech\)/);
assert.match(pageSource, /if \(!document.hidden\) return;\s*cancelLocalSpeech\(activeSpeech\)/);
const lifecycleAst = ts.createSourceFile(
  'page.tsx',
  pageSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let bookSwitch;
const actions = new Map();
function inspect(node) {
  if (
    ts.isArrowFunction(node) &&
    ts.isBlock(node.body) &&
    node.body.statements.some(
      (statement) =>
        statement.getText(lifecycleAst) === 'setStorybook(savedBook.pages);',
    )
  )
    bookSwitch = node;
  if (
    ts.isVariableDeclaration(node) &&
    ['finishSceneQuest', 'cancelPendingChoice'].includes(
      node.name.getText(lifecycleAst),
    )
  )
    actions.set(node.name.getText(lifecycleAst), node.initializer);
  ts.forEachChild(node, inspect);
}
inspect(lifecycleAst);
assert.ok(bookSwitch);
const switching = fixture();
switching.page.toggleReadAloud();
let displayed;
const switchBook = runInNewContext(
  compile(`(${bookSwitch.getText(lifecycleAst)});`),
  {
    stopPageSpeech: switching.page.stopPageSpeech,
    setSpeechNotice: () => {},
    savedBook: { pages: ['New book'], image: 'new', theme: 1, trail: [] },
    setStorybook: (pages) => {
      displayed = pages;
    },
    setStorybookImage: () => {},
    setStorybookTheme: () => {},
    setAdventureTrail: () => {},
    setPage: () => {},
    setBookDirection: () => {},
  },
);
switchBook();
assert.equal(displayed[0], 'New book');
assert.equal(switching.speech.current, null);
assert.equal(
  switching.state.cancels,
  1,
  'Switching books stops the old page even when step is unchanged',
);
assert.equal(actions.size, 2);
for (const [name, node] of actions)
  assert.equal(
    node.body.statements[0].getText(lifecycleAst),
    'stopPageSpeech();',
    `${name} stops source text before changing the scene`,
  );
console.log(
  'PASS all three local-only readers: remote/unavailable/stale/error/cancellation and honest offline-play entry. No real audio or network.',
);
