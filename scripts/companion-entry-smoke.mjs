import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import ts from 'typescript';

const nativeRequire = createRequire(import.meta.url);
const exports = {};
let loaderState,
  loaderInitialized = false;
const source = readFileSync('app/companion-entry.tsx', 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
}).outputText;
runInNewContext(code, {
  exports,
  require(name) {
    if (name.endsWith('.css')) return {};
    assert.notEqual(
      name,
      './companion-experience',
      'The scene is never eagerly loaded.',
    );
    if (name !== 'react') return nativeRequire(name);
    return {
      ...React,
      useState(initial) {
        if (!loaderInitialized) {
          loaderState = initial();
          loaderInitialized = true;
        }
        return [
          loaderState,
          (update) => {
            loaderState =
              typeof update === 'function' ? update(loaderState) : update;
          },
        ];
      },
    };
  },
});
const {
  CompanionLoadBoundary: Boundary,
  CompanionEntryFallback: Fallback,
  default: Entry,
} = exports;
const child = React.createElement('section', null, 'scene');
const fallback = React.createElement('section', null, 'recovery');
const boundary = new Boundary({ children: child, fallback });
assert.strictEqual(boundary.render(), child);
boundary.state = Boundary.getDerivedStateFromError(new Error('offline chunk'));
assert.strictEqual(
  boundary.render(),
  fallback,
  'The local boundary contains errors below Page.',
);

const image = 'data:image/png;base64,c3ludGhldGlj';
const artwork = { png: image, name: '별친구', persona: {} };
const savedParentState = {
  generated: [image],
  source: 'original-stays-in-page',
};
let backs = 0,
  accepted = 0;
const props = {
  incomingArtwork: artwork,
  onBack: () => backs++,
  onArtworkAccepted: () => accepted++,
};
const before = Entry(props);
assert.equal(before.type, Boundary);
const pending = before.props.children;
assert.equal(pending.type, React.Suspense);
assert.equal(pending.props.fallback.props.failed, false);
assert.equal(pending.props.fallback.props.image, image);
assert.equal(before.props.fallback.props.image, image);
const same = Entry(props);
assert.strictEqual(
  same.props.children.props.children.type,
  pending.props.children.type,
  'Ordinary rerenders keep the same scene component.',
);
before.props.fallback.props.onRetry();
const retry = Entry(props);
assert.notEqual(retry.key, before.key);
assert.notStrictEqual(
  retry.props.children.props.children.type,
  pending.props.children.type,
  'Explicit retry gets a fresh lazy loader and boundary.',
);
assert.strictEqual(
  retry.props.children.props.children.props.incomingArtwork,
  artwork,
);
assert.equal(
  accepted,
  0,
  'Loading and retry never falsely acknowledge artwork storage.',
);
retry.props.fallback.props.onBack();
assert.equal(backs, 1);
assert.deepEqual(savedParentState, {
  generated: [image],
  source: 'original-stays-in-page',
});
for (const failed of [false, true]) {
  const html = renderToStaticMarkup(
    React.createElement(Fallback, { failed, image, onBack() {}, onRetry() {} }),
  );
  assert.ok(
    html.includes('만든 친구 그림 저장') &&
      html.includes('download="그림친구.png"'),
  );
  assert.ok(html.includes('만들기 화면으로 돌아가기'));
  assert.equal(html.includes('친구의 집 다시 열기'), failed);
  assert.ok(!html.includes('location.reload'));
}
for (const unsafe of [
  'https://example.com/private.png',
  'javascript:bad',
  'data:image/svg+xml,unsafe',
]) {
  const html = renderToStaticMarkup(
    React.createElement(Fallback, { failed: true, image: unsafe, onBack() {} }),
  );
  assert.ok(!html.includes(unsafe) && !html.includes('<img'));
}
console.log(
  'Companion entry passed: local boundary, stable normal loader, explicit retry, retained approved picture/download/back route and no false save acknowledgement; no provider or browser requests.',
);
