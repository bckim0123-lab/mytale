import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync('app/layout.tsx', 'utf8');
const ast = ts.createSourceFile(
  'layout.tsx',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const declaration = ast.statements.find(
  (node) =>
    ts.isVariableStatement(node) &&
    node.declarationList.declarations.some(
      (item) => item.name.getText(ast) === 'metadata',
    ),
);
assert.ok(declaration);
const exports = {};
runInNewContext(
  ts.transpileModule(declaration.getText(ast), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  { exports, URL },
);
const metadata = exports.metadata;
assert.equal(
  metadata.metadataBase.origin,
  'https://drawing-friend-site.vercel.app',
);
for (const image of [
  ...metadata.openGraph.images.map((item) => item.url),
  ...metadata.twitter.images,
]) {
  assert.equal(
    new URL(image, metadata.metadataBase).origin,
    metadata.metadataBase.origin,
  );
  assert.ok(
    existsSync(`public${image}`),
    'Existing public share artwork must be present.',
  );
}
assert.equal(metadata.icons.icon.url, '/favicon.svg');
assert.equal(metadata.icons.icon.type, 'image/svg+xml');
assert.ok(existsSync(`public${metadata.icons.icon.url}`));
console.log(
  'Public metadata smoke passed: share images use the public deployment, and existing icon/image assets are present.',
);
