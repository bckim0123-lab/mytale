import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { withCharacterDeadline } from '../app/character-request-deadline.ts';

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
