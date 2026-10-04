import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import postcss from 'postcss';
import { createServer } from 'vite';

const nativeRequire = createRequire(import.meta.url);
const tick = () => new Promise((resolve) => setImmediate(resolve));
const compile = (path) =>
  ts.transpileModule(readFileSync(path, 'utf8'), {
    fileName: path,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
function hookState(runEffects = true) {
  const slots = [];
  let cursor = 0,
    effects = [];
  return {
    hooks: {
      useState(initial) {
        const index = cursor++;
        if (!(index in slots))
          slots[index] = {
            value: typeof initial === 'function' ? initial() : initial,
          };
        return [
          slots[index].value,
          (value) => {
            slots[index].value =
              typeof value === 'function' ? value(slots[index].value) : value;
          },
        ];
      },
      useRef(initial) {
        return (slots[cursor++] ??= { current: initial });
      },
      useId() {
        return (slots[cursor++] ??= `reader-${cursor}`);
      },
      useEffect(work, dependencies) {
        const index = cursor++;
        const previous = slots[index];
        if (
          !previous ||
          dependencies.some(
            (value, i) => !Object.is(value, previous.dependencies[i]),
          )
        ) {
          const next = { dependencies: [...dependencies] };
          slots[index] = next;
          effects.push(() => {
            previous?.cleanup?.();
            next.cleanup = work();
          });
        }
      },
    },
    render(work) {
      cursor = 0;
      effects = [];
      const value = work();
      if (runEffects) for (const effect of effects) effect();
      return value;
    },
    dispose() {
      for (const slot of slots) slot?.cleanup?.();
    },
    seedPortrait(value) {
      const slot = slots.find((entry) => entry?.value?.signature !== undefined);
      assert.ok(
        slot,
        'The actual hook owns a signature-scoped portrait state.',
      );
      slot.value = value;
    },
  };
}
const portraitCode = compile('app/companion-portrait.tsx');
function portraitHarness() {
  const hooks = hookState();
  const reads = [];
  const listeners = new Map();
  let rendererAttempts = 0;
  const common = {
    queueMicrotask,
    window: {
      addEventListener: (name, handler) => listeners.set(name, handler),
      removeEventListener: (name) => listeners.delete(name),
    },
  };
  const drawing = {};
  runInNewContext(compile('app/use-drawing-asset.ts'), {
    ...common,
    exports: drawing,
    require(name) {
      if (name === 'react') return hooks.hooks;
      assert.equal(name, './drawing-assets');
      return {
        readDrawingAsset(id) {
          return new Promise((resolve, reject) =>
            reads.push({ id, resolve, reject }),
          );
        },
      };
    },
  });
  const exports = {};
  runInNewContext(portraitCode, {
    ...common,
    exports,
    require(name) {
      if (name === 'react') return hooks.hooks;
      if (name === './use-drawing-asset') return drawing;
      if (name === 'three')
        return {
          WebGLRenderer: class {
            constructor() {
              rendererAttempts++;
              throw new Error('Unavailable GPU');
            }
          },
        };
      if (
        name === './creature-rig' ||
        name === 'three/examples/jsm/environments/RoomEnvironment.js'
      )
        return {};
      assert.equal(name, 'react/jsx-runtime');
      return nativeRequire(name);
    },
  });
  return {
    reads,
    exports,
    listeners,
    render: (appearance) =>
      hooks.render(() => exports.useCompanionPortrait(appearance)),
    dispose: () => hooks.dispose(),
    seedPortrait: (value) => hooks.seedPortrait(value),
    rendererAttempts: () => rendererAttempts,
  };
}
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const appearance = {
  kind: 'bunny',
  bodyColor: '#b6dced',
  accentColor: '#f8d1da',
  accessory: 'none',
  drawingAssetId: 'a'.repeat(64),
};
const otherAppearance = { ...appearance, drawingAssetId: 'b'.repeat(64) };
const portraits = portraitHarness();
let portrait = portraits.render(appearance);
assert.deepEqual(JSON.parse(JSON.stringify(portrait)), {
  src: null,
  loading: true,
  unavailable: false,
});
assert.equal(portraits.reads[0].id, appearance.drawingAssetId);
portraits.reads[0].resolve(undefined);
await tick();
portrait = portraits.render(appearance);
assert.equal(portrait.loading, false);
assert.equal(portrait.unavailable, true);
assert.match(portrait.unavailableMessage, /이 기기에 친구 그림이 없어요.*백업/);
const missing = { ...portrait };
const missingMarkup = renderToStaticMarkup(
  React.createElement(portraits.exports.CompanionPortrait, {
    portrait,
    name: '그때의 친구',
  }),
);
assert.match(missingMarkup, /그림이 포함된 백업/);
assert.doesNotMatch(
  missingMarkup,
  /이 기기에서는 친구의 입체 모습을 표시할 수 없어요/,
);
portraits.listeners.get('drawing-friend-artworks-changed')();
portraits.render(appearance);
await tick();
portrait = portraits.render(appearance);
assert.equal(
  portrait.loading,
  true,
  'A backup recovery read is pending, not a confirmed missing image.',
);
assert.equal(portrait.unavailable, false);
portraits.reads.at(-1).resolve({ png });
await tick();
portrait = portraits.render(appearance);
assert.equal(portrait.src, png);
assert.equal(portrait.loading, false);
assert.equal(portrait.unavailable, false);
portraits.listeners.get('focus')();
portraits.render(appearance);
await tick();
portrait = portraits.render(appearance);
assert.equal(
  portrait.src,
  png,
  'A same-ID refresh can keep its own image visible.',
);
assert.equal(
  portrait.loading,
  true,
  'Exports still wait for the in-progress image check.',
);
portraits.reads.at(-1).resolve({ png });
await tick();
portrait = portraits.render(otherAppearance);
assert.equal(
  portrait.src,
  null,
  'Changing identity never borrows the previous PNG, even before effects run.',
);
assert.equal(portrait.loading, true);
portraits.reads.at(-1).reject(new Error('Read failure'));
await tick();
portrait = portraits.render(otherAppearance);
assert.equal(portrait.loading, false);
assert.match(portrait.unavailableMessage, /읽지 못했어요.*백업/);
assert.equal(
  portraits.rendererAttempts(),
  0,
  'Missing generated friends never turn into a stock creature.',
);
portraits.dispose();
const stock = portraitHarness();
stock.render({ ...appearance, drawingAssetId: undefined });
await tick();
const failedStock = stock.render({ ...appearance, drawingAssetId: undefined });
assert.equal(failedStock.loading, false);
assert.equal(failedStock.unavailable, true);
assert.match(
  renderToStaticMarkup(
    React.createElement(stock.exports.CompanionPortrait, {
      portrait: failedStock,
      name: '기본 친구',
    }),
  ),
  /이 기기에서는 친구의 입체 모습을 표시할 수 없어요/,
);
assert.equal(stock.rendererAttempts(), 1);
stock.seedPortrait({
  signature: JSON.stringify({ ...appearance, drawingAssetId: undefined }),
  src: png,
  loading: false,
  unavailable: false,
});
const nextStock = stock.render({
  ...appearance,
  kind: 'bear',
  drawingAssetId: undefined,
});
assert.equal(
  nextStock.src,
  null,
  'A different stock hero also hides the prior portrait before its next render completes.',
);
assert.equal(nextStock.loading, true);
stock.dispose();

function nodes(element, result = []) {
  if (!React.isValidElement(element)) return result;
  result.push(element);
  React.Children.forEach(element.props.children, (child) =>
    nodes(child, result),
  );
  return result;
}
function text(element) {
  if (typeof element === 'string' || typeof element === 'number')
    return String(element);
  return React.Children.toArray(element?.props?.children).map(text).join('');
}
const find = (tree, predicate) => {
  const node = nodes(tree).find(predicate);
  assert.ok(node);
  return node;
};
const book = {
  id: 'historical-book',
  title: '그때의 친구와 밝힌 집 앞',
  createdAt: 1,
  heroName: '그때의 친구',
  heroAppearance: appearance,
  pages: [
    '친구와 출발했어요.',
    '하트표 다리를 만들었어요.',
    '부엉이를 초대했어요.',
    '집 앞까지 빛을 나누었어요.',
    '친구들이 밝은 길로 돌아갔어요.',
  ],
  ending: '다음에 또 만나자.',
  choices: {
    route: 'river',
    owl: 'invite',
    ending: 'home',
    craftDesign: 'heart',
  },
};
const server = await createServer({
  configFile: false,
  cacheDir: 'node_modules/.vite-reader-state-test',
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false },
});
try {
  const modules = new Map();
  for (const name of [
    'storybook-export',
    'forest-keepsake-art',
    'forest-home-ending-art',
  ])
    modules.set(`./${name}`, await server.ssrLoadModule(`/app/${name}.ts`));
  const readerCode = compile('app/companion-storybook.tsx');
  function readerHarness(initialPortrait, readerBook = book) {
    const hooks = hookState(false);
    const downloads = [],
      requestedAppearances = [];
    let currentPortrait = initialPortrait,
      fetches = 0,
      prints = 0;
    const exports = {};
    runInNewContext(readerCode, {
      exports,
      AbortController,
      window: { setTimeout: () => 1, clearTimeout() {}, print: () => prints++ },
      fetch: async () => {
        fetches++;
        return { ok: false };
      },
      require(name) {
        if (name === 'react') return hooks.hooks;
        if (name === './companion-portrait')
          return {
            CompanionPortrait: portraits.exports.CompanionPortrait,
            useCompanionPortrait(value) {
              requestedAppearances.push(value);
              return currentPortrait;
            },
          };
        if (name === './drawing-assets')
          return { downloadLocalFile: (...args) => downloads.push(args) };
        if (name === './local-speech')
          return { cancelLocalSpeech() {}, localKoreanVoice: () => null };
        if (name.endsWith('.css')) return {};
        if (modules.has(name)) return modules.get(name);
        assert.ok(['react/jsx-runtime', 'lucide-react'].includes(name));
        return nativeRequire(name);
      },
    });
    return {
      downloads,
      requestedAppearances,
      fetches: () => fetches,
      prints: () => prints,
      render(value = currentPortrait) {
        currentPortrait = value;
        return hooks.render(() => {
          const outer = exports.CompanionStorybook({
            book: readerBook,
            fallbackName: '현재 다른 친구',
            fallbackAppearance: otherAppearance,
          });
          return outer.type(outer.props);
        });
      },
    };
  }
  for (const state of [
    { src: null, loading: true, unavailable: false },
    { src: png, loading: true, unavailable: false },
    { src: null, loading: false, unavailable: false },
  ]) {
    const test = readerHarness(state);
    const tree = test.render();
    const save = find(
      tree,
      (node) => node.props['aria-label'] === '동화책 파일 저장',
    );
    const print = find(
      tree,
      (node) => node.props['aria-label'] === '책 전체 인쇄',
    );
    assert.equal(save.props.disabled, true);
    assert.equal(print.props.disabled, true);
    save.props.onClick();
    print.props.onClick();
    await tick();
    assert.equal(
      test.fetches(),
      0,
      'Even directly invoking the disabled handler cannot start an incomplete export.',
    );
    assert.equal(test.downloads.length, 0);
    assert.equal(test.prints(), 0);
  }
  for (const state of [missing, failedStock]) {
    const test = readerHarness(state);
    let tree = test.render();
    const save = find(
      tree,
      (node) => node.props['aria-label'] === '친구 그림 없이 동화책 파일 저장',
    );
    assert.equal(save.props.disabled, false);
    assert.match(text(save), /친구 그림 없이 저장/);
    assert.match(
      text(
        find(
          tree,
          (node) => node.props['aria-label'] === '친구 그림 없이 책 전체 인쇄',
        ),
      ),
      /친구 그림 없이 인쇄/,
    );
    save.props.onClick();
    await tick();
    tree = test.render();
    assert.equal(test.downloads.length, 1);
    const html = test.downloads[0][1];
    assert.match(html, /hero-placeholder/);
    assert.doesNotMatch(html, /<img class="hero|현재 다른 친구/);
    assert.match(
      text(find(tree, (node) => node.type === 'output')),
      /친구 그림 없이.*친구 그림은 빠져/,
    );
    assert.ok(
      test.requestedAppearances.every((value) => value === appearance),
      'The historical appearance is used even when unavailable.',
    );
  }
  const recovered = readerHarness(missing);
  recovered.render();
  const ready = { src: png, loading: false, unavailable: false };
  const tree = recovered.render(ready);
  const save = find(
    tree,
    (node) => node.props['aria-label'] === '동화책 파일 저장',
  );
  assert.equal(save.props.disabled, false);
  save.props.onClick();
  save.props.onClick();
  await tick();
  assert.equal(recovered.downloads.length, 1);
  assert.ok(recovered.downloads[0][1].includes(`src="${png}"`));
  assert.doesNotMatch(
    text(find(recovered.render(), (node) => node.type === 'output')),
    /친구 그림 없이/,
  );

  // Resolve the actual CSS cascade for the reader's hero, including page-specific
  // and world selectors, then apply the browser's centered contain calculation.
  const css = readFileSync('app/companion-storybook.css', 'utf8');
  const styles = postcss.parse(css);
  function frameStyle(part, width, page, world, print = false) {
    const values = new Map();
    let order = 0;
    styles.walkRules((rule) => {
      const currentOrder = order++;
      const media = rule.parent.type === 'atrule' ? rule.parent.params : '';
      if (
        (media === 'print' && !print) ||
        (media === 'screen' && print) ||
        (/max-width:\s*680px/.test(media) && (print || width > 680))
      )
        return;
      for (const selector of rule.selectors) {
        if (!selector.endsWith(part)) continue;
        if (selector.includes('.csb-world-book') && !world) continue;
        const matchedPage = selector.match(/\.csb-page-(\d+)/);
        if (matchedPage && Number(matchedPage[1]) !== page) continue;
        const specificity = (selector.match(/\.[\w-]+/g) ?? []).length;
        for (const declaration of rule.nodes) {
          if (declaration.type !== 'decl') continue;
          const previous = values.get(declaration.prop);
          if (
            !previous ||
            specificity > previous.specificity ||
            (specificity === previous.specificity &&
              currentOrder >= previous.order)
          )
            values.set(declaration.prop, {
              value: declaration.value,
              specificity,
              order: currentOrder,
            });
        }
      }
    });
    return Object.fromEntries(
      [...values].map(([name, entry]) => [name, entry.value]),
    );
  }
  let framingChecks = 0;
  for (const width of [320, 390, 1280])
    assert.equal(
      frameStyle('.csb-paper h3', width, 0, false, false)['overflow-wrap'],
      'anywhere',
      'A valid long unspaced chapter title must wrap on the paper, not clip at the hidden spread edge',
    );
  for (const viewport of [
    { width: 320, frameWidth: 302, height: 335 },
    { width: 390, frameWidth: 372, height: 335 },
    { width: 1280, frameWidth: (1078 * 1.08) / 2.08, height: 490 },
    {
      width: 794,
      frameWidth: (186 * 96) / 25.4,
      height: (151 * 96) / 25.4,
      print: true,
    },
  ])
    for (const page of [0, 1, 2, 3, 4])
      for (const world of [false, true])
        for (const ratio of [0.25, 2 / 3, 0.8, 1, 1.5, 3]) {
          const resolved = (part) =>
            frameStyle(part, viewport.width, page, world, viewport.print);
          const style = resolved('.csb-hero-space > .csb-hero');
          const frame = resolved('.csb-illustration');
          const area = resolved('.csb-hero-space');
          const heading = resolved('.csb-illustration-title');
          const fallback = resolved('.csb-hero-space > .csb-portrait-fallback');
          assert.equal(frame.display, 'grid');
          assert.equal(
            frame['grid-template-rows'],
            'auto minmax(min-content, 1fr)',
          );
          assert.ok(
            frame.height === undefined || frame.height === 'auto',
            'A valid long title grows the picture instead of being clipped.',
          );
          assert.equal(heading.position, 'relative');
          assert.equal(heading['grid-row'], '1');
          assert.equal(area['grid-row'], '2');
          assert.equal(fallback.position, 'relative');
          assert.equal(
            fallback.inset,
            'auto',
            'The missing-picture explanation is in the same safe second row.',
          );
          assert.equal(style['object-fit'], 'contain');
          const percent = (name) => {
            assert.match(style[name], /^\d+(?:\.\d+)?%$/);
            return parseFloat(style[name]) / 100;
          };
          const pixels = (value) =>
            parseFloat(value) * (value.endsWith('mm') ? 96 / 25.4 : 1);
          // The auto title row uses its actual text height. Vary it beyond even
          // an 80-character title: no fixed reservation can accidentally pass.
          for (const titleHeight of [80, 160, 360, 800]) {
            const frameHeight = Math.max(
              pixels(frame['min-height']),
              titleHeight + pixels(area['min-height']),
            );
            const availableHeight = frameHeight - titleHeight;
            const width = viewport.frameWidth * percent('width'),
              height = availableHeight * percent('height');
            const imageHeight = Math.min(height, width / ratio),
              imageWidth = imageHeight * ratio;
            const left =
              viewport.frameWidth * percent('left') + (width - imageWidth) / 2;
            const bottom =
              titleHeight +
              availableHeight * (1 - percent('bottom')) -
              (height - imageHeight) / 2;
            assert.ok(
              left >= -1e-8 && left + imageWidth <= viewport.frameWidth + 1e-8,
            );
            assert.ok(
              bottom - imageHeight >= titleHeight - 1e-8 &&
                bottom <= frameHeight + 1e-8,
              `${JSON.stringify(viewport)} page ${page}, world ${world}, ratio ${ratio}: complete original image remains in frame`,
            );
            framingChecks++;
          }
        }
  const longBook = {
    ...book,
    title: '친구와함께만든소중한이야기'.repeat(8).slice(0, 80),
    chapterTitles: book.pages.map(() =>
      '서로도우며집으로돌아가는긴이야기'.repeat(8).slice(0, 80),
    ),
  };
  for (const state of [ready, missing]) {
    const test = readerHarness(state, longBook);
    let tree = test.render();
    find(
      tree,
      (node) => node.props['aria-label'] === '4장으로 이동',
    ).props.onClick();
    tree = test.render();
    const spread = find(
      tree,
      (node) =>
        typeof node.type === 'function' && node.type.name === 'StoryPage',
    );
    const pageTree = spread.type(spread.props);
    const illustration = find(
      pageTree,
      (node) => node.props.className === 'csb-illustration',
    );
    const children = React.Children.toArray(illustration.props.children);
    const heading = children.findIndex(
      (node) => node.props?.className === 'csb-illustration-title',
    );
    const area = children.findIndex(
      (node) => node.props?.className === 'csb-hero-space',
    );
    assert.ok(
      heading >= 0 && area > heading,
      'Actual title and portrait have separate, chronologically ordered grid rows.',
    );
    assert.equal(children[area].props.children.props.portrait, state);
    const markup = renderToStaticMarkup(tree);
    assert.ok(markup.includes(longBook.title));
    assert.ok(
      markup.includes(longBook.chapterTitles[3]),
      'Neither permitted 80-character title is shortened to fit.',
    );
  }
  if (process.argv.includes('--write-fixture')) {
    const escape = (value) =>
      value
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
    const views = [];
    for (const [shape, width, height] of [
      ['tall', 160, 480],
      ['square', 320, 320],
      ['wide', 480, 160],
    ])
      for (const page of [3, 4]) {
        const art = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect x="4" y="4" width="${width - 8}" height="${height - 8}" rx="28" fill="#8bc9d9" stroke="#fff4bc" stroke-width="8"/><circle cx="${width * 0.35}" cy="${height * 0.35}" r="12" fill="#273947"/><circle cx="${width * 0.65}" cy="${height * 0.35}" r="12" fill="#273947"/><path d="M${width * 0.4} ${height * 0.55}Q${width * 0.5} ${height * 0.68} ${width * 0.6} ${height * 0.55}" stroke="#273947" stroke-width="7" fill="none"/><path d="M12 ${height - 12}H${width - 12}" stroke="#e57485" stroke-width="8"/></svg>`;
        const test = readerHarness({
          src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(art)}`,
          loading: false,
          unavailable: false,
        });
        let tree = test.render();
        find(
          tree,
          (node) => node.props['aria-label'] === `${page + 1}장으로 이동`,
        ).props.onClick();
        tree = test.render();
        const markup = renderToStaticMarkup(tree);
        for (const frameWidth of shape === 'tall' ? [320, 1100] : [320])
          views.push({
            title: `${frameWidth}px / ${shape} / home ${page + 1}장`,
            width: frameWidth,
            markup,
          });
      }
    for (const [label, state] of [
      ['missing', missing],
      ['loading', { src: null, loading: true, unavailable: false }],
    ])
      views.push({
        title: `320px / ${label}`,
        width: 320,
        markup: renderToStaticMarkup(readerHarness(state).render()),
      });
    for (const [label, state] of [
      [
        'tall',
        {
          src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="480"><rect x="4" y="4" width="152" height="472" rx="25" fill="#8bc9d9" stroke="#fff4bc" stroke-width="8"/><path d="M12 468H148" stroke="#e57485" stroke-width="8"/></svg>')}`,
          loading: false,
          unavailable: false,
        },
      ],
      ['missing', missing],
    ])
      for (const page of [0, 3]) {
        const test = readerHarness(state, longBook);
        let tree = test.render();
        if (page) {
          find(
            tree,
            (node) => node.props['aria-label'] === `${page + 1}장으로 이동`,
          ).props.onClick();
          tree = test.render();
        }
        views.push({
          title: `320px / 80자 긴 제목 / ${label} / ${page + 1}장`,
          width: 320,
          markup: renderToStaticMarkup(tree),
        });
      }
    const frames = views.map(({ title, width, markup }) => {
      // This visual fixture only needs the visible reader. Embed its bundled
      // backdrop so opening the file cannot touch storage or issue requests.
      const standalone = markup
        .replace(/<div class="csb-print-pages"[\s\S]*$/, '</article>')
        .replace(/<link\b[^>]*rel="preload"[^>]*>/g, '')
        .replace(
          /src="\/moon-forest-scene-(\d)\.webp"/g,
          (_, scene) =>
            `src="data:image/webp;base64,${readFileSync(`public/moon-forest-scene-${scene}.webp`).toString('base64')}"`,
        );
      assert.doesNotMatch(standalone, /(?:src|href)="\/moon-/);
      const page = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:system-ui}dialog{position:fixed;inset:0;margin:auto;overflow:auto}${css}</style><body><dialog open class="cw-dialog cw-book-dialog">${standalone}</dialog></body></html>`;
      return `<section><h2>${title}</h2><iframe title="${title}" width="${width}" height="820" srcdoc="${escape(page)}"></iframe></section>`;
    });
    mkdirSync('outputs', { recursive: true });
    writeFileSync(
      'outputs/storybook-reader-state-framing.html',
      `<!doctype html><html lang="ko"><meta charset="utf-8"><title>동화책 실제 JSX 상태·프레이밍 검수</title><style>body{font:14px system-ui;background:#eee;margin:20px}main{display:flex;gap:24px;flex-wrap:wrap}h2{font-size:16px}iframe{border:1px solid #aebca8}</style><p>실제 reader/portrait JSX + 합성 경계표시 그림. 아래 붉은 선까지 보여야 합니다. 스크립트·사용자 DB·네트워크 없음.</p><main>${frames.join('')}</main></html>`,
    );
    console.log('Wrote outputs/storybook-reader-state-framing.html.');
  }
  console.log(
    `Storybook reader state passed: actual asset loading/missing/read-failure/recovery and identity, honest image-less export/print, pending-handler guards, duplicate export, ${framingChecks} actual-CSS aspect/page/viewport/print checks.`,
  );
} finally {
  await server.close();
}
