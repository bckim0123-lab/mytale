import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import ts from 'typescript';
import { createServer } from 'vite';

const nativeRequire = createRequire(import.meta.url);
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  cacheDir: 'node_modules/.vite-bookshelf-test',
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false },
});
try {
  const art = await server.ssrLoadModule('/app/storybook-export.ts');
  const source = readFileSync('app/companion-bookshelf.tsx', 'utf8');
  const exports = {};
  let previewCalls = [];
  let previewLibrary = {};
  let requestedPage = 0;
  let refIndex = 0,
    focusCalls = 0;
  const refs = [],
    effects = [];
  runInNewContext(
    ts.transpileModule(source, {
      fileName: 'companion-bookshelf.tsx',
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText,
    {
      exports,
      require(name) {
        if (name.endsWith('.css')) return {};
        if (name === './storybook-export') return art;
        if (name === './use-drawing-previews')
          return {
            useDrawingPreviews(ids) {
              previewCalls.push([...ids]);
              return Object.fromEntries(
                ids
                  .filter((id) => previewLibrary[id])
                  .map((id) => [id, previewLibrary[id]]),
              );
            },
          };
        if (name === 'react')
          return {
            ...React,
            useRef(initial) {
              const index = refIndex++;
              return (refs[index] ??= { current: initial });
            },
            useEffect(effect) {
              effects.push(effect);
            },
            useState: () => [
              requestedPage,
              (value) => {
                requestedPage =
                  typeof value === 'function' ? value(requestedPage) : value;
              },
            ],
          };
        assert.ok(
          ['react/jsx-runtime', 'lucide-react'].includes(name),
          'Covers load through one bounded preview hook, never a network or WebGL renderer',
        );
        return nativeRequire(name);
      },
    },
  );
  const {
    default: Shelf,
    bookshelfCover,
    bookshelfPage,
    BOOKS_PER_SHELF,
  } = exports;
  assert.equal(BOOKS_PER_SHELF, 6);
  const appearance = {
    kind: 'bunny',
    bodyColor: '#ffffff',
    accentColor: '#ffffff',
    accessory: 'star',
    drawingAssetId: 'a'.repeat(64),
  };
  const books = Array.from({ length: 100 }, (_, index) => ({
    id: `book-${index}`,
    title: `나의 ${index}번째 이야기`,
    heroName: '그날의 달콩',
    heroAppearance: appearance,
    createdAt: 1,
    pages: ['하나', '둘'],
    ending: '함께했어요',
    choices: { route: 'river', owl: 'invite', ending: 'sky' },
  }));
  const assets = {
    [appearance.drawingAssetId]: 'data:image/png;base64,c2F2ZWQ=',
    'current-friend': 'CURRENT_FRIEND_MUST_NOT_APPEAR',
  };
  previewLibrary = assets;
  assert.equal(
    bookshelfCover(books[0], assets).hero,
    assets[appearance.drawingAssetId],
  );
  assert.equal(
    bookshelfCover(books[0], assets).caption,
    '그날의 달콩의 이야기',
  );
  assert.equal(
    bookshelfCover({ ...books[0], heroAppearance: undefined }, assets).hero,
    undefined,
  );
  assert.equal(
    bookshelfCover(books[0], {}).hero,
    undefined,
    'Missing historical art never borrows the current friend',
  );
  for (const theme of [
    'forest',
    'ocean',
    'cloud',
    'space',
    'dino',
    'candy',
    'aurora',
    'garden',
  ])
    assert.ok(
      bookshelfCover(
        { ...books[0], illustrationTheme: theme },
        assets,
      ).background.includes(encodeURIComponent(`data-world="${theme}"`)),
    );
  assert.match(
    bookshelfCover(
      { ...books[0], choices: { ...books[0].choices, ending: 'home' } },
      assets,
    ).background,
    /scene-4/,
  );
  for (let count = 0; count <= 100; count++) {
    const seen = [];
    for (let page = 0; page < bookshelfPage(count, 0).pages; page++) {
      const range = bookshelfPage(count, page);
      assert.ok(range.end - range.start <= 6);
      for (let i = range.start; i < range.end; i++) seen.push(i);
    }
    assert.deepEqual(
      seen,
      Array.from({ length: count }, (_, i) => i),
    );
    assert.equal(bookshelfPage(count, 999).end, count);
  }
  const nodes = (element, result = []) => {
    if (!element || typeof element !== 'object') return result;
    result.push(element);
    React.Children.forEach(element.props?.children, (child) =>
      nodes(child, result),
    );
    return result;
  };
  let opened;
  const render = (selectedBooks = books) => {
    refIndex = 0;
    const tree = Shelf({
      books: selectedBooks,
      onOpen: (book) => {
        opened = book;
      },
    });
    refs[0].current = { focus: () => focusCalls++ };
    effects.splice(0).forEach((effect) => effect());
    return tree;
  };
  const first = render();
  assert.equal(previewCalls.at(-1).length, 6);
  assert.ok(
    previewCalls.at(-1).every((id) => id === appearance.drawingAssetId),
  );
  assert.equal(focusCalls, 0, 'Opening the shelf does not steal focus');
  const html = renderToStaticMarkup(first);
  assert.equal((html.match(/class="cbl-book"/g) ?? []).length, 6);
  assert.doesNotMatch(
    html,
    /CURRENT_FRIEND_MUST_NOT_APPEAR|지금 바꾼 이름|<canvas/,
  );
  const images = nodes(first).filter((node) => node.type === 'img');
  assert.ok(
    images.every(
      (node) => node.props.loading === 'lazy' && node.props.alt === '',
    ),
  );
  nodes(first)
    .find((node) => node.props?.className === 'cbl-book')
    .props.onClick();
  assert.strictEqual(opened, books[0]);
  nodes(first)
    .find((node) => node.props?.['aria-label'] === '다음 책장')
    .props.onClick();
  assert.equal(requestedPage, 1);
  let second = render();
  assert.equal(focusCalls, 1, 'Turning a shelf brings focus to its first book');
  nodes(second)
    .find((node) => node.props?.className === 'cbl-book')
    .props.onClick();
  assert.strictEqual(opened, books[6]);
  assert.equal(
    requestedPage,
    1,
    'Opening a book does not reset the shelf page',
  );
  for (let page = 1; page < 16; page++) {
    nodes(second)
      .find((node) => node.props?.['aria-label'] === '다음 책장')
      .props.onClick();
    second = render();
  }
  assert.equal(
    nodes(second).filter((node) => node.props?.className === 'cbl-book').length,
    4,
  );
  assert.equal(
    nodes(second).find((node) => node.props?.['aria-label'] === '다음 책장')
      .props.disabled,
    true,
  );
  assert.equal(
    nodes(render(books.slice(0, 2))).filter(
      (node) => node.props?.className === 'cbl-book',
    ).length,
    2,
    'A shorter restored library clamps the visible shelf',
  );
  const attack = renderToStaticMarkup(
    render([{ ...books[0], title: '<script>secret</script>' }]),
  );
  assert.doesNotMatch(attack, /<script>/);
  assert.match(attack, /&lt;script&gt;/);
  requestedPage = 1;
  previewCalls = [];
  const distinctBooks = books.slice(0, 12).map((book, index) => ({
    ...book,
    heroAppearance: {
      ...appearance,
      drawingAssetId: index.toString(16).padStart(64, '0'),
    },
  }));
  render(distinctBooks);
  assert.deepEqual(
    previewCalls[0],
    distinctBooks
      .slice(6, 12)
      .map((book) => book.heroAppearance.drawingAssetId),
    'Only the current shelf asks for historical preview IDs.',
  );
  assert.doesNotMatch(source, /listDrawingAssets|<canvas|artLibrary/);
  const css = readFileSync('app/companion-bookshelf.css', 'utf8');
  assert.match(css, /object-fit: contain/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  const homeCss = readFileSync('app/companion.css', 'utf8');
  assert.match(
    homeCss,
    /@media \(max-width: 760px\) \{[\s\S]*?\.cw-home-stage \{\s*position: relative;/,
    'The mobile home stage must not cover focused books or friend cards',
  );
  console.log(
    'Bookshelf passed: historical hero identity, 8 worlds, all 0–100 book counts, six-cover/preview cap, paging/open/restore continuity, bounded local preview hook, lazy decorative images and escaping.',
  );
} finally {
  await server.close();
}
