import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import postcss from 'postcss';
import { createServer } from 'vite';

const readerSource = readFileSync('app/companion-storybook.tsx', 'utf8');
const readerAst = ts.createSourceFile(
  'companion-storybook.tsx',
  readerSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
function findNode(predicate) {
  let found;
  const visit = (node) => {
    if (!found && predicate(node)) found = node;
    ts.forEachChild(node, visit);
  };
  visit(readerAst);
  assert.ok(
    found,
    'The regression harness must execute a real reader function.',
  );
  return found;
}
function compileReader(source, resultName, bindings) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  // oxlint-disable-next-line typescript/no-implied-eval -- Execute only parsed repository UI code with deterministic mocks; never user content.
  return new Function(
    ...Object.keys(bindings),
    `${compiled}\nreturn ${resultName};`,
  )(...Object.values(bindings));
}
function readerFunction(name, bindings) {
  const node = findNode(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === name,
  );
  return compileReader(node.getText(readerAst), name, bindings);
}
function readerEffect(marker, bindings) {
  const node = findNode(
    (node) =>
      ts.isCallExpression(node) &&
      node.expression.getText(readerAst) === 'useEffect' &&
      node.arguments[0]?.getText(readerAst).includes(marker),
  );
  return compileReader(
    `const effect = ${node.arguments[0].getText(readerAst)};`,
    'effect',
    bindings,
  )();
}

const server = await createServer({
  configFile: false,
  cacheDir: 'node_modules/.vite-storybook-export-test',
  root: process.cwd(),
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false },
});

try {
  const { exportStorybookHtml, storybookChapterTitle, storybookWorldSvg } =
    await server.ssrLoadModule('/app/storybook-export.ts');
  const { forestKeepsakeSvg, forestKeepsakeMemory, getForestKeepsake } =
    await server.ssrLoadModule('/app/forest-keepsake-art.ts');
  const { default: CompanionStorybook } = await server.ssrLoadModule(
    '/app/companion-storybook.tsx',
  );
  // A valid one-pixel raster tests embedding without depending on network or DOM.
  const png =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
  const book = {
    id: 'offline-keepsake',
    title: '작은 친구의 커다란 마음',
    pages: [
      '첫 장. 반짝이는 숲에서 친구의 손을 꼭 잡았어요.',
      '둘째 장. 나뭇조각을 모아 물 위에 다리를 놓았어요.',
      '셋째 장. 작은 부엉이가 우리와 함께 노래했어요.',
      '넷째 장. 어두웠던 숲에 따뜻한 빛이 켜졌어요.',
      '다섯째 장. 집으로 돌아오는 길에도 친구의 손은 따뜻했어요.',
    ],
    createdAt: Date.UTC(2026, 8, 21),
    ending: '함께여서 용기가 났어요.',
    heroName: '달콩',
    heroAppearance: {
      kind: 'bunny',
      bodyColor: '#f4dfc1',
      accentColor: '#91c6a2',
      accessory: 'star',
    },
    choices: { route: 'river', owl: 'invite', ending: 'home' },
    sourcePhoto: 'PRIVATE_ORIGINAL_PHOTO',
    chatHistory: 'PRIVATE_CHAT_HISTORY',
  };
  const html = exportStorybookHtml(book, { image: png, name: '현재 이름' });
  assert.ok(html.startsWith('<!doctype html>'));
  assert.match(html, /<html lang="ko">/);
  assert.match(html, /charset="utf-8"/);
  assert.match(html, /script-src 'none'/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /@page\{size:A4 portrait/);
  assert.match(html, /break-after:page/);
  assert.equal((html.match(/data-story-page="\d+"/g) ?? []).length, 5);
  let previousIndex = -1;
  for (const page of book.pages) {
    const index = html.indexOf(page);
    assert.ok(
      index > previousIndex,
      'Every complete story page is exported in chronological order.',
    );
    previousIndex = index;
  }
  assert.ok(
    html.includes(book.ending),
    'The saved ending is included even if it is not in the final page.',
  );
  assert.equal(
    (html.match(/alt="달콩의 저장된 모습"/g) ?? []).length,
    6,
    'One same saved friend appears on cover and all five pages.',
  );
  assert.equal(
    html.includes('현재 이름'),
    false,
    'The book hero snapshot takes precedence over a later nickname.',
  );
  assert.equal(
    html.includes('PRIVATE_'),
    false,
    'Only explicit book fields enter the file, never photographs or chats.',
  );
  assert.doesNotMatch(
    html,
    /<(?:script|iframe|object|embed|link|form|base)\b/i,
  );
  assert.doesNotMatch(
    html,
    /\b(?:src|href|poster)="(?:https?:|\/\/|javascript:|file:)/i,
  );
  assert.doesNotMatch(html, /@import|url\(["']?https?:/i);
  const imageSources = [...html.matchAll(/<img\b[^>]*src="([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.ok(
    imageSources.length === 6 && imageSources.every((source) => source === png),
  );
  assert.match(html, /친구들의 집 앞을 밝혀 줄래/);
  assert.match(html, /우리 같이 부르자!/);
  assert.match(html, /첨벙! 시냇물 길/);
  assert.equal(
    forestKeepsakeSvg(book, 1),
    '',
    'Legacy books never acquire an invented companion or handmade marker.',
  );
  assert.deepEqual(forestKeepsakeMemory(book), []);
  for (const route of ['river', 'garden'])
    for (const design of ['star', 'heart']) {
      const routeDiscovery =
        route === 'river' ? 'secret-shell' : 'secret-mushroom';
      const editionTwo = {
        ...book,
        choices: {
          ...book.choices,
          route,
          craftDesign: design,
          discoveries: [routeDiscovery, 'secret-star'],
        },
      };
      const memory = getForestKeepsake(editionTwo);
      assert.equal(
        memory.friend,
        route === 'river' ? '수달 모모' : '토끼 포포',
      );
      assert.equal(memory.design, design);
      assert.equal(memory.discoveryLabels.length, 2);
      assert.equal(
        forestKeepsakeSvg(editionTwo, 0),
        '',
        'The route companion only joins after the first page.',
      );
      assert.equal(
        forestKeepsakeSvg(editionTwo, 5),
        '',
        'Keep illustration changes scoped to story pages two through five.',
      );
      assert.equal(forestKeepsakeSvg(editionTwo, NaN), '');
      const beforeGrove = forestKeepsakeSvg(editionTwo, 1);
      assert.match(beforeGrove, new RegExp(`data-craft-design="${design}"`));
      assert.match(
        beforeGrove,
        new RegExp(`data-discovery="${routeDiscovery}"`),
      );
      assert.doesNotMatch(
        beforeGrove,
        /data-discovery="secret-star"/,
        'A later forest discovery is not shown before the grove.',
      );
      assert.match(
        forestKeepsakeSvg(editionTwo, 4),
        /data-discovery="secret-star"/,
      );
      const kept = exportStorybookHtml(editionTwo, {
        image: png,
        illustrations: [png, png, png, png, png],
      });
      assert.equal(
        (kept.match(/data-forest-friend=/g) ?? []).length,
        4,
        'Companion and craft marker appear on all four later pages, including embedded raster backgrounds.',
      );
      assert.equal(
        (kept.match(/alt="달콩의 저장된 모습"/g) ?? []).length,
        6,
        'The child’s original hero stays present and remains the main character.',
      );
      assert.ok(kept.includes(memory.friend));
      assert.ok(kept.includes(memory.designLabel));
      for (const discovery of memory.discoveryLabels)
        assert.ok(kept.includes(discovery));
      assert.match(kept, /모험에 남긴 선택과 발견/);
      const screen = renderToStaticMarkup(
        React.createElement(CompanionStorybook, {
          book: editionTwo,
          fallbackName: '현재 친구',
          fallbackAppearance: book.heroAppearance,
        }),
      );
      assert.ok(
        screen.includes(encodeURIComponent(forestKeepsakeSvg(editionTwo, 1))),
        'Reader and offline HTML use the exact same trusted companion SVG.',
      );
      assert.match(screen, /csb-keepsake-memory/);
      assert.ok(screen.includes(memory.designLabel));
      for (const discovery of memory.discoveryLabels)
        assert.ok(screen.includes(discovery));
    }
  const unsafeKeepsake = {
    ...book,
    heroName: '<script>RAW_HERO</script>',
    choices: {
      ...book.choices,
      craftDesign: 'heart',
      discoveries: [
        'secret-shell',
        'secret-shell',
        'secret-mushroom',
        '<img src=x onerror=RAW_ATTACK>',
        'secret-star',
      ],
    },
  };
  assert.deepEqual(
    getForestKeepsake(unsafeKeepsake).discoveries,
    ['secret-shell', 'secret-star'],
    'Unknown, duplicate, and other-route discovery IDs are not rendered.',
  );
  assert.doesNotMatch(
    forestKeepsakeSvg(unsafeKeepsake, 4),
    /RAW_|onerror|<script|javascript:/,
  );
  assert.equal(
    forestKeepsakeSvg(
      {
        ...unsafeKeepsake,
        choices: { ...unsafeKeepsake.choices, craftDesign: '<script>' },
      },
      1,
    ),
    '',
  );
  assert.equal(
    forestKeepsakeSvg({ ...unsafeKeepsake, illustrationTheme: 'ocean' }, 1),
    '',
    'Illustrated world adventures are not retrofitted with forest-specific characters.',
  );
  assert.deepEqual(
    forestKeepsakeMemory({ ...unsafeKeepsake, illustrationTheme: 'space' }),
    [],
  );

  for (const route of ['river', 'garden'])
    for (const owl of ['listen', 'invite'])
      for (const ending of ['sky', 'home']) {
        const branch = exportStorybookHtml({
          ...book,
          choices: { route, owl, ending },
        });
        assert.ok(
          branch.includes(
            route === 'river' ? '첨벙! 시냇물 길' : '톡톡! 비밀 정원',
          ),
        );
        assert.ok(
          branch.includes(
            owl === 'listen'
              ? '천천히 해도 괜찮아. 내가 들어줄게.'
              : '우리 같이 부르자!',
          ),
        );
        assert.ok(
          branch.includes(
            ending === 'sky'
              ? '밤하늘에 별을 띄워 줄래'
              : '친구들의 집 앞을 밝혀 줄래',
          ),
        );
        assert.equal((branch.match(/data-story-page="\d+"/g) ?? []).length, 5);
      }

  const attack =
    '<script>alert("secret")</script><img src=x onerror="bad"> & \'quoted\'';
  const escaped = exportStorybookHtml({
    ...book,
    title: attack,
    heroName: attack,
    pages: [attack, '두 번째\n줄바꿈'],
    ending: attack,
  });
  assert.equal(escaped.includes(attack), false);
  assert.match(
    escaped,
    /&lt;script&gt;alert\(&quot;secret&quot;\)&lt;\/script&gt;/,
  );
  assert.match(escaped, /&amp; &#39;quoted&#39;/);
  assert.doesNotMatch(escaped, /<script\b|<img src=x|<[^>]+\sonerror=/i);
  assert.ok(
    escaped.includes('두 번째\n줄바꿈'),
    'Newlines are preserved rather than flattened.',
  );
  assert.match(escaped, /white-space:pre-wrap/);

  for (const maliciousImage of [
    'https://tracker.invalid/portrait.png',
    'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Pjwv c2NyaXB0Pjwvc3ZnPg==',
    'data:image/png;base64,PHN2ZyBvbmxvYWQ9ImJhZCI+PC9zdmc+',
    'data:image/png;base64,AAAA" onerror="bad',
    'javascript:alert(1)',
  ]) {
    assert.throws(
      () => exportStorybookHtml(book, { image: maliciousImage }),
      TypeError,
    );
    assert.throws(
      () => exportStorybookHtml(book, { illustrations: [maliciousImage] }),
      TypeError,
    );
  }
  const withBackground = exportStorybookHtml(book, {
    image: png,
    illustrations: [png],
  });
  assert.equal((withBackground.match(/<img\b/g) ?? []).length, 7);
  const legacy = exportStorybookHtml(
    {
      ...book,
      heroName: undefined,
      heroAppearance: undefined,
      choices: undefined,
    },
    { name: '새친구' },
  );
  assert.match(legacy, /새친구/);
  assert.match(legacy, /이전에 만든 책이라 선택 기록은 남아 있지 않아요/);
  assert.match(legacy, /파일을 만들 때 선택한 친구의 모습/);
  assert.doesNotMatch(legacy, /<img\b/);
  assert.equal((legacy.match(/이 이야기의 주인공/g) ?? []).length, 6);
  const longPages = Array.from(
    { length: 12 },
    (_, index) =>
      `${index + 1}장. ${'우리의 이야기는 빠짐없이 여기 남아요. '.repeat(20)}`,
  );
  const longBook = exportStorybookHtml({ ...book, pages: longPages });
  assert.equal((longBook.match(/data-story-page="\d+"/g) ?? []).length, 12);
  for (const page of longPages) assert.ok(longBook.includes(page));
  assert.throws(() => exportStorybookHtml({ ...book, pages: [] }), TypeError);
  assert.throws(() => exportStorybookHtml({ ...book, pages: [42] }), TypeError);
  for (const ending of ['sky', 'home']) {
    const oldForestBook = exportStorybookHtml({ ...book, ending });
    assert.ok(
      oldForestBook.includes(`<p class="ending">${book.pages.at(-1)}</p>`),
    );
    assert.doesNotMatch(oldForestBook, /<p class="ending">(?:sky|home)<\/p>/);
  }

  const { adventureStories } = await server.ssrLoadModule('/app/adventures.ts');
  const {
    createCompanionSave,
    sanitizeCompanionSave,
    serializeCompanionBackup,
    parseCompanionBackup,
  } = await server.ssrLoadModule('/app/companion-save.ts');
  const fresh = createCompanionSave();
  const illustrations = new Set();
  for (const adventure of adventureStories) {
    const worldBook = {
      ...book,
      id: `legacy-world-${adventure.id}`,
      title: adventure.title,
      pages: adventure.scenes.map((scene) => scene.body),
      chapterTitles: adventure.scenes.map((scene) => scene.title),
      illustrationTheme: adventure.color,
      choices: undefined,
      ending: adventure.endings.kindness,
    };
    const save = sanitizeCompanionSave({ ...fresh, storyBooks: [worldBook] });
    assert.ok(save, `${adventure.id} saves as a complete illustrated book`);
    assert.deepEqual(save.storyBooks[0].chapterTitles, worldBook.chapterTitles);
    assert.equal(save.storyBooks[0].illustrationTheme, adventure.color);
    const portable = serializeCompanionBackup(save);
    assert.equal(portable.ok, true);
    const backup = parseCompanionBackup(portable.json);
    assert.equal(backup.ok, true);
    assert.deepEqual(
      backup.save.storyBooks[0],
      save.storyBooks[0],
      'World and chapter snapshots round-trip through backup.',
    );
    const worldHtml = exportStorybookHtml(save.storyBooks[0], {
      image: png,
      illustrations: [png],
    });
    assert.equal(
      (
        worldHtml.match(new RegExp(`data-world="${adventure.color}"`, 'g')) ??
        []
      ).length,
      worldBook.pages.length,
    );
    assert.doesNotMatch(
      worldHtml,
      /moon-forest-scene|숲이 우리를 불렀어|작은 손으로 만든 길|부엉이에게 건넨 말/,
    );
    assert.equal(
      (worldHtml.match(/<img\b/g) ?? []).length,
      worldBook.pages.length + 1,
      'Raster supplied as a forest fallback is ignored for an explicit world; only the saved hero remains.',
    );
    for (const [index, title] of worldBook.chapterTitles.entries()) {
      assert.equal(storybookChapterTitle(worldBook, index), title);
      assert.ok(worldHtml.includes(title));
    }
    assert.match(worldHtml, /우리가 고른 행동은 각 장의 이야기에 담겨 있어요/);
    assert.doesNotMatch(
      worldHtml,
      /<script\b|<iframe\b|\sonload=|\sonerror=|(?:src|href)="https?:/i,
    );
    const scene = storybookWorldSvg(adventure.color, 0);
    assert.notEqual(scene, storybookWorldSvg(adventure.color, 1));
    illustrations.add(scene);
  }
  assert.equal(
    illustrations.size,
    8,
    'All eight worlds have distinct code-native illustrations.',
  );
  const exactTitles = book.pages.map((_, index) => `${index + 1}장`);
  // Intentionally sparse: Array.prototype.some would incorrectly skip these holes.
  const sparsePages = [];
  sparsePages.length = book.pages.length;
  for (const chapterTitles of [
    null,
    'bad',
    [],
    ['짧은 배열'],
    [...exactTitles, '초과'],
    [42, ...exactTitles.slice(1)],
    ['', ...exactTitles.slice(1)],
    ['가'.repeat(81), ...exactTitles.slice(1)],
    sparsePages,
  ]) {
    assert.equal(
      sanitizeCompanionSave({
        ...fresh,
        storyBooks: [{ ...book, chapterTitles }],
      }),
      null,
    );
    assert.throws(
      () => exportStorybookHtml({ ...book, chapterTitles }),
      TypeError,
    );
  }
  for (const illustrationTheme of [
    null,
    1,
    'moon',
    '__proto__',
    'constructor',
    'ocean" onload="bad',
  ]) {
    assert.equal(
      sanitizeCompanionSave({
        ...fresh,
        storyBooks: [{ ...book, illustrationTheme }],
      }),
      null,
    );
    assert.throws(
      () => exportStorybookHtml({ ...book, illustrationTheme }),
      TypeError,
    );
  }
  assert.equal(
    sanitizeCompanionSave({
      ...fresh,
      storyBooks: [{ ...book, pages: sparsePages }],
    }),
    null,
  );
  assert.throws(
    () => exportStorybookHtml({ ...book, pages: sparsePages }),
    TypeError,
  );
  assert.equal(
    sanitizeCompanionSave({ ...fresh, storyBooks: [book] }).storyBooks[0]
      .chapterTitles,
    undefined,
  );
  assert.equal(
    storybookChapterTitle({ ...book, illustrationTheme: 'forest' }, 0),
    '1번째 이야기',
    'Legacy moon books never inherit the new forest plot headings.',
  );
  const chapterAttack = '<img src=x onerror="bad">';
  const chapterEscaped = exportStorybookHtml({
    ...book,
    chapterTitles: book.pages.map(() => chapterAttack),
    illustrationTheme: 'ocean',
  });
  assert.ok(
    chapterEscaped.includes('&lt;img src=x onerror=&quot;bad&quot;&gt;'),
  );
  assert.doesNotMatch(chapterEscaped, /<img src=x|<[^>]+\sonerror=/);
  const reader = readerSource;
  assert.match(
    reader,
    /storybookChapterTitle\(book, activePage\)/,
    'Narration uses the saved chapter heading.',
  );
  assert.match(
    reader,
    /book\.illustrationTheme\s*\?\s*\[\]\s*:\s*await Promise\.all/,
    'World books make no forest-raster fetch during offline export.',
  );
  assert.match(
    reader,
    /!theme && <SceneDetails/,
    'New forest plot overlays cannot leak into other worlds.',
  );

  // Execute the actual async UI handler, retaining control of late responses.
  function exportHarness({
    pages = book.pages,
    theme,
    failOnAbort = false,
  } = {}) {
    const exportJob = { current: null };
    const pending = [];
    const downloads = [];
    const statuses = [];
    const exporting = [];
    const timers = new Map();
    const listeners = new Map();
    const exportOptions = [];
    const frame = {
      current: {
        closest: (selector) => {
          assert.equal(selector, 'dialog');
          return {
            addEventListener: (name, callback) => listeners.set(name, callback),
            removeEventListener: (name) => listeners.delete(name),
          };
        },
      },
    };
    const bindings = {
      exportJob,
      book: { ...book, pages, illustrationTheme: theme },
      name: '달콩',
      portrait: { src: png },
      window: {
        setTimeout: (callback, delay) => {
          assert.equal(delay, 15_000);
          timers.set(1, callback);
          return 1;
        },
        clearTimeout: (id) => timers.delete(id),
      },
      setExporting: (value) => exporting.push(value),
      setExportStatus: (value) => statuses.push(value),
      loadStorybookIllustration: (scene, signal) =>
        new Promise((resolve, reject) => {
          pending.push({ scene, signal, resolve });
          if (failOnAbort)
            signal.addEventListener('abort', () => reject(signal.reason), {
              once: true,
            });
        }),
      exportStorybookHtml: (value, options) => {
        exportOptions.push(options);
        return exportStorybookHtml(value, options);
      },
      downloadLocalFile: (...args) => downloads.push(args),
    };
    return {
      exportJob,
      pending,
      downloads,
      statuses,
      exporting,
      timers,
      listeners,
      exportOptions,
      keep: readerFunction('keepBook', bindings),
      cancel: readerFunction('cancelBookExport', { exportJob }),
      cleanup: readerEffect("modal?.addEventListener('cancel'", {
        frame,
        exportJob,
      }),
      resolve: () => pending.forEach((request) => request.resolve(png)),
    };
  }
  const completeExport = exportHarness({ pages: longPages });
  const firstExport = completeExport.keep();
  await completeExport.keep();
  assert.equal(
    completeExport.pending.length,
    5,
    'At most five distinct local backgrounds are requested, even after an immediate second click or for a 12-page book.',
  );
  completeExport.resolve();
  await firstExport;
  assert.equal(completeExport.downloads.length, 1);
  assert.equal(completeExport.exportOptions[0].illustrations.length, 12);
  assert.ok(
    completeExport.exportOptions[0].illustrations.every(
      (value) => value === png,
    ),
  );
  assert.deepEqual(completeExport.exporting, [true, false]);
  assert.equal(completeExport.timers.size, 0);
  completeExport.cleanup();

  for (const exit of ['button', 'cancel', 'close', 'unmount']) {
    const canceled = exportHarness();
    const operation = canceled.keep();
    if (exit === 'button') canceled.cancel();
    else if (exit === 'unmount') canceled.cleanup();
    else canceled.listeners.get(exit)();
    assert.ok(canceled.pending.every((request) => request.signal.aborted));
    const statusesAtClose = canceled.statuses.length;
    // A response that ignores abort may still arrive after close; it must be inert.
    canceled.resolve();
    await operation;
    assert.equal(
      canceled.downloads.length,
      0,
      `${exit}: no surprise late download`,
    );
    assert.equal(
      canceled.statuses.length,
      statusesAtClose,
      `${exit}: no stale status update`,
    );
    assert.deepEqual(
      canceled.exporting,
      [true],
      `${exit}: no state updates after close`,
    );
    assert.equal(canceled.exportJob.current, null);
    assert.equal(canceled.timers.size, 0);
    canceled.cleanup();
    assert.equal(canceled.listeners.size, 0);
  }
  const timedOut = exportHarness({ failOnAbort: true });
  const timeoutOperation = timedOut.keep();
  timedOut.timers.get(1)();
  await timeoutOperation;
  assert.equal(timedOut.downloads.length, 0);
  assert.match(timedOut.statuses.at(-1), /시간이 오래 걸려/);
  assert.deepEqual(
    timedOut.exporting,
    [true, false],
    'A timeout leaves the retry action available.',
  );
  assert.equal(timedOut.exportJob.current, null);
  timedOut.cleanup();
  const worldExport = exportHarness({ theme: 'ocean' });
  await worldExport.keep();
  assert.equal(worldExport.pending.length, 0);
  assert.equal(worldExport.downloads.length, 1);
  worldExport.cleanup();

  // Abort is forwarded to actual fetch and to a FileReader already in progress.
  const rasterReads = [];
  let rasterAborts = 0;
  let responseSize = 50;
  let responseType = 'image/webp';
  const loadIllustration = readerFunction('loadStorybookIllustration', {
    fetch: async (url, options) => {
      assert.equal(url, '/moon-forest-scene-2.webp');
      assert.ok(options.signal instanceof AbortSignal);
      return {
        ok: true,
        blob: async () => ({ size: responseSize, type: responseType }),
      };
    },
    FileReader: class {
      result = png;
      readAsDataURL() {
        rasterReads.push(this);
      }
      abort() {
        rasterAborts += 1;
      }
    },
  });
  const rasterJob = new AbortController();
  const rasterRead = loadIllustration(2, rasterJob.signal);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(rasterReads.length, 1);
  rasterJob.abort();
  await assert.rejects(rasterRead, { name: 'AbortError' });
  assert.equal(rasterAborts, 1);
  assert.equal(rasterReads[0].onload, null);
  assert.equal(rasterReads[0].onerror, null);
  responseSize = 4 * 1024 * 1024 + 1;
  assert.equal(await loadIllustration(2, new AbortController().signal), null);
  responseSize = 10;
  responseType = 'text/html';
  assert.equal(await loadIllustration(2, new AbortController().signal), null);
  assert.equal(
    rasterReads.length,
    1,
    'Oversized or HTML error responses never enter raster decoding.',
  );

  // Page change never touches window/document scrolling, even at the boundaries.
  const changedPages = [];
  let stoppedSpeech = 0;
  const pageMoved = { current: false };
  const changePage = readerFunction('changePage', {
    book,
    activePage: 0,
    pageMoved,
    stopSpeech: () => stoppedSpeech++,
    setSpeechError: () => {},
    setPage: (next) => changedPages.push(next),
  });
  changePage(-1);
  changePage(NaN);
  changePage(1.5);
  assert.equal(changedPages.length, 0);
  changePage(99);
  assert.deepEqual(changedPages, [4]);
  assert.equal(
    stoppedSpeech,
    1,
    'A real page change stops the previous narration.',
  );
  assert.equal(pageMoved.current, true);
  const scrollActions = [];
  const frame = {
    current: {
      focus: (options) => scrollActions.push(['focus', options]),
      closest: (selector) => {
        assert.equal(selector, 'dialog');
        return {
          scrollTo: (options) => scrollActions.push(['dialog', options]),
        };
      },
    },
  };
  readerEffect('pageMoved.current', { pageMoved, frame });
  assert.deepEqual(scrollActions, [
    ['focus', { preventScroll: true }],
    ['dialog', { top: 0, behavior: 'instant' }],
  ]);
  assert.equal(pageMoved.current, false);
  readerEffect('pageMoved.current', { pageMoved, frame });
  assert.equal(
    scrollActions.length,
    2,
    'Initial render does not unexpectedly move focus or scroll.',
  );
  assert.doesNotMatch(reader, /\.scrollIntoView\(/);
  const keyboardPages = [];
  const handlePageKey = readerFunction('handlePageKey', {
    book,
    activePage: 2,
    changePage: (next) => keyboardPages.push(next),
  });
  for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
    let prevented = false;
    let stopped = false;
    handlePageKey({
      key,
      nativeEvent: {},
      preventDefault: () => {
        prevented = true;
      },
      stopPropagation: () => {
        stopped = true;
      },
    });
    assert.ok(prevented && stopped);
  }
  assert.deepEqual(keyboardPages, [1, 3, 0, 4]);
  for (const override of [
    { key: 'Tab' },
    { ctrlKey: true },
    { shiftKey: true },
    { altKey: true },
    { metaKey: true },
    { nativeEvent: { isComposing: true } },
    { defaultPrevented: true },
  ]) {
    handlePageKey({ key: 'ArrowRight', nativeEvent: {}, ...override });
  }
  assert.equal(
    keyboardPages.length,
    4,
    'Browser shortcuts, Tab and composing input are not intercepted.',
  );

  const styles = postcss.parse(
    readFileSync('app/companion-storybook.css', 'utf8'),
  );
  const lockedSelectors = new Set();
  styles.walkRules((rule) => {
    if (!rule.selector.includes(':has(.cw-book-dialog[open]')) return;
    assert.equal(rule.parent.type, 'atrule');
    assert.equal(
      rule.parent.params,
      'screen',
      'Body scroll lock must never clip printed pages.',
    );
    for (const selector of rule.selectors) lockedSelectors.add(selector);
    assert.ok(
      rule.nodes.some(
        (declaration) =>
          declaration.prop === 'overflow' && declaration.value === 'hidden',
      ),
    );
  });
  assert.ok(lockedSelectors.has('html:has(.cw-book-dialog[open] .csb-reader)'));
  assert.ok(lockedSelectors.has('body:has(.cw-book-dialog[open] .csb-reader)'));
  let touchTargets = 0;
  styles.walkRules('.csb-page-dots > button', (rule) => {
    assert.ok(
      rule.nodes.some(
        (declaration) =>
          declaration.prop === 'width' && declaration.value === '44px',
      ),
    );
    assert.ok(
      rule.nodes.some(
        (declaration) =>
          declaration.prop === 'height' && declaration.value === '44px',
      ),
    );
    touchTargets++;
  });
  assert.equal(
    touchTargets,
    1,
    'Mobile must not override the 44px page targets with tiny buttons.',
  );
  console.log(
    'Offline storybook export passed: complete ordered pages, immutable hero, all branches/worlds, escaping/raster/print safety, canceled-close/unmount/timeout and duplicate download races, scoped modal scroll, keyboard pages and 44px mobile targets.',
  );
} finally {
  await server.close();
}
