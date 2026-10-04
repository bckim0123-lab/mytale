import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Run the actual Page handlers and effects with deferred, local media doubles.
// No browser, camera permission, image provider, storage or network is used.
const source = readFileSync('app/page.tsx', 'utf8');
const ast = ts.createSourceFile(
  'page.tsx',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const handlers = new Map();
let previewEffect, cleanupEffect, navigationEffect, openButton, shutterDisabled;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.initializer)
    handlers.set(node.name.getText(ast), node.initializer.getText(ast));
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(ast) === 'useEffect'
  ) {
    const callback = node.arguments[0]?.getText(ast) || '';
    if (callback.includes('bindCameraPreview(cameraStream.current'))
      previewEffect = {
        callback,
        deps: node.arguments[1].getText(ast),
      };
    if (
      callback.includes('clearCameraPreview()') &&
      callback.includes('generationRun.current += 1')
    )
      cleanupEffect = callback;
    if (callback.includes("step !== 'upload' && cameraStream.current"))
      navigationEffect = callback;
  }
  if (
    ts.isJsxAttribute(node) &&
    node.name.getText(ast) === 'onClick' &&
    node.initializer?.expression?.getText(ast) === '() => void openCamera()'
  )
    openButton = node.initializer.expression.getText(ast);
  if (ts.isJsxOpeningElement(node) && node.tagName.getText(ast) === 'button') {
    const properties = node.attributes.properties;
    if (
      properties.some(
        (property) =>
          property.name?.getText(ast) === 'className' &&
          property.initializer?.text === 'camera-shutter',
      )
    )
      shutterDisabled = properties
        .find((property) => property.name?.getText(ast) === 'disabled')
        ?.initializer?.expression?.getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
for (const name of [
  'openCamera',
  'closeCamera',
  'flipCamera',
  'captureCamera',
  'cancelImagePreparation',
  'clearCameraPreview',
  'cameraFrameReady',
  'bindCameraPreview',
])
  assert.ok(handlers.has(name), `Actual ${name} handler exists`);
assert.ok(
  previewEffect &&
    cleanupEffect &&
    navigationEffect &&
    openButton &&
    shutterDisabled,
);

function compile(expression, bindings) {
  const code = ts.transpileModule(`return (${expression});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  // oxlint-disable-next-line typescript/no-implied-eval -- Only repository AST expressions run with offline bindings.
  return new Function(...Object.keys(bindings), code)(
    ...Object.values(bindings),
  );
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function stream(id) {
  const track = {
    stops: 0,
    readyState: 'live',
    stop() {
      this.stops++;
      this.readyState = 'ended';
    },
  };
  return { id, track, getTracks: () => [track], getVideoTracks: () => [track] };
}
function fixture({
  oldBinding = false,
  oldCleanup = false,
  oldCapture = false,
  rejectPlay = false,
  retainReadyState = false,
} = {}) {
  const state = {
    cameraOpen: false,
    cameraReady: false,
    facingMode: 'environment',
    cameraError: '',
    preparingImage: false,
    drawingReplacementOpen: false,
  };
  const cameraStream = { current: null };
  const cameraReadyStream = { current: null };
  const cameraRequest = { current: 0 };
  const video = { current: null };
  const characterInput = {
    current: {
      uploadEpoch: 0,
      consent: true,
      reading: false,
      reader: null,
      decoder: null,
    },
  };
  const drawingReplacement = { current: null };
  const pending = [],
    encodings = [],
    loaded = [],
    playCalls = [];
  let disposed = false,
    lateSetters = 0,
    previousDeps,
    fallbackClicks = 0;
  const set = (key) => (value) => {
    if (disposed) {
      lateSetters++;
      return;
    }
    state[key] = value;
  };
  const navigator = {
    mediaDevices: {
      getUserMedia(options) {
        assert.equal(options.audio, false);
        assert.deepEqual(options.video.width, { ideal: 1280 });
        assert.deepEqual(options.video.height, { ideal: 1280 });
        const job = deferred();
        pending.push({ ...job, options });
        return job.promise;
      },
    },
  };
  const document = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      let capturedStream;
      return {
        width: 0,
        height: 0,
        getContext(type) {
          assert.equal(type, '2d');
          return {
            drawImage(currentVideo) {
              capturedStream = currentVideo.srcObject;
            },
          };
        },
        toBlob(callback, type, quality) {
          assert.equal(type, 'image/jpeg');
          assert.equal(quality, 0.9);
          encodings.push({
            stream: capturedStream,
            complete(
              blob = new Blob([capturedStream.id], { type: 'image/jpeg' }),
            ) {
              callback(blob);
            },
          });
        },
      };
    },
  };
  function bindings() {
    const bound = {
      ...state,
      cameraStream,
      cameraReadyStream,
      cameraRequest,
      video,
      characterInput,
      drawingReplacement,
      navigator,
      document,
      File,
      cameraInput: {
        current: {
          click() {
            fallbackClicks++;
          },
        },
      },
      generationRequest: { current: null },
      generationRun: { current: 0 },
      setCameraOpen: set('cameraOpen'),
      setCameraReady: set('cameraReady'),
      setFacingMode: set('facingMode'),
      setCameraError: set('cameraError'),
      setPreparingImage: set('preparingImage'),
      setDrawingReplacementOpen: set('drawingReplacementOpen'),
      queueMicrotask: (callback) => callback(),
      load: (file) => loaded.push(file),
    };
    bound.cancelImagePreparation = compile(
      handlers.get('cancelImagePreparation'),
      bound,
    );
    bound.clearCameraPreview = compile(
      handlers.get('clearCameraPreview'),
      bound,
    );
    bound.cameraFrameReady = compile(handlers.get('cameraFrameReady'), bound);
    bound.bindCameraPreview = compile(handlers.get('bindCameraPreview'), bound);
    bound.closeCamera = compile(handlers.get('closeCamera'), bound);
    let open = handlers.get('openCamera');
    if (oldBinding)
      open = open.replace('bindCameraPreview(stream, requestId);', '');
    bound.openCamera = compile(open, bound);
    return bound;
  }
  function flush() {
    if (disposed) return;
    if (state.cameraOpen && !video.current)
      video.current = {
        source: null,
        get srcObject() {
          return this.source;
        },
        set srcObject(value) {
          this.source = value;
          if (!retainReadyState) this.readyState = 0;
        },
        readyState: 0,
        videoWidth: 640,
        videoHeight: 480,
        play() {
          playCalls.push(this.srcObject);
          return rejectPlay
            ? Promise.reject(new Error('local play rejected'))
            : Promise.resolve();
        },
      };
    if (!state.cameraOpen) video.current = null;
    const bound = bindings();
    const deps = compile(previewEffect.deps, bound);
    if (
      !previousDeps ||
      deps.some((value, index) => !Object.is(value, previousDeps[index]))
    )
      compile(previewEffect.callback, bound)();
    previousDeps = deps;
  }
  const api = {
    state,
    cameraStream,
    cameraReadyStream,
    cameraRequest,
    video,
    pending,
    encodings,
    loaded,
    playCalls,
    get lateSetters() {
      return lateSetters;
    },
    get fallbackClicks() {
      return fallbackClicks;
    },
    clickOpen() {
      compile(openButton, bindings())();
    },
    flip() {
      void compile(handlers.get('flipCamera'), bindings())();
    },
    close() {
      bindings().closeCamera();
      flush();
    },
    shutterDisabled() {
      return compile(shutterDisabled, bindings());
    },
    frameReady() {
      assert.ok(video.current);
      video.current.readyState = 2;
      video.current.onloadeddata?.();
    },
    capture() {
      const actual = handlers.get('captureCamera');
      const expression = oldCapture
        ? actual.replace(
            /if\s*\([\s\S]*?\)\s*return;/,
            'if (!preview?.videoWidth || !preview.videoHeight) return;',
          )
        : actual;
      compile(expression, bindings())();
    },
    revoke() {
      const bound = bindings();
      for (const [, name] of handlers
        .get('updatePhotoConsent')
        .matchAll(/\b(set[A-Z][A-Za-z0-9]*)\(/g))
        if (!bound[name]) bound[name] = () => {};
      bound.reviewTickets = { current: {} };
      compile(handlers.get('updatePhotoConsent'), bound)(false);
      flush();
    },
    cancelInput() {
      bindings().cancelImagePreparation();
    },
    leave() {
      compile(navigationEffect, { ...bindings(), step: 'welcome' })();
      flush();
    },
    unmount() {
      disposed = true;
      video.current = null; // React removes the video ref on unmount.
      const expression = oldCleanup
        ? cleanupEffect.replace('cameraRequest.current += 1;', '')
        : cleanupEffect;
      compile(expression, bindings())()();
    },
    async resolve(index, value) {
      pending[index].resolve(value);
      await Promise.resolve();
      await Promise.resolve();
      flush();
    },
    async reject(index) {
      pending[index].reject(new Error('local permission denied'));
      await Promise.resolve();
      await Promise.resolve();
      flush();
    },
    noMediaApi() {
      navigator.mediaDevices = undefined;
    },
  };
  flush();
  return api;
}

async function sameFacing(options) {
  const test = fixture(options);
  const first = stream('first'),
    latest = stream('latest');
  test.clickOpen();
  assert.equal(
    test.video.current,
    null,
    'First video is not mounted before permission',
  );
  await test.resolve(0, first);
  assert.equal(
    test.video.current.srcObject,
    first,
    'First-mount effect connects preview',
  );
  assert.equal(
    test.shutterDisabled(),
    true,
    'Metadata alone does not enable capture',
  );
  test.frameReady();
  assert.equal(test.shutterDisabled(), false);
  const mountedVideo = test.video.current;
  test.clickOpen();
  assert.equal(first.track.stops, 1, 'Reopening stops the replaced stream');
  await test.resolve(1, latest);
  assert.equal(
    test.video.current,
    mountedVideo,
    'Same-facing reopen retains the mounted video',
  );
  assert.equal(
    test.video.current.srcObject,
    latest,
    'Same-facing reopen must bind the latest stream',
  );
  assert.equal(test.cameraStream.current, latest);
  assert.equal(
    test.shutterDisabled(),
    true,
    'Replacement waits for its own current frame',
  );
  test.frameReady();
  test.capture();
  assert.equal(
    test.encodings[0].stream,
    latest,
    'Capture reads the current live stream, not the stopped frame',
  );
  test.encodings[0].complete();
  assert.equal(test.loaded.length, 1);
  assert.equal(await test.loaded[0].text(), 'latest');
  assert.equal(test.loaded[0].name, 'camera-drawing.jpg');
  assert.equal(test.loaded[0].type, 'image/jpeg');
  assert.equal(
    latest.track.stops,
    1,
    'Successful capture releases the camera once',
  );
  assert.equal(test.cameraStream.current, null);
  assert.equal(test.cameraReadyStream.current, null);
  assert.equal(mountedVideo.srcObject, null, 'Capture closes the preview');
  return test;
}
await sameFacing();
await assert.rejects(
  sameFacing({ oldBinding: true }),
  /Same-facing reopen must bind/,
);

async function pendingCapture(options, action = 'clickOpen') {
  const test = fixture(options);
  const first = stream('first'),
    latest = stream('latest');
  test.clickOpen();
  await test.resolve(0, first);
  test.frameReady();
  const oldLoadedData = test.video.current.onloadeddata;
  const oldCanPlay = test.video.current.oncanplay;
  assert.equal(test.shutterDisabled(), false);
  test[action]();
  // These calls occur before a render: a stale enabled button cannot capture.
  assert.equal(test.cameraStream.current, null);
  assert.equal(test.cameraReadyStream.current, null);
  assert.equal(test.video.current.srcObject, null);
  assert.equal(test.shutterDisabled(), true);
  test.capture();
  assert.equal(
    test.encodings.length,
    0,
    'Pending replacement cannot encode the stopped previous frame',
  );
  await test.resolve(1, latest);
  assert.equal(test.state.cameraReady, false);
  test.capture();
  assert.equal(
    test.encodings.length,
    0,
    'A bound stream without a decoded frame cannot capture',
  );
  test.video.current.readyState = 1;
  test.video.current.onloadeddata();
  assert.equal(
    test.state.cameraReady,
    false,
    'Metadata readiness is not current-frame readiness',
  );
  test.video.current.readyState = 2;
  oldLoadedData();
  oldCanPlay();
  assert.equal(
    test.state.cameraReady,
    false,
    'Queued events from the old stream cannot mark the replacement ready',
  );
  test.video.current.oncanplay();
  assert.equal(test.state.cameraReady, true);
  test.capture();
  assert.equal(test.encodings.length, 1);
  assert.equal(test.encodings[0].stream, latest);
  test.encodings[0].complete();
  assert.equal(test.loaded.length, 1);
  assert.equal(first.track.stops, 1);
  assert.equal(latest.track.stops, 1);
}
await pendingCapture();
await pendingCapture({}, 'flip');
await pendingCapture({ retainReadyState: true });
await assert.rejects(
  pendingCapture({ oldCapture: true }),
  /Pending replacement cannot encode/,
);

for (const invalid of ['ended', 'source', 'width', 'height', 'data']) {
  const test = fixture();
  const current = stream('current');
  test.clickOpen();
  await test.resolve(0, current);
  test.frameReady();
  if (invalid === 'ended') current.track.readyState = 'ended';
  if (invalid === 'source') test.video.current.srcObject = stream('not-owned');
  if (invalid === 'width') test.video.current.videoWidth = 0;
  if (invalid === 'height') test.video.current.videoHeight = 0;
  if (invalid === 'data') test.video.current.readyState = 1;
  test.capture();
  assert.equal(
    test.encodings.length,
    0,
    `${invalid}: capture rechecks live source and decoded frame synchronously`,
  );
  test.close();
}

// Facing changes and out-of-order permissions preserve latest-request ownership.
{
  const test = fixture();
  const back = stream('back'),
    front = stream('front');
  test.clickOpen();
  await test.resolve(0, back);
  test.flip();
  assert.equal(test.pending[1].options.video.facingMode.ideal, 'user');
  await test.resolve(1, front);
  assert.equal(test.state.facingMode, 'user');
  assert.equal(test.video.current.srcObject, front);
  assert.equal(back.track.stops, 1);
  test.close();
  assert.equal(front.track.stops, 1);
}
for (const oldResult of ['resolve', 'reject']) {
  const test = fixture();
  const stale = stream('stale'),
    latest = stream('latest');
  test.clickOpen();
  test.clickOpen();
  await test.resolve(1, latest);
  if (oldResult === 'resolve') await test.resolve(0, stale);
  else await test.reject(0);
  assert.equal(test.cameraStream.current, latest);
  assert.equal(test.video.current.srcObject, latest);
  assert.equal(test.state.cameraError, '');
  assert.equal(stale.track.stops, oldResult === 'resolve' ? 1 : 0);
  test.close();
  assert.equal(latest.track.stops, 1);
}

// Closing or navigating during permission cannot reopen the camera later.
for (const action of ['close', 'leave']) {
  const test = fixture();
  const late = stream('late');
  test.clickOpen();
  test[action]();
  await test.resolve(0, late);
  assert.equal(late.track.stops, 1);
  assert.equal(test.cameraStream.current, null);
  assert.equal(test.state.cameraOpen, false);
  assert.equal(test.state.cameraReady, false);
}
{
  const test = fixture();
  test.clickOpen();
  test.revoke();
  const late = stream('late');
  await test.resolve(0, late);
  assert.equal(late.track.stops, 1);
  assert.equal(test.cameraStream.current, null);
  assert.equal(test.state.cameraReady, false);
}
{
  const test = fixture();
  test.clickOpen();
  await test.reject(0);
  assert.match(test.state.cameraError, /권한/);
  assert.equal(test.state.cameraOpen, false);
  test.clickOpen();
  const retry = stream('retry');
  await test.resolve(1, retry);
  assert.equal(test.state.cameraError, '');
  assert.equal(test.video.current.srcObject, retry);
  test.close();
}

async function unmountWhilePending(options, withActive = false) {
  const test = fixture(options);
  const active = stream('active'),
    late = stream('late');
  let pendingIndex = 0;
  if (withActive) {
    test.clickOpen();
    await test.resolve(0, active);
    pendingIndex = 1;
  }
  test.clickOpen();
  test.unmount();
  assert.equal(
    test.cameraStream.current,
    null,
    'Actual cleanup clears the current stream ref',
  );
  await test.resolve(pendingIndex, late);
  assert.equal(
    late.track.stops,
    1,
    'Unmount invalidates and stops late permission exactly once',
  );
  assert.equal(test.cameraStream.current, null);
  assert.equal(
    test.lateSetters,
    0,
    'Late permission never writes state after unmount',
  );
  assert.equal(
    active.track.stops,
    withActive ? 1 : 0,
    'Replacing then unmounting never stops the same active track twice',
  );
  return { test, active };
}
await unmountWhilePending();
await unmountWhilePending({}, true);
await assert.rejects(
  unmountWhilePending({ oldCleanup: true }),
  /Unmount invalidates/,
);
{
  const test = fixture();
  const active = stream('active');
  test.clickOpen();
  await test.resolve(0, active);
  test.unmount();
  assert.equal(
    active.track.stops,
    1,
    'Active stream is stopped once by the actual cleanup',
  );
  assert.equal(test.cameraStream.current, null);
  assert.equal(test.lateSetters, 0);
}

// Slow JPEG encoding must not restore an older frame after a newer user action.
for (const action of [
  'capture',
  'close',
  'cancelInput',
  'leave',
  'unmount',
  'flip',
  'revoke',
]) {
  const test = fixture();
  const current = stream('current');
  test.clickOpen();
  await test.resolve(0, current);
  test.frameReady();
  test.capture();
  test[action]();
  test.encodings[0].complete();
  assert.equal(
    test.loaded.length,
    0,
    `${action} invalidates the previous capture`,
  );
  if (action === 'capture') {
    test.encodings[1].complete();
    assert.equal(test.loaded.length, 1, 'Only the newest capture is accepted');
  } else if (action === 'flip') {
    const replacement = stream('replacement');
    await test.resolve(1, replacement);
    test.close();
    assert.equal(replacement.track.stops, 1);
  } else if (action === 'cancelInput') test.close();
}
{
  const test = fixture();
  test.noMediaApi();
  test.clickOpen();
  assert.equal(
    test.fallbackClicks,
    1,
    'Unsupported local media uses native file capture',
  );
  assert.equal(test.pending.length, 0);
}
const unhandled = [];
const onUnhandled = (error) => unhandled.push(error);
process.on('unhandledRejection', onUnhandled);
try {
  await sameFacing({ rejectPlay: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(
    unhandled,
    [],
    'Both first-mount and replacement play failures are handled',
  );
} finally {
  process.removeListener('unhandledRejection', onUnhandled);
}
console.log(
  'Camera preview passed: actual JSX/handlers/effects, first/repeated/facing preview and current-frame capture, disabled/synchronous pending-frame protection, stale ready events, permission ordering/denial, close/navigation/revocation/unmount cleanup, stale encodings, handled play failures, and three in-memory regression controls; no camera/network/storage.',
);
