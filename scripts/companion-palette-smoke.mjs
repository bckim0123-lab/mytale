import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({
  configFile: false,
  cacheDir: 'node_modules/.vite-palette-test',
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
});
try {
  const { drawingPalette } = await server.ssrLoadModule(
    '/app/companion-palette.ts',
  );
  const pixels = (rgb, count) =>
    Array.from({ length: count }, () => [...rgb, 255]).flat();
  assert.equal(drawingPalette([]), null);
  assert.equal(drawingPalette(pixels([250, 250, 250], 30)), null);
  assert.equal(
    drawingPalette(pixels([60, 60, 60], 30)).colorsFound,
    0,
    'Pencil drawings receive a gentle graphite palette',
  );
  assert.equal(
    drawingPalette(pixels([215, 215, 215], 30)),
    null,
    'Paper shadows do not become drawing colours',
  );
  assert.equal(drawingPalette([255, 0, 0, 0]), null);
  const red = drawingPalette(pixels([220, 40, 70], 50));
  assert.equal(red.colorsFound, 1);
  const two = drawingPalette([
    ...pixels([220, 40, 70], 50),
    ...pixels([30, 160, 210], 20),
    ...pixels([255, 255, 255], 500),
  ]);
  assert.equal(two.colorsFound, 2);
  assert.notEqual(two.accentColor, red.accentColor);
  assert.equal(two.bodyColor, red.bodyColor);
  assert.match(two.bodyColor, /^#[\da-f]{6}$/);
  assert.equal(
    drawingPalette([...pixels([220, 40, 70], 50), ...pixels([30, 160, 210], 1)])
      .colorsFound,
    1,
    'Single noisy pixels cannot dominate the accent',
  );
  assert.deepEqual(
    drawingPalette([
      ...pixels([30, 160, 210], 20),
      ...pixels([220, 40, 70], 50),
    ]),
    two,
  );
  console.log(
    'PASS: local two-colour extraction, pencil palette, blank/alpha rejection, noise threshold and deterministic palette',
  );
} finally {
  await server.close();
}
