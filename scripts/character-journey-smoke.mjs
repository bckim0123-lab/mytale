import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { createServer } from 'vite';

const page = await readFile('app/page.tsx', 'utf8');
const ast = ts.createSourceFile(
  'page.tsx',
  page,
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
  assert.ok(found?.initializer, `Actual UI handler ${name} must exist`);
  const code = ts.transpileModule(`const ${found.getText(ast)};`, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  // oxlint-disable-next-line typescript/no-implied-eval -- Execute this repository's parsed UI handler, never user-supplied content.
  return new Function(...Object.keys(bindings), `${code}\nreturn ${name};`)(
    ...Object.values(bindings),
  );
}

const server = await createServer({
  configFile: false,
  cacheDir: 'node_modules/.vite-character-journey-test',
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false },
});
try {
  const { characterRecoveryMode } = await server.ssrLoadModule(
    '/app/character-recovery.ts',
  );
  for (const code of [
    'quality_failed',
    'alpha_failed',
    'result_too_large',
    'quality_review_payload_too_large',
    'review_retry_exhausted',
    'review_ticket_invalid',
  ]) {
    assert.equal(
      characterRecoveryMode({ code, retryable: false }),
      'recreate',
      `${code} can be replaced only by an explicit new request`,
    );
  }
  for (const code of ['provider_unavailable', 'service_unconfigured']) {
    assert.equal(
      characterRecoveryMode({ code, retryable: false }),
      'unavailable',
    );
  }
  for (const code of [
    'unsafe_source',
    'generation_request_rejected',
    'quality_review_refused',
    'unknown_permanent_failure',
  ]) {
    assert.equal(
      characterRecoveryMode({ code, retryable: false }),
      'change-source',
      'Never turn a refusal into a fresh-generation loop',
    );
  }
  assert.equal(
    characterRecoveryMode({
      code: 'quality_review_unavailable',
      retryable: true,
      hasReviewTicket: true,
    }),
    'review',
  );
  assert.equal(
    characterRecoveryMode({ code: 'upstream_busy', retryable: true }),
    'retry',
  );

  const state = {
    generated: ['old-2d', '', 'old-3d'],
    quality: [null, null, null],
    statuses: ['ready', 'unrequested', 'ready'],
  };
  const calls = [];
  let fetches = 0;
  const set = (key) => (value) => {
    state[key] = typeof value === 'function' ? value(state[key]) : value;
  };
  const base = {
    image: 'synthetic-source',
    generating: false,
    regenerating: false,
    generationFailed: true,
    generationCanRetry: true,
    ensureCharacterRequestAllowed: () => true,
    generationRequest: { current: null },
    reviewTickets: { current: {} },
    generationRun: { current: 0 },
    characterStyleCount: 3,
    characterStyles: [{ name: '동화' }, { name: '스티커' }, { name: '보송' }],
    setRegenerating: set('busy'),
    setGenerationStartedAt: set('started'),
    setGenerationStage: set('stage'),
    setGenerationElapsedSeconds: set('elapsed'),
    setGenerationLastActivityAt: set('activity'),
    setGenerationConnectionDelayed: set('delayed'),
    setGenerationFailed: set('failed'),
    setGenerationRetryable: set('retryable'),
    setGenerationRetryRemainingSeconds: set('remaining'),
    setGenerationFailureDismissed: set('dismissed'),
    setPick: set('pick'),
    setGenerationStatuses: set('statuses'),
    setGenerationNote: set('note'),
    setGenerated: set('generated'),
    setGeneratedQuality: set('quality'),
    setArrivalDismissed: set('arrival'),
    rememberGenerationFailure: (error) => {
      throw error;
    },
    fetch: async () => {
      fetches++;
      return { blob: async () => new Blob(['synthetic']) };
    },
    requestVariant: async (...args) => {
      calls.push(args);
      return {
        index: args[1],
        image: 'new-reviewed-image',
        quality: { passed: true },
      };
    },
  };
  await loadArrow('regenerateVariant', { ...base, generationCanRetry: false })(
    2,
    true,
  );
  assert.equal(
    fetches,
    0,
    'Cooldown and permanent refusal must block before even reading source',
  );
  assert.equal(calls.length, 0);
  await loadArrow('regenerateVariant', { ...base, regenerating: true })(
    2,
    true,
  );
  assert.equal(
    calls.length,
    0,
    'A busy UI cannot launch another image request',
  );
  await loadArrow('regenerateVariant', base)(2, true);
  assert.equal(
    calls.length,
    1,
    'One explicit retry causes exactly one client request',
  );
  assert.equal(
    calls[0][3],
    true,
    'An explicit replacement retains high-quality settings',
  );
  assert.deepEqual(
    state.generated,
    ['old-2d', '', 'new-reviewed-image'],
    'Other finished styles survive replacement',
  );
  assert.equal(state.statuses[2], 'ready');
  assert.equal(state.busy, false);

  for (const replace of [false, true]) {
    let finishSource;
    const sourceReady = new Promise((resolve) => {
      finishSource = resolve;
    });
    const requestRef = { current: null };
    const runRef = { current: 0 };
    const beforeCalls = calls.length;
    const delayed = loadArrow('regenerateVariant', {
      ...base,
      generationRequest: requestRef,
      generationRun: runRef,
      fetch: () => sourceReady,
    })(2, true);
    const oldController = requestRef.current;
    oldController.abort();
    runRef.current++;
    if (replace) requestRef.current = new AbortController();
    const afterCancel = structuredClone(state);
    finishSource({ blob: async () => new Blob(['old-source-bytes']) });
    await delayed;
    assert.equal(
      calls.length,
      beforeCalls,
      'Canceled source preparation cannot borrow a newer controller or transmit the old picture.',
    );
    assert.deepEqual(
      state,
      afterCancel,
      'An old run cannot write progress, failure, result or busy state after cancellation.',
    );
    if (replace)
      assert.equal(
        requestRef.current.signal.aborted,
        false,
        'The new request controller belongs only to its own run.',
      );
  }

  const reviewNotes = [];
  await loadArrow('regenerateVariant', {
    ...base,
    reviewTickets: { current: { 2: 'encrypted-existing-candidate' } },
    setGenerationNote: (value) => reviewNotes.push(value),
  })(2, true);
  assert.match(
    reviewNotes[0],
    /검사만 이어가요\. 새 이미지는 만들지 않아요/,
    'A review-only resume must not be described as generating another image',
  );

  for (const hasTicket of [false, true]) {
    const uploadNotes = [];
    const beforeCalls = calls.length;
    await loadArrow('generateCharacter', {
      ...base,
      preferredStyle: 0,
      reviewTickets: {
        current: hasTicket
          ? { 0: { value: 'existing-ticket', expiresAt: Date.now() + 60_000 } }
          : {},
      },
      setGenerating: set('busy'),
      setStep: set('step'),
      setGenerationNote: (value) => uploadNotes.push(value),
    })();
    assert.equal(
      calls.length,
      beforeCalls + 1,
      'Upload retry causes one request only',
    );
    assert.match(
      uploadNotes[0],
      hasTicket
        ? /검사만 이어가요\. 새 이미지는 만들지 않아요/
        : /새 모습을 만들고 있어요/,
    );
    assert.equal(
      state.generated[2],
      'new-reviewed-image',
      'Upload retry preserves the other approved style',
    );
  }

  const persona = {
    name: '별콩',
    likes: '별',
    traits: '다정함',
    ability: '빛내기',
    quirk: '쫑긋',
  };
  const saves = [];
  const steps = [];
  const keepBindings = {
    selectedHasAiCharacter: false,
    chosenImage: 'local-preview',
    persona,
    setCompanionArtwork: (value) => saves.push(value),
    setArrivalDismissed: () => {},
    setStep: (value) => steps.push(value),
  };
  loadArrow('keepCharacterAndPlay', keepBindings)();
  assert.equal(
    saves.length,
    0,
    'Do not present a local preview as the saved AI result',
  );
  loadArrow('keepCharacterAndPlay', {
    ...keepBindings,
    selectedHasAiCharacter: true,
    chosenImage: '',
  })();
  assert.equal(saves.length, 0, 'An empty image cannot replace a friend');
  loadArrow('keepCharacterAndPlay', {
    ...keepBindings,
    selectedHasAiCharacter: true,
    chosenImage: 'reviewed-transparent-image',
  })();
  assert.deepEqual(saves, [
    { png: 'reviewed-transparent-image', name: '별콩', persona },
  ]);
  assert.deepEqual(steps, ['companion']);

  assert.match(
    page,
    /onCreate=\{\(\) =>[\s\S]{0,240}guardianVerified && photoConsent \? 'upload' : 'guardian'/,
    'First-screen creation must keep the guardian boundary',
  );
  assert.ok(
    page.indexOf('id="first-friend-name"') <
      page.indexOf('id="character-persona"'),
    'The immediate save action belongs before optional persona settings',
  );
  const welcome = await readFile('app/character-welcome.tsx', 'utf8');
  const styles = await readFile('app/character-welcome.css', 'utf8');
  assert.match(welcome, /내 그림으로 친구 만들기/);
  assert.match(welcome, /그림 없이 3D 친구와 먼저 놀기/);
  assert.match(
    welcome,
    /스타일 예시[\s\S]*내 그림으로 만드는 결과는 각각 달라요/,
  );
  assert.match(
    styles,
    /\.creation-mascot img\s*\{[^}]*object-fit: contain/s,
    'Do not crop the mascot to a rectangular tile',
  );
  assert.match(styles, /prefers-reduced-motion: reduce/);
  console.log(
    'character journey passed: explicit recovery, preserved results, honest previews, guardian entry, early faithful save, bounded requests',
  );
} finally {
  await server.close();
}
