import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  cacheDir: 'node_modules/.vite-creature-interaction-test',
  root: process.cwd(),
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
});
try {
  const { createCreature, DEFAULT_APPEARANCE } = await server.ssrLoadModule(
    '/app/creature-rig.ts',
  );
  const { buildDrawingGeometry, createDrawingCreature } =
    await server.ssrLoadModule('/app/drawing-creature-rig.ts');
  const rig = createCreature(DEFAULT_APPEARANCE);
  const body = rig.root.getObjectByName('BodyPivot');
  assert.ok(body);
  for (let i = 0; i < 66; i++)
    rig.update(1 / 60, i / 60, { moving: false, action: 'hop', actionId: 1 });
  assert.ok(body.position.y < 0.9, 'first hop settled');
  for (let i = 0; i < 24; i++)
    rig.update(1 / 60, 2 + i / 60, {
      moving: false,
      action: 'hop',
      actionId: 2,
    });
  assert.ok(body.position.y > 1.22, 'same hop restarts on new actionId');
  rig.dispose();

  const wave = createCreature(DEFAULT_APPEARANCE);
  const held = createCreature(DEFAULT_APPEARANCE);
  for (let i = 0; i < 67; i++) {
    wave.update(1 / 60, i / 60, { moving: false, action: 'wave', actionId: 1 });
    held.update(1 / 60, i / 60, { moving: false, action: 'wave', actionId: 1 });
  }
  let difference = 0;
  for (let i = 0; i < 20; i++) {
    wave.update(1 / 60, 2 + i / 60, {
      moving: false,
      action: 'wave',
      actionId: 2,
    });
    held.update(1 / 60, 2 + i / 60, {
      moving: false,
      action: 'wave',
      actionId: 1,
    });
    difference += Math.abs(
      wave.root.getObjectByName('ArmR').rotation.y -
        held.root.getObjectByName('ArmR').rotation.y,
    );
  }
  assert.ok(difference > 0.05, 'new wave restarts the greeting phase');
  wave.dispose();
  held.dispose();

  const width = 64,
    height = 80,
    pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const torso = ((x - 32) / 22) ** 2 + ((y - 43) / 30) ** 2 < 1;
      const ear = ((x - 21) / 7) ** 2 + ((y - 14) / 11) ** 2 < 1;
      const hole = (x - 32) ** 2 + (y - 43) ** 2 < 16;
      if ((torso || ear) && !hole)
        pixels.set([240, 180, 190, 255], (y * width + x) * 4);
    }
  const geometry = buildDrawingGeometry(pixels, width, height);
  assert.ok(geometry);
  assert.equal(geometry.userData.alphaClipped, true);
  assert.ok(geometry.userData.sideTriangles > 10, 'real outline side walls');
  const bounds = geometry.boundingBox;
  assert.ok(
    bounds.max.x - bounds.min.x <= 2.26 && bounds.max.y <= 2.72,
    'same companion framing',
  );
  assert.ok(
    bounds.max.z > 0.2 && bounds.min.z < -0.2,
    'front and back have genuine volume',
  );
  assert.equal(
    geometry.groups.length,
    2,
    'painted front and unpainted back materials',
  );
  assert.equal(geometry.userData.textureSampling, 'pixel-centers');
  const position = geometry.attributes.position,
    normals = geometry.attributes.normal,
    uv = geometry.attributes.uv;
  let minMaskX = width,
    maxMaskX = -1,
    minMaskY = height,
    maxMaskY = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (pixels[(y * width + x) * 4 + 3] >= 48) {
        minMaskX = Math.min(minMaskX, x);
        maxMaskX = Math.max(maxMaskX, x);
        minMaskY = Math.min(minMaskY, y);
        maxMaskY = Math.max(maxMaskY, y);
      }
  const unit = Math.min(
    2.25 / (maxMaskX - minMaskX + 2),
    2.65 / (maxMaskY - minMaskY + 2),
  );
  const centerMaskX = (minMaskX + maxMaskX) / 2;
  for (let i = 0; i < position.count; i++) {
    for (const v of [
      position.getX(i),
      position.getY(i),
      position.getZ(i),
      normals.getX(i),
      normals.getY(i),
      normals.getZ(i),
    ])
      assert.ok(Number.isFinite(v), 'finite geometry');
    assert.ok(
      uv.getX(i) >= 0 && uv.getX(i) <= 1 && uv.getY(i) >= 0 && uv.getY(i) <= 1,
    );
    assert.ok(
      Math.abs(
        position.getX(i) - (uv.getX(i) * width - 0.5 - centerMaskX) * unit,
      ) < 0.000001,
      'texture and alpha-mask pixel centers align horizontally',
    );
    assert.ok(
      Math.abs(
        position.getY(i) -
          ((maxMaskY + 1 - ((1 - uv.getY(i)) * height - 0.5)) * unit + 0.015),
      ) < 0.000001,
      'texture and alpha-mask pixel centers align vertically',
    );
  }
  const index = geometry.index.array,
    edges = new Map();
  let volume = 0;
  for (let i = 0; i < index.length; i += 3) {
    const [a, b, c] = [index[i], index[i + 1], index[i + 2]];
    for (const [from, to] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const key = Math.min(from, to) + ':' + Math.max(from, to);
      edges.set(key, (edges.get(key) || 0) + 1);
    }
    const ax = position.getX(a),
      ay = position.getY(a),
      az = position.getZ(a);
    const bx = position.getX(b),
      by = position.getY(b),
      bz = position.getZ(b);
    const cx = position.getX(c),
      cy = position.getY(c),
      cz = position.getZ(c);
    volume +=
      (ax * (by * cz - bz * cy) +
        ay * (bz * cx - bx * cz) +
        az * (bx * cy - by * cx)) /
      6;
  }
  assert.ok(
    [...edges.values()].every((count) => count === 2),
    'watertight silhouette including interior hole',
  );
  assert.ok(
    volume > 0.1,
    'consistent outward winding and positive enclosed volume',
  );
  geometry.dispose();
  assert.equal(
    buildDrawingGeometry(new Uint8Array(4 * 8 * 8), 8, 8),
    null,
    'empty alpha rejected',
  );
  assert.equal(
    buildDrawingGeometry(new Uint8Array(4 * 8 * 8).fill(255), 8, 8),
    null,
    'opaque rectangle rejected',
  );
  assert.equal(
    buildDrawingGeometry(pixels, 256, 256),
    null,
    'unbounded mask rejected',
  );
  assert.equal(
    buildDrawingGeometry(pixels, 0, 80),
    null,
    'invalid dimensions rejected',
  );

  // No Image/browser/GPU is present: failure is explicit, never another character.
  const missing = createDrawingCreature({
    ...DEFAULT_APPEARANCE,
    drawingImage: 'data:image/png;base64,test',
  });
  assert.equal(await missing.ready, false);
  assert.equal(missing.root.userData.drawingStatus, 'error');
  assert.equal(
    missing.root.getObjectByName('PearBody'),
    undefined,
    'never replace artwork by a default friend',
  );
  for (let i = 0; i < 66; i++)
    missing.update(1 / 60, i / 60, {
      moving: false,
      action: 'hop',
      actionId: 1,
    });
  for (let i = 0; i < 24; i++)
    missing.update(1 / 60, 2 + i / 60, {
      moving: false,
      action: 'hop',
      actionId: 2,
    });
  assert.ok(
    missing.root.getObjectByName('DrawingBody').position.y > 0.4,
    'drawing puppet repeats hop too',
  );
  missing.dispose();
  missing.dispose();
  assert.equal(missing.root.userData.drawingStatus, 'disposed');

  const originalImage = globalThis.Image,
    originalDocument = globalThis.document;
  const loadedImages = [];
  class LocalImage {
    naturalWidth = 64;
    naturalHeight = 80;
    onload = null;
    onerror = null;
    src = '';
    constructor() {
      loadedImages.push(this);
    }
  }
  globalThis.Image = LocalImage;
  globalThis.document = {
    // eslint-disable-next-line typescript/no-deprecated -- Local Canvas test double, not the Workers HTMLRewriter API.
    createElement() {
      const canvas = {
        width: 0,
        height: 0,
        getContext() {
          return {
            drawImage() {},
            getImageData() {
              const data = new Uint8ClampedArray(
                canvas.width * canvas.height * 4,
              );
              for (let y = 0; y < canvas.height; y++)
                for (let x = 0; x < canvas.width; x++) {
                  if (
                    ((x - canvas.width / 2) / (canvas.width * 0.35)) ** 2 +
                      ((y - canvas.height / 2) / (canvas.height * 0.4)) ** 2 <
                    1
                  )
                    data.set([240, 180, 190, 255], (y * canvas.width + x) * 4);
                }
              return { data };
            },
          };
        },
      };
      return canvas;
    },
  };
  try {
    const pending = createDrawingCreature({
      ...DEFAULT_APPEARANCE,
      drawingImage: 'data:image/png;base64,test',
    });
    const image = loadedImages.at(-1),
      lateLoad = image.onload;
    pending.dispose();
    assert.equal(
      await pending.ready,
      false,
      'pending decode resolves on disposal',
    );
    lateLoad();
    assert.equal(
      pending.root.getObjectByName('InflatedDrawingSilhouette'),
      undefined,
      'late decode never resurrects disposed rig',
    );
    assert.equal(image.onload, null, 'image handlers released');

    const loaded = createCreature({
      ...DEFAULT_APPEARANCE,
      drawingImage: 'data:image/png;base64,test',
    });
    loadedImages.at(-1).onload();
    assert.equal(await loaded.ready, true);
    assert.equal(loaded.root.userData.drawingStatus, 'ready');
    const puppet = loaded.root.getObjectByName('InflatedDrawingSilhouette');
    assert.ok(puppet);
    assert.equal(
      puppet.material[0].type,
      'MeshBasicMaterial',
      'painted face is not relit into faceted white stripes',
    );
    assert.equal(
      puppet.material[0].toneMapped,
      false,
      'original artwork color stays intact',
    );
    assert.equal(
      puppet.material[1].type,
      'MeshPhysicalMaterial',
      'thick rear remains lit and three-dimensional',
    );
    assert.equal(
      puppet.geometry.type,
      'BufferGeometry',
      'not a rectangular plane',
    );
    let disposedResources = 0;
    for (const resource of [
      puppet.geometry,
      ...puppet.material,
      puppet.material[0].map,
    ])
      resource.addEventListener('dispose', () => {
        disposedResources++;
      });
    loaded.dispose();
    loaded.dispose();
    assert.equal(
      disposedResources,
      4,
      'geometry, both materials and painted texture disposed exactly once',
    );
  } finally {
    if (originalImage === undefined) delete globalThis.Image;
    else globalThis.Image = originalImage;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }

  const runtime = await readFile('app/companion-world-runtime.ts', 'utf8');
  const { getDrawingForestFacing } = await server.ssrLoadModule(
    '/app/companion-world-runtime.ts',
  );
  const angleDifference = (a, b) =>
    Math.atan2(Math.sin(a - b), Math.cos(a - b));
  for (const cameraOffset of [
    { x: 0, z: 12 },
    { x: 2, z: 10 },
    { x: -3, z: 12 },
  ]) {
    const baseYaw = Math.atan2(cameraOffset.x, cameraOffset.z);
    for (const movement of [
      { x: 1, z: 0 },
      { x: -1, z: 0 },
      { x: 0, z: -1 },
      { x: 0, z: 1 },
    ]) {
      let pose = { yaw: Math.PI / 2, pitch: 0 };
      for (let frame = 0; frame < 90; frame++) {
        pose = getDrawingForestFacing({
          cameraOffset,
          movement,
          moving: true,
          ...pose,
          dt: 1 / 60,
        });
        assert.ok(
          Math.abs(angleDifference(pose.yaw, baseYaw)) <= 0.450001,
          'drawing face stays visible for every travel direction',
        );
        assert.ok(
          pose.pitch <= 0 && pose.pitch >= -0.200001,
          'gentle camera-height tilt',
        );
      }
      for (let frame = 0; frame < 90; frame++)
        pose = getDrawingForestFacing({
          cameraOffset,
          movement,
          moving: false,
          ...pose,
          dt: 1 / 60,
        });
      assert.ok(
        Math.abs(angleDifference(pose.yaw, baseYaw)) < 0.00001,
        'drawing puppet returns to camera-facing idle after arrival',
      );
    }
  }
  const fastFrame = getDrawingForestFacing({
    cameraOffset: { x: 0, z: 12 },
    movement: { x: 1, z: 0 },
    moving: true,
    yaw: 0,
    pitch: 0,
    dt: 4,
  });
  const boundedFrame = getDrawingForestFacing({
    cameraOffset: { x: 0, z: 12 },
    movement: { x: 1, z: 0 },
    moving: true,
    yaw: 0,
    pitch: 0,
    dt: 0.05,
  });
  assert.deepEqual(fastFrame, boundedFrame, 'long frame never snaps rotation');
  const reducedFacing = getDrawingForestFacing({
    cameraOffset: { x: 0, z: 12 },
    movement: { x: 1, z: 0 },
    moving: true,
    yaw: 1.5,
    pitch: 0,
    dt: 0.05,
    reducedMotion: true,
  });
  assert.ok(
    reducedFacing.yaw <= 0.12,
    'reduced motion has a smaller sideways look',
  );
  assert.match(
    runtime,
    /if \(!drawingPuppet\) \{[\s\S]{0,100}creature\.root\.rotation\.y = yaw/,
    'real plush keeps full movement yaw',
  );
  const wrapper = await readFile('app/companion-world.tsx', 'utf8');
  const stopBody = runtime.slice(
    runtime.indexOf('function stop()'),
    runtime.indexOf('function blur()'),
  );
  for (const statement of [
    'destination = null',
    'pendingId = null',
    'journeyTarget = null',
    'pathQueue = []',
    'keys.clear()',
    'joystick.set(0, 0)',
    'cursor.visible = false',
  ])
    assert.ok(stopBody.includes(statement), 'stop cancels ' + statement);
  assert.match(
    runtime,
    /e.key === 'Escape'[\s\S]{0,100}stop\(\)/,
    'canvas Escape calls hard stop',
  );
  assert.match(
    wrapper,
    /world\.stop\(\)/,
    'wrapper calls hard stop, not steer zero',
  );
  assert.match(runtime, /actionId \+= 1/, 'every reaction has new actionId');
  console.log(
    'creature interaction smoke passed: repeated hop/wave, drawing motion, closed alpha geometry, volume/UV/bounds, safe missing image, full stop contract.',
  );
} finally {
  await server.close();
}
