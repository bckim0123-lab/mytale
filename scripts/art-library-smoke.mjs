import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const nativeRequire = createRequire(import.meta.url);
const compiled = ts.transpileModule(
  readFileSync('app/companion-art-library.tsx', 'utf8'),
  {
    fileName: 'companion-art-library.tsx',
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  },
).outputText;

function nodes(element, result = []) {
  if (!element || typeof element !== 'object') return result;
  result.push(element);
  React.Children.forEach(element.props?.children, (child) =>
    nodes(child, result),
  );
  return result;
}
const cards = (tree) =>
  nodes(tree).filter(
    (node) => node.type === 'button' && 'aria-pressed' in node.props,
  );
const cardIds = (tree) => cards(tree).map((card) => card.key);
const control = (tree, label) => {
  const found = nodes(tree).find(
    (node) => node.props?.['aria-label'] === label,
  );
  assert.ok(found, `The ${label} control exists.`);
  return found;
};

function createHarness(initialProps, previewMap = {}) {
  const slots = [];
  const previewCalls = [];
  const focusCalls = [];
  const selections = [];
  let cursor = 0,
    effects = [],
    attachedRefs = [],
    props = {
      ...initialProps,
      onSelect: (id) => selections.push(id),
    };
  const exports = {};
  runInNewContext(compiled, {
    exports,
    require(name) {
      if (name === './use-drawing-previews')
        return {
          useDrawingPreviews(ids) {
            previewCalls.push(Array.from(ids));
            return previewMap;
          },
        };
      if (name === 'react')
        return {
          useState(initial) {
            const index = cursor++;
            if (!(index in slots))
              slots[index] = {
                value: typeof initial === 'function' ? initial() : initial,
              };
            return [
              slots[index].value,
              (update) => {
                slots[index].value =
                  typeof update === 'function'
                    ? update(slots[index].value)
                    : update;
              },
            ];
          },
          useRef(initial) {
            const index = cursor++;
            return (slots[index] ??= { current: initial });
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
              const next = { dependencies: Array.from(dependencies) };
              slots[index] = next;
              effects.push(() => {
                previous?.cleanup?.();
                next.cleanup = work();
              });
            }
          },
        };
      assert.ok(
        ['react/jsx-runtime', 'lucide-react'].includes(name),
        'The art library delegates previews without importing storage, network, or WebGL.',
      );
      return nativeRequire(name);
    },
  });
  return {
    api: exports,
    previewCalls,
    focusCalls,
    selections,
    render(overrides = {}) {
      props = { ...props, ...overrides };
      cursor = 0;
      effects = [];
      const tree = exports.default(props);
      for (const ref of attachedRefs) ref.current = null;
      attachedRefs = [];
      for (const node of nodes(tree)) {
        const ref = node.props?.ref;
        if (ref && typeof ref === 'object') {
          attachedRefs.push(ref);
          ref.current = {
            focus: (options) => focusCalls.push({ id: node.key, ...options }),
          };
        }
      }
      for (const effect of effects) effect();
      assert.equal(previewCalls.length, 1 + this.renders++);
      assert.deepEqual(
        previewCalls.at(-1),
        cardIds(tree),
        'Only the currently rendered card IDs are requested from the preview hook.',
      );
      return tree;
    },
    renders: 0,
  };
}

const assets = Array.from({ length: 100 }, (_, index) => ({
  id: (index + 1).toString(16).padStart(64, '0'),
  name: `그림친구 ${index + 1}`,
}));
const { FRIENDS_PER_PAGE, friendLibraryPage } = createHarness({
  assets: [],
}).api;
assert.equal(FRIENDS_PER_PAGE, 6);

// Exercise the real rendered next controls, not just arithmetic over the helper.
for (let count = 0; count <= 100; count++) {
  const expected = assets.slice(0, count);
  const test = createHarness({ assets: expected });
  let tree = test.render();
  const pages = Math.max(1, Math.ceil(count / 6));
  assert.equal(friendLibraryPage(count, -10).page, 0);
  assert.equal(friendLibraryPage(count, 999).page, pages - 1);
  assert.equal(friendLibraryPage(count, 999).pages, pages);
  assert.equal(
    test.focusCalls.length,
    0,
    'Opening the library never steals focus.',
  );
  if (!count) assert.equal(tree, null);
  const seen = [];
  for (let page = 0; page < pages; page++) {
    const visible = cards(tree);
    assert.ok(
      visible.length <= 6,
      'There are never more than six friend cards.',
    );
    assert.deepEqual(
      cardIds(tree),
      expected.slice(page * 6, page * 6 + 6).map((asset) => asset.id),
    );
    assert.equal(friendLibraryPage(count, page).start, page * 6);
    for (const card of visible) {
      card.props.onClick();
      seen.push(card.key);
      assert.equal(
        test.selections.at(-1),
        card.key,
        'Choosing preserves the exact asset ID.',
      );
    }
    if (pages === 1) {
      assert.ok(!nodes(tree).some((node) => node.type === 'nav'));
      continue;
    }
    assert.equal(control(tree, '이전 친구들').props.disabled, page === 0);
    const next = control(tree, '다음 친구들');
    assert.equal(next.props.disabled, page === pages - 1);
    if (page < pages - 1) {
      next.props.onClick();
      tree = test.render();
      assert.deepEqual(test.focusCalls.at(-1), {
        id: expected[(page + 1) * 6].id,
        preventScroll: true,
      });
    }
  }
  assert.deepEqual(
    seen,
    expected.map((asset) => asset.id),
    'Every stored friend is reachable.',
  );
  assert.equal(test.focusCalls.length, pages - 1);
  const beforeRerender = cardIds(tree);
  tree = test.render();
  assert.deepEqual(
    cardIds(tree),
    beforeRerender,
    'Choosing a friend does not reset the page.',
  );
  assert.equal(
    test.focusCalls.length,
    pages - 1,
    'An ordinary rerender does not steal focus.',
  );
}

// Initial rendering must locate any selected friend, including the final partial page.
for (const selected of assets) {
  const test = createHarness({ assets, selectedId: selected.id });
  const tree = test.render();
  assert.ok(cardIds(tree).includes(selected.id));
  assert.deepEqual(
    cards(tree)
      .filter((card) => card.props['aria-pressed'])
      .map((card) => card.key),
    [selected.id],
  );
  assert.equal(test.focusCalls.length, 0);
}
for (const selectedId of [undefined, 'missing-selection']) {
  const test = createHarness({ assets, selectedId });
  assert.deepEqual(
    cardIds(test.render()),
    assets.slice(0, 6).map((asset) => asset.id),
  );
}

// Keep one mounted hook state through async metadata, explicit paging and selection changes.
const asyncMetadata = createHarness({ assets: [], selectedId: assets[70].id });
assert.equal(asyncMetadata.render(), null);
let asyncPage = asyncMetadata.render({ assets });
assert.deepEqual(
  cardIds(asyncPage),
  assets.slice(66, 72).map((asset) => asset.id),
  'Late metadata reveals the selected friend on page 11 instead of retaining empty-page zero.',
);
assert.ok(
  cards(asyncPage).some(
    (card) => card.key === assets[70].id && card.props['aria-pressed'],
  ),
);
assert.equal(
  asyncMetadata.focusCalls.length,
  0,
  'Metadata arrival does not steal focus.',
);
control(asyncPage, '이전 친구들').props.onClick();
asyncPage = asyncMetadata.render();
const explicitlyPagedIds = assets.slice(60, 66).map((asset) => asset.id);
assert.deepEqual(cardIds(asyncPage), explicitlyPagedIds);
assert.deepEqual(asyncMetadata.focusCalls, [
  { id: assets[60].id, preventScroll: true },
]);
const refreshedMetadata = assets.map((asset) => ({
  ...asset,
  name: `${asset.name} 새 이름`,
}));
asyncPage = asyncMetadata.render({ assets: refreshedMetadata });
assert.deepEqual(
  cardIds(asyncPage),
  explicitlyPagedIds,
  'Same-selection name and metadata refresh preserves an explicitly chosen page.',
);
assert.equal(asyncMetadata.focusCalls.length, 1);
asyncPage = asyncMetadata.render({ selectedId: assets[95].id });
assert.deepEqual(
  cardIds(asyncPage),
  assets.slice(90, 96).map((asset) => asset.id),
  'A new selection becomes visible on page 15 without resetting the component hooks.',
);
assert.deepEqual(
  cards(asyncPage)
    .filter((card) => card.props['aria-pressed'])
    .map((card) => card.key),
  [assets[95].id],
);
assert.equal(
  asyncMetadata.focusCalls.length,
  1,
  'Following a newly selected friend does not steal keyboard focus.',
);

const paging = createHarness({ assets, selectedId: assets[12].id });
let page = paging.render();
control(page, '이전 친구들').props.onClick();
page = paging.render();
assert.deepEqual(paging.focusCalls, [
  { id: assets[6].id, preventScroll: true },
]);
assert.equal(cardIds(page)[0], assets[6].id);
page = paging.render({ assets: assets.slice(0, 2) });
assert.deepEqual(
  cardIds(page),
  assets.slice(0, 2).map((asset) => asset.id),
);
assert.equal(
  paging.focusCalls.length,
  1,
  'Clamping a shorter list is not a paging focus request.',
);
assert.equal(paging.render({ assets: [] }), null);
assert.deepEqual(paging.previewCalls.at(-1), []);

// React must escape names; unavailable previews never fall back to another hero.
const namedAssets = [
  { ...assets[0], name: '<script>name & "quoted"</script>' },
  { ...assets[1], name: '' },
  assets[2],
];
const approved = 'data:image/png;base64,YXBwcm92ZWQ=';
const forbidden = 'CURRENT_SELECTION_MUST_NOT_BE_BORROWED';
const identity = createHarness(
  { assets: namedAssets, selectedId: assets[2].id },
  { [assets[0].id]: approved, [assets[99].id]: forbidden },
);
const identityTree = identity.render();
const html = renderToStaticMarkup(identityTree);
assert.doesNotMatch(
  html,
  /<script>|CURRENT_SELECTION_MUST_NOT_BE_BORROWED|<canvas/,
);
assert.match(
  html,
  /&lt;script&gt;name &amp; &quot;quoted&quot;&lt;\/script&gt;/,
);
assert.match(html, />그림친구<\/span>/);
assert.equal(
  nodes(identityTree).filter((node) => node.type === 'img').length,
  1,
);
for (const [index, card] of cards(identityTree).entries()) {
  const images = nodes(card).filter((node) => node.type === 'img');
  if (index === 0) {
    assert.equal(images[0].props.src, approved);
    assert.equal(images[0].props.loading, 'lazy');
    assert.equal(images[0].props.decoding, 'async');
    assert.equal(images[0].props.alt, '');
  } else {
    assert.equal(images.length, 0);
    const placeholder = nodes(card).find(
      (node) => node.props?.className === 'cw-art-preview-placeholder',
    );
    assert.ok(
      placeholder,
      'Missing images retain a named, selectable placeholder card.',
    );
    assert.equal(placeholder.props['aria-hidden'], 'true');
  }
  card.props.onClick();
  assert.equal(identity.selections.at(-1), namedAssets[index].id);
}
const currentOffPage = identity.render({ selectedId: assets[99].id });
assert.doesNotMatch(
  renderToStaticMarkup(currentOffPage),
  /CURRENT_SELECTION_MUST_NOT_BE_BORROWED/,
);
assert.ok(cards(currentOffPage).every((card) => !card.props['aria-pressed']));

const css = readFileSync('app/companion.css', 'utf8');
const imageRules = Array.from(
  css.matchAll(/\.cw-art-library img\s*\{([^}]+)\}/g),
);
assert.ok(imageRules.length, 'Art-card image styling exists.');
for (const [, rule] of imageRules) {
  assert.match(
    rule,
    /object-fit:\s*contain\s*;/,
    'The full drawing is shown without cropping.',
  );
  assert.match(rule, /width:\s*100%\s*;/);
}

console.log(
  'Art library passed: actual component, all 0–100 counts and selected IDs, six-card cap, full reachability, precise preview IDs, async metadata and selection continuity, paging focus, shorter-list clamps, identity-safe placeholders, escaped names and lazy uncropped images; no storage, browser or network.',
);
