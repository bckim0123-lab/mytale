import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { withCharacterDeadline } from '../app/character-request-deadline.ts';
import { imageInputLimitError } from '../app/image-input-limits.ts';

const source = await readFile('app/page.tsx', 'utf8');
const ast = ts.createSourceFile(
  'page.tsx',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
function loadArrow(name, bindings) {
  let found;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name)
      found = node;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(found?.initializer, `actual handler ${name} exists`);
  const code = ts.transpileModule(`const ${found.getText(ast)};`, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  // oxlint-disable-next-line typescript/no-implied-eval -- Execute only this repository's parsed handler with offline browser doubles.
  return new Function(...Object.keys(bindings), `${code}\nreturn ${name};`)(
    ...Object.values(bindings),
  );
}

function loadJsxHandler(component, property, bindings) {
  let found;
  function visit(node) {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      node.tagName.getText(ast) === component
    ) {
      found = node.attributes.properties.find(
        (attribute) => attribute.name?.getText(ast) === property,
      )?.initializer?.expression;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(found, `${component}.${property} exists`);
  const code = ts.transpileModule(`const handler = ${found.getText(ast)};`, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  // oxlint-disable-next-line typescript/no-implied-eval -- Execute only the actual JSX callback with offline bindings.
  return new Function(...Object.keys(bindings), `${code}\nreturn handler;`)(
    ...Object.values(bindings),
  );
}
for (const component of ['CompanionExperience', 'CharacterWelcome']) {
  const property =
    component === 'CompanionExperience' ? 'onDrawing' : 'onCreate';
  for (const busy of [true, false]) {
    for (const consent of [true, false]) {
      const steps = [];
      loadJsxHandler(component, property, {
        generationBusy: busy,
        guardianVerified: true,
        photoConsent: consent,
        setStep: (step) => steps.push(step),
        openGenerationView: () => steps.push('character'),
      })();
      assert.deepEqual(
        steps,
        [busy ? 'character' : consent ? 'upload' : 'guardian'],
        'creation entries cannot expose editable tastes during an active request',
      );
    }
  }
}

for (const generated of [[], [null, 'approved-picture'], [null, null]]) {
  const steps = [];
  const before = [...generated];
  loadJsxHandler('CompanionExperience', 'onBack', {
    generated,
    setStep: (step) => steps.push(step),
  })();
  assert.deepEqual(steps, [generated.some(Boolean) ? 'character' : 'welcome']);
  assert.deepEqual(
    generated,
    before,
    'Returning from a failed scene preserves completed styles.',
  );
}

function createFixture() {
  const state = {
    image: 'previous-drawing',
    generated: ['previous-result'],
    generationStatuses: ['ready', 'generating'],
  };
  const readers = [],
    decoders = [];
  let now = 100_000;
  const characterInput = {
    current: {
      consent: true,
      uploadEpoch: 0,
      reading: false,
      reader: null,
      decoder: null,
      retryUntil: 0,
    },
  };
  class FakeReader {
    readyState = 0;
    result = null;
    aborted = false;
    constructor() {
      readers.push(this);
    }
    readAsDataURL(file) {
      this.readyState = 1;
      this.file = file;
    }
    abort() {
      this.aborted = true;
      this.readyState = 2;
    }
    complete() {
      this.readyState = 2;
      this.result = `decoded:${this.file.name}`;
      this.onload?.();
    }
  }
  class FakeImage {
    width = 120;
    height = 100;
    constructor() {
      decoders.push(this);
    }
  }
  const setters = Object.fromEntries(
    [...source.matchAll(/\b(set[A-Z][A-Za-z0-9]*)\(/g)].map((match) => [
      match[1],
      (value) => {
        const key = match[1].slice(3, 4).toLowerCase() + match[1].slice(4);
        state[key] = typeof value === 'function' ? value(state[key]) : value;
      },
    ]),
  );
  const bindings = {
    ...setters,
    characterInput,
    generationRequest: { current: new AbortController() },
    generationRun: { current: 1 },
    chatRequest: { current: new AbortController() },
    reviewTickets: { current: { 2: 'old-ticket' } },
    image: state.image,
    preferredStyle: 2,
    defaultPersona: { name: '친구' },
    Date: { now: () => now },
    FileReader: FakeReader,
    imageInputLimitError: () => null,
    Image: FakeImage,
    document: {
      createElement: () => {
        const canvas = { width: 0, height: 0 };
        canvas.getContext = () => ({
          fillRect() {},
          drawImage(image) {
            canvas.image = image.src;
          },
        });
        canvas.toDataURL = () => `prepared:${canvas.image}`;
        return canvas;
      },
    },
    createLocalCharacterPreview: (image, paper = false) => ({
      image: `preview:${paper}:${image.src}`,
      cutout: !paper,
    }),
  };
  bindings.cancelImagePreparation = loadArrow(
    'cancelImagePreparation',
    bindings,
  );
  bindings.getCharacterRetryRemainingSeconds = loadArrow(
    'getCharacterRetryRemainingSeconds',
    bindings,
  );
  bindings.ensureCharacterRequestAllowed = loadArrow(
    'ensureCharacterRequestAllowed',
    bindings,
  );
  bindings.updatePhotoConsent = loadArrow('updatePhotoConsent', bindings);
  bindings.load = loadArrow('load', bindings);
  return {
    state,
    bindings,
    readers,
    decoders,
    advance: (ms) => {
      now += ms;
    },
  };
}
const file = (name) => ({ name, type: 'image/png', size: 1000 });

{
  const fixture = createFixture();
  const tinyButHugePng = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(tinyButHugePng);
  tinyButHugePng.writeUInt32BE(13, 8);
  tinyButHugePng.write('IHDR', 12);
  tinyButHugePng.writeUInt32BE(30000, 16);
  tinyButHugePng.writeUInt32BE(30000, 20);
  const inputBindings = { ...fixture.bindings, imageInputLimitError };
  delete inputBindings.load;
  const load = loadArrow('load', inputBindings);
  load(file('huge.png'));
  fixture.readers[0].result = `data:image/png;base64,${tinyButHugePng.toString('base64')}`;
  fixture.readers[0].onload();
  assert.equal(
    fixture.decoders.length,
    0,
    'A tiny oversized header never creates Image or decoded pixels.',
  );
  assert.equal(fixture.state.image, 'previous-drawing');
  assert.deepEqual(fixture.state.generated, ['previous-result']);
  assert.match(fixture.state.uploadError, /이전 그림은 그대로/);
  assert.equal(fixture.state.preparingImage, false);
}

function leaveUpload(fixture) {
  let callback;
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(ast) === 'useEffect' &&
      node.arguments[0]
        ?.getText(ast)
        .includes("step !== 'upload' && characterInput.current.reading")
    )
      callback = node.arguments[0];
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(
    callback,
    'Leaving upload has an actual preparation-cancel effect.',
  );
  const bindings = {
    ...fixture.bindings,
    step: 'welcome',
    cameraStream: { current: null },
    cameraRequest: { current: 1 },
    queueMicrotask: (fn) => fn(),
  };
  const js = ts.transpileModule(`const effect = ${callback.getText(ast)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  // oxlint-disable-next-line typescript/no-implied-eval -- Execute this repository's actual effect with offline browser doubles.
  new Function(...Object.keys(bindings), `${js};effect();`)(
    ...Object.values(bindings),
  );
}

for (const phase of ['fetch', 'blob'])
  for (const action of ['cancel', 'upload', 'withdraw', 'navigate', 'camera']) {
    const sample = createFixture();
    let release;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const body = new Blob(['synthetic drawing'], { type: 'image/webp' });
    const response = {
      ok: true,
      blob: () => (phase === 'blob' ? pending : Promise.resolve(body)),
    };
    const start = loadArrow('loadPracticeDrawing', {
      ...sample.bindings,
      generating: false,
      regenerating: false,
      File,
      closeCamera: () => {},
      fetch: (url) => {
        assert.equal(
          url,
          '/practice-whale-drawing-v1.webp',
          'Practice loading never calls AI generation.',
        );
        return phase === 'fetch' ? pending : Promise.resolve(response);
      },
    });
    const work = start();
    await Promise.resolve();
    const transport = sample.bindings.characterInput.current.practiceRequest;
    if (action === 'cancel') sample.bindings.cancelImagePreparation();
    if (action === 'upload') sample.bindings.load(file('personal.png'));
    if (action === 'withdraw') sample.bindings.updatePhotoConsent(false);
    if (action === 'navigate') leaveUpload(sample);
    if (action === 'camera')
      await loadArrow('openCamera', {
        ...sample.bindings,
        facingMode: 'environment',
        navigator: {},
        cameraInput: { current: { click() {} } },
      })();
    const latestState = structuredClone(sample.state);
    release(phase === 'fetch' ? response : body);
    await work;
    assert.equal(
      transport.signal.aborted,
      true,
      `${action} aborts practice preparation during ${phase}`,
    );
    assert.deepEqual(
      sample.state,
      latestState,
      'Late practice work cannot reset newer state or errors.',
    );
    assert.ok(
      sample.readers.every(
        (reader) => reader.file.name !== 'ai-practice-whale.webp',
      ),
    );
  }
{
  const sample = createFixture();
  await loadArrow('loadPracticeDrawing', {
    ...sample.bindings,
    generating: false,
    regenerating: false,
    File,
    closeCamera: () => {},
    fetch: async () => ({ ok: true, blob: async () => new Blob(['practice']) }),
  })();
  assert.equal(
    sample.state.preparingImage,
    true,
    'Fetch completion must not hide the active image decode.',
  );
  sample.readers[0].complete();
  sample.decoders[0].onload();
  assert.equal(sample.state.practiceDrawing, true);
  sample.bindings.load(file('personal.png'));
  sample.readers[1].complete();
  sample.decoders[1].onload();
  assert.equal(
    sample.state.practiceDrawing,
    false,
    'Only a successfully accepted personal drawing replaces the sample label.',
  );
}
{
  const sample = createFixture();
  sample.bindings.load(file('ai-practice-whale.webp'), true);
  sample.readers[0].complete();
  const staleDecode = sample.decoders[0].onload;
  leaveUpload(sample);
  staleDecode();
  assert.equal(sample.state.image, 'previous-drawing');
  assert.notEqual(
    sample.state.practiceDrawing,
    true,
    'Navigation also invalidates an already-decoding practice image.',
  );
}

// Completion order is deliberately reversed; canceled callbacks are invoked anyway
// to model a browser callback that was already queued before cancellation.
const uploads = createFixture();
uploads.bindings.load(file('A.png'));
uploads.readers[0].complete();
const oldDecoderCompletion = uploads.decoders[0].onload;
const oldDecoderError = uploads.decoders[0].onerror;
uploads.bindings.load(file('B.png'));
uploads.readers[1].complete();
uploads.decoders[1].onload();
assert.equal(uploads.state.image, 'prepared:decoded:B.png');
const currentPreview = uploads.state.localPreview;
uploads.state.generated = ['B-result'];
oldDecoderCompletion();
oldDecoderError();
assert.equal(
  uploads.state.image,
  'prepared:decoded:B.png',
  'late A cannot replace chosen B',
);
assert.equal(
  uploads.state.localPreview,
  currentPreview,
  'late preview cannot replace B',
);
assert.deepEqual(
  uploads.state.generated,
  ['B-result'],
  'late A cannot erase B generation',
);
assert.equal(
  uploads.state.uploadError,
  '',
  'late decode failure cannot overwrite B success',
);
assert.equal(uploads.state.preparingImage, false);
assert.equal(
  uploads.state.chatConsent,
  false,
  'a new accepted drawing needs fresh chat consent',
);

// Camera encoding may finish after another selection, closing, or camera flip.
// Execute the real capture handler with a deliberately deferred toBlob callback.
for (const supersedingAction of ['upload', 'close', 'capture']) {
  const camera = createFixture();
  const callbacks = [];
  const accepted = [];
  const cameraRequest = { current: 5 };
  let closed = 0;
  const capture = loadArrow('captureCamera', {
    ...camera.bindings,
    cameraRequest,
    video: { current: { videoWidth: 640, videoHeight: 480 } },
    File,
    document: {
      createElement: () => ({
        getContext: () => ({ drawImage() {} }),
        toBlob: (callback) => callbacks.push(callback),
      }),
    },
    load: (file) => accepted.push(file.name),
    closeCamera: () => {
      cameraRequest.current++;
      closed++;
    },
  });
  capture();
  if (supersedingAction === 'upload')
    camera.bindings.characterInput.current.uploadEpoch++;
  if (supersedingAction === 'close') cameraRequest.current++;
  if (supersedingAction === 'capture') capture();
  callbacks[0](new Blob(['old']));
  assert.deepEqual(
    accepted,
    [],
    `${supersedingAction} invalidates the earlier camera result`,
  );
  assert.equal(closed, 0, 'stale camera callback cannot close current camera');
  if (supersedingAction === 'capture') {
    callbacks[1](new Blob(['latest']));
    assert.deepEqual(accepted, ['camera-drawing.jpg']);
    assert.equal(closed, 1);
  }
}

const reads = createFixture();
reads.bindings.load(file('slow-A.png'));
const queuedReaderCompletion = reads.readers[0].onload;
reads.bindings.load(file('B.png'));
assert.equal(
  reads.readers[0].aborted,
  true,
  'superseded file reader is canceled',
);
reads.readers[0].result = 'decoded:slow-A.png';
queuedReaderCompletion();
assert.equal(
  reads.decoders.length,
  0,
  'late reader cannot even start image decode',
);
assert.equal(
  reads.bindings.ensureCharacterRequestAllowed(),
  false,
  'old source cannot be transmitted while replacement is decoding',
);
reads.bindings.load({ name: 'bad.txt', type: 'text/plain', size: 2 });
assert.equal(
  reads.readers[1].aborted,
  true,
  'invalid later selection still cancels pending earlier input',
);
assert.equal(
  reads.state.image,
  'previous-drawing',
  'invalid replacement preserves accepted source',
);
assert.match(reads.state.uploadError, /JPG, PNG, WEBP/);
assert.equal(reads.state.preparingImage, false);

const withdrawal = createFixture();
withdrawal.bindings.load(file('pending.png'));
withdrawal.readers[0].complete();
const queuedUpload = withdrawal.decoders[0].onload;
withdrawal.bindings.generationRequest.current = new AbortController();
const liveRequest = withdrawal.bindings.generationRequest.current;
const runBefore = withdrawal.bindings.generationRun.current;
withdrawal.bindings.updatePhotoConsent(false);
assert.equal(
  liveRequest.signal.aborted,
  true,
  'withdrawal immediately aborts generation',
);
assert.equal(
  withdrawal.bindings.generationRun.current,
  runBefore + 1,
  'withdrawal invalidates late results',
);
assert.equal(withdrawal.state.guardianVerified, false);
assert.equal(withdrawal.bindings.characterInput.current.consent, false);
assert.deepEqual(
  withdrawal.bindings.reviewTickets.current,
  {},
  'withdrawal drops unfinished review receipts',
);
queuedUpload();
assert.equal(
  withdrawal.state.image,
  'previous-drawing',
  'withdrawn pending image never commits',
);
assert.equal(withdrawal.bindings.ensureCharacterRequestAllowed(), false);
assert.equal(
  withdrawal.state.step,
  'guardian',
  'returning to upload requires renewed guardian confirmation',
);
assert.deepEqual(
  withdrawal.state.generationStatuses,
  ['ready', 'unrequested'],
  'finished art survives withdrawal',
);
await assert.rejects(
  loadArrow('requestVariant', {
    characterInput: withdrawal.bindings.characterInput,
  })(new Blob(['fake']), 2),
  { name: 'AbortError' },
  'direct request entry also enforces current consent',
);

let releaseReference;
let imageRequests = 0;
const betweenStages = createFixture();
const variantBindings = {
  ...betweenStages.bindings,
  withCharacterDeadline,
  favoriteColor: '민트',
  preserveFocus: '귀',
  characterWish: '',
  age: '7–9세',
  childGender: '선택 안 함',
  characterMood: '다정한',
  favoriteWorld: '동물',
  styleReferenceBlob: { current: null },
  plushReferenceVersion: 'offline-test',
  window: { setTimeout, clearTimeout },
  fetch: (url) => {
    if (url === '/api/character') {
      imageRequests++;
      throw new Error('unexpected outbound image request');
    }
    return new Promise((resolve) => {
      releaseReference = resolve;
    });
  },
};
variantBindings.reviewTickets = { current: {} };
const waiting = loadArrow('requestVariant', variantBindings)(
  new Blob(['fake']),
  2,
  new AbortController().signal,
  true,
);
betweenStages.bindings.characterInput.current.consent = false;
releaseReference({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) });
await assert.rejects(
  waiting,
  { name: 'AbortError' },
  'consent is rechecked after async reference loading',
);
assert.equal(
  imageRequests,
  0,
  'withdrawal between stages prevents transmission',
);

const lateResponse = createFixture();
let finishResponse;
const delivered = loadArrow('requestVariant', {
  ...variantBindings,
  characterInput: lateResponse.bindings.characterInput,
  generationRun: lateResponse.bindings.generationRun,
  reviewTickets: { current: {} },
  fetch: () =>
    new Promise((resolve) => {
      finishResponse = resolve;
    }),
  readJson: async () => ({ image: 'already-produced-but-withdrawn-result' }),
})(new Blob(['fake']), 0, new AbortController().signal);
lateResponse.bindings.characterInput.current.consent = false;
finishResponse({ ok: true, headers: { get: () => 'application/json' } });
await assert.rejects(
  delivered,
  { name: 'AbortError' },
  'provider response received after withdrawal cannot be accepted',
);

const cooldown = createFixture();
cooldown.bindings.characterInput.current.retryUntil = 160_000;
assert.equal(cooldown.bindings.getCharacterRetryRemainingSeconds(), 60);
cooldown.state.generationFailed = false; // Same state transition as returning to preferences.
cooldown.state.generationRetryRemainingSeconds = 0; // A stale UI label must not override the deadline.
assert.equal(cooldown.bindings.ensureCharacterRequestAllowed(), false);
assert.equal(cooldown.state.generationRetryRemainingSeconds, 60);
cooldown.advance(31_200);
assert.equal(
  cooldown.bindings.getCharacterRetryRemainingSeconds(),
  29,
  'background time counts toward retry deadline',
);
for (const handler of ['generateCharacter', 'regenerateVariant']) {
  let sends = 0;
  const request = loadArrow(handler, {
    image: 'source',
    generating: false,
    regenerating: false,
    generationFailed: false,
    generationCanRetry: true,
    ensureCharacterRequestAllowed:
      cooldown.bindings.ensureCharacterRequestAllowed,
    fetch: () => {
      sends++;
      throw new Error('unexpected source read');
    },
  });
  await request(2, true);
  assert.equal(
    sends,
    0,
    `${handler} checks the shared absolute cooldown before any source/request work`,
  );
}
cooldown.bindings.load(file('new-source.png'));
cooldown.readers[0].complete();
cooldown.decoders[0].onload();
assert.equal(
  cooldown.state.generationRetryRemainingSeconds,
  29,
  'choosing a new source cannot erase the server wait',
);
cooldown.advance(28_800);
assert.equal(
  cooldown.bindings.ensureCharacterRequestAllowed(),
  true,
  'retry unlocks when the absolute deadline passes',
);
// Preferences can be revisited after several styles have already completed.
// Exercise the actual main handler, not a duplicate implementation of its updates.
for (const outcome of ['failure', 'cancel', 'success', 'superseded-source']) {
  const kept = createFixture();
  const oldImages = ['approved-2d', 'approved-sticker', 'approved-plush'];
  const oldQualities = [
    { passed: true, score: 90 },
    { passed: true, score: 91 },
    { passed: true, score: 92 },
  ];
  kept.state.generated = [...oldImages];
  kept.state.generatedQuality = [...oldQualities];
  kept.state.generationStatuses = ['ready', 'ready', 'ready'];
  let finish;
  let requests = 0;
  const replacement = {
    index: 2,
    image: 'reviewed-new-plush',
    quality: { passed: true, score: 95 },
  };
  const handler = loadArrow('generateCharacter', {
    ...kept.bindings,
    generating: false,
    regenerating: false,
    characterStyleCount: 3,
    characterStyles: [{ name: '2D' }, { name: '스티커' }, { name: '보송' }],
    fetch: async () => ({ blob: async () => new Blob(['synthetic source']) }),
    requestVariant: () => {
      requests++;
      return new Promise((resolve, reject) => {
        finish = { resolve, reject };
      });
    },
    rememberGenerationFailure: () => {
      kept.state.failed = true;
    },
  });
  const pending = handler();
  for (let index = 0; index < 8 && !finish; index++) await Promise.resolve();
  assert.equal(requests, 1);
  assert.deepEqual(
    kept.state.generated,
    oldImages,
    'starting replacement retains every completed style',
  );
  assert.deepEqual(
    kept.state.generatedQuality,
    oldQualities,
    'previous approval is not erased while waiting',
  );
  if (outcome === 'failure') finish.reject(new Error('provider unavailable'));
  else if (outcome === 'cancel') {
    kept.bindings.generationRequest.current.abort();
    kept.bindings.generationRun.current++;
    finish.resolve(replacement); // Even a provider ignoring cancellation must be ignored.
  } else if (outcome === 'superseded-source') {
    kept.bindings.generationRun.current++;
    kept.state.generated = ['', '', ''];
    kept.state.generatedQuality = [null, null, null];
    finish.resolve(replacement);
  } else finish.resolve(replacement);
  await pending;
  if (outcome === 'success') {
    assert.deepEqual(kept.state.generated, [
      ...oldImages.slice(0, 2),
      replacement.image,
    ]);
    assert.deepEqual(kept.state.generatedQuality, [
      ...oldQualities.slice(0, 2),
      replacement.quality,
    ]);
  } else if (outcome === 'superseded-source') {
    assert.deepEqual(
      kept.state.generated,
      ['', '', ''],
      'old replacement cannot attach to a newer source',
    );
  } else {
    assert.deepEqual(
      kept.state.generated,
      oldImages,
      `${outcome} preserves finished friends`,
    );
    assert.deepEqual(kept.state.generatedQuality, oldQualities);
  }
}
console.log(
  'Character input smoke passed: latest-upload wins, decode cancellation, consent withdrawal/late-response guards, and absolute retry deadlines; no external network.',
);

let transportSignal;
await assert.rejects(
  withCharacterDeadline(
    (signal) => {
      transportSignal = signal;
      return new Promise(() => {});
    },
    undefined,
    5,
  ),
  { name: 'TimeoutError' },
  'even a transport that never completes cannot leave generation pending forever',
);
assert.equal(transportSignal.aborted, true);
assert.equal(
  await withCharacterDeadline(async () => 'approved', undefined, 5),
  'approved',
);
const externalAbort = new AbortController();
const canceled = withCharacterDeadline(
  () => new Promise(() => {}),
  externalAbort.signal,
  500,
);
externalAbort.abort();
await assert.rejects(
  canceled,
  { name: 'AbortError' },
  'user cancellation stays distinct from timeout',
);
