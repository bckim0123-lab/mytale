import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  cacheDir: 'node_modules/.vite-storybook-export-test',
  root: process.cwd(),
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
});

try {
  const { exportStorybookHtml, storybookChapterTitle, storybookWorldSvg } =
    await server.ssrLoadModule('/app/storybook-export.ts');
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
  const reader = readFileSync('app/companion-storybook.tsx', 'utf8');
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
  console.log(
    'Offline storybook export passed: complete ordered pages, immutable hero, 8 forest branches + 8 illustrated worlds, strict chapter/theme validation and backup round-trip, legacy compatibility, script/network-free HTML, escaping, raster validation and print layout rules.',
  );
} finally {
  await server.close();
}
