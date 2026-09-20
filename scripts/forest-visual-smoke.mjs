import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { Box3, Vector3 } from 'three';
const server = await createServer({
  configFile: false,
  cacheDir: 'node_modules/.vite-forest-visual-test',
  root: process.cwd(),
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
});
try {
  const { createForestVisuals, forestCameraFrame } = await server.ssrLoadModule(
    '/app/forest-diorama-visuals.ts',
  );
  const { initialForestState, transitionForest } = await server.ssrLoadModule(
    '/app/forest-story.ts',
  );
  const {
    isForestWalkablePoint,
    getCompanionNavigationPath,
    getDrawingForestFacing,
    bindForestHotspotButton,
    forestTreeOpacity,
    layoutForestLabels,
    forestPlushTargetYaw,
  } = await server.ssrLoadModule('/app/companion-world-runtime.ts');
  const button = new EventTarget();
  let labelActivations = 0;
  const unbind = bindForestHotspotButton(button, () => labelActivations++);
  const pointerPress = new Event('pointerdown', { cancelable: true });
  Object.defineProperty(pointerPress, 'button', { value: 0 });
  button.dispatchEvent(pointerPress);
  assert.equal(
    labelActivations,
    1,
    'moving label commits immediately at pointerdown',
  );
  assert.equal(
    pointerPress.defaultPrevented,
    true,
    'press prevents focus/ground gesture',
  );
  const pointerClick = new Event('click', { cancelable: true });
  Object.defineProperty(pointerClick, 'detail', { value: 1 });
  button.dispatchEvent(pointerClick);
  assert.equal(
    labelActivations,
    1,
    'pointer click cannot trigger interaction twice',
  );
  const keyboardClick = new Event('click', { cancelable: true });
  Object.defineProperty(keyboardClick, 'detail', { value: 0 });
  button.dispatchEvent(keyboardClick);
  assert.equal(
    labelActivations,
    2,
    'keyboard/screen reader native activation preserved',
  );
  unbind();
  button.dispatchEvent(keyboardClick);
  assert.equal(labelActivations, 2, 'all moving label handlers disposed');
  assert.equal(
    forestPlushTargetYaw(false, { x: 0, z: 0 }, { x: 0, z: 10 }, Math.PI, true),
    0,
    'celebrating plush turns its face toward the child',
  );
  assert.equal(
    forestPlushTargetYaw(true, { x: 0, z: -1 }, { x: 0, z: 10 }, 0, true),
    Math.PI,
    'direct walking keeps its true 360-degree heading',
  );
  assert.equal(
    forestPlushTargetYaw(false, { x: 0, z: 0 }, { x: 0, z: 10 }, 1.2, false),
    1.2,
    'ordinary idle heading is preserved',
  );
  const sceneCamera = { x: 0, y: 6.9, z: 10 };
  const hero = { x: 0, y: 1, z: 0 };
  const treeShape = { x: 0, z: 4, radius: 1.4, height: 4.8 };
  assert.equal(
    forestTreeOpacity(sceneCamera, hero, treeShape),
    0.1,
    'foreground canopy yields to the hero',
  );
  assert.equal(
    forestTreeOpacity(sceneCamera, hero, { ...treeShape, x: 4 }),
    1,
    'unrelated scenery remains solid',
  );
  assert.equal(
    forestTreeOpacity(sceneCamera, hero, { ...treeShape, z: -4 }),
    1,
    'background trees remain solid',
  );
  assert.equal(
    forestTreeOpacity(sceneCamera, hero, { ...treeShape, height: 0.6 }),
    1,
    'low path shrubs do not fade unnecessarily',
  );
  const initial = initialForestState();
  const visual = createForestVisuals(initial);
  const momo = visual.root.getObjectByName('MomoOtter');
  const popo = visual.root.getObjectByName('PopoRabbit');
  assert.ok(momo && popo);
  assert.equal(momo.visible, false);
  assert.equal(popo.visible, false);
  assert.equal(momo.userData.species, 'otter');
  assert.equal(popo.userData.species, 'rabbit');
  assert.ok(
    momo
      .getObjectByName('TailPivot')
      .children.some((child) => child.name !== 'PomTail'),
  );
  const size = new Box3().setFromObject(popo).getSize(new Vector3());
  assert.ok(
    size.y > 1.2 && size.y < 1.9,
    'route friend is visible but smaller than child companion',
  );
  let meshes = 0,
    instanced = 0;
  visual.root.traverse((node) => {
    if (node.isMesh) {
      meshes++;
      for (const component of node.geometry.attributes.position.array)
        assert.ok(Number.isFinite(component));
      if (node.isInstancedMesh) {
        instanced++;
        for (const component of node.instanceMatrix.array)
          assert.ok(Number.isFinite(component));
      }
    }
  });
  assert.ok(instanced >= 10, 'ground detail is batched');
  assert.ok(meshes < 180, 'diorama/NPC mesh budget bounded');

  let time = 0;
  for (const route of ['river', 'garden']) {
    let state = transitionForest(initialForestState(), {
      type: 'choose-route',
      route,
    });
    visual.sync(state, time, { x: 0, z: 3.3 });
    assert.equal(momo.visible, route === 'river');
    assert.equal(popo.visible, route === 'garden');
    const npc = route === 'river' ? momo : popo;
    // Include either bank and travel over the real bridge, not a straight-line shortcut.
    const targets =
      route === 'river'
        ? [
            { x: 2.4, z: 3.4 },
            { x: 6.6, z: 0.6 },
            { x: 4.2, z: -0.4 },
            { x: 4.2, z: -3.4 },
            { x: 0, z: -4.3 },
          ]
        : [
            { x: -5.3, z: 4 },
            { x: -7, z: 0.4 },
            { x: -4.4, z: -1.2 },
            { x: -4.2, z: -3.4 },
            { x: 0, z: -4.3 },
          ];
    for (const [index, target] of targets.entries()) {
      const bridges = route === 'river' && index >= 3;
      for (let frame = 0; frame < 300; frame++) {
        time += 1 / 60;
        visual.update({
          dt: 1 / 60,
          time,
          player: target,
          moving: true,
          reducedMotion: false,
          walkable: (point) => isForestWalkablePoint(point, bridges),
          path: (from, to) => getCompanionNavigationPath(from, to, bridges),
        });
        assert.ok(
          isForestWalkablePoint(npc.position, bridges),
          'NPC never walks through a blocked creek',
        );
        assert.ok(Number.isFinite(npc.rotation.y), 'finite NPC turn');
      }
      assert.ok(
        Math.hypot(npc.position.x - target.x, npc.position.z - target.z) < 2,
        'NPC arrives close enough for eye contact',
      );
    }
    state = {
      ...state,
      craftDesign: route === 'river' ? 'star' : 'heart',
      bridges: route === 'river',
      gardenBloom: route === 'garden',
    };
    visual.sync(state, time, targets.at(-1));
    assert.equal(
      visual.root.getObjectByName('StarCraftDecorations').visible,
      route === 'river',
    );
    assert.equal(
      visual.root.getObjectByName('HeartCraftDecorations').visible,
      route === 'garden',
    );
    assert.ok(
      visual.cameraFocus(time),
      'scene change has a bounded cinematic glance',
    );
    assert.equal(
      visual.cameraFocus(time + 3),
      undefined,
      'camera returns to player',
    );
    visual.sync(
      { ...state, chapter: 'complete', ending: 'sky' },
      time + 1,
      targets.at(-1),
    );
    visual.update({
      dt: 0.05,
      time: time + 1.1,
      player: targets.at(-1),
      moving: false,
      reducedMotion: true,
      walkable: (point) => isForestWalkablePoint(point, state.bridges),
      path: (from, to) => getCompanionNavigationPath(from, to, state.bridges),
    });
    assert.equal(
      npc.visible,
      true,
      'selected route friend stays at the festival',
    );
    npc.rotation.y = Math.PI;
    for (let frame = 0; frame < 180; frame++)
      visual.update({
        dt: 1 / 60,
        time: time + 1.2 + frame / 60,
        player: targets.at(-1),
        camera: { x: targets.at(-1).x, z: targets.at(-1).z + 10 },
        moving: false,
        reducedMotion: false,
        walkable: (point) => isForestWalkablePoint(point, state.bridges),
        path: (from, to) => getCompanionNavigationPath(from, to, state.bridges),
      });
    assert.ok(
      Math.abs(Math.atan2(Math.sin(npc.rotation.y), Math.cos(npc.rotation.y))) <
        0.35,
      'ending companion turns forward for a shared celebration portrait',
    );
    visual.sync(initialForestState(), time + 4, { x: 0, z: 3.3 });
    assert.equal(momo.visible, false);
    assert.equal(popo.visible, false);
    assert.equal(
      visual.cameraFocus(time + 4),
      undefined,
      'new adventure clears prior ending shot',
    );
  }
  for (const width of [390, 768, 1280])
    for (const chapter of [
      'arrival',
      'crossing',
      'grove',
      'festival',
      'complete',
    ]) {
      const player = { x: 6.5, z: 2.1 };
      const framing = forestCameraFrame(
        player,
        { ...initial, chapter },
        width,
        { x: -8, z: -8 },
      );
      assert.ok(
        Math.abs(framing.x - player.x) < 1.3 &&
          Math.abs(framing.z - player.z) < 1.1,
        'camera never abandons the playable character',
      );
      assert.ok(
        framing.height < 7 && framing.distance <= 10,
        'closer, readable character framing',
      );
      const facing = getDrawingForestFacing({
        cameraOffset: {
          x: framing.x - player.x,
          z: framing.z + framing.distance - player.z,
        },
        movement: { x: 1, z: 0 },
        moving: true,
        yaw: Math.PI / 2,
        pitch: 0,
        dt: 0.05,
      });
      const baseYaw = Math.atan2(
        framing.x - player.x,
        framing.z + framing.distance - player.z,
      );
      assert.ok(
        Math.abs(facing.yaw - baseYaw) <= 0.45 + 1e-10,
        'camera framing preserves front-facing drawing puppet',
      );
    }
  for (const x of [-8, 8])
    for (const z of [-8, 4.8]) {
      const framing = forestCameraFrame({ x, z }, initial, 390);
      assert.ok(
        Math.abs(framing.x) <= 6.5 && framing.z >= -7 && framing.z <= 3.4,
        'map edge framing stays inside the clearing',
      );
      assert.ok(
        Math.abs(framing.x - x) <= 1.5 && Math.abs(framing.z - z) <= 1.5,
        'edge clamp still keeps hero in mobile view',
      );
    }
  for (const [width, height] of [
    [390, 480],
    [1280, 720],
    [768, 600],
  ]) {
    const crowded = Array.from({ length: 6 }, (_, index) => ({
      id: `lamp-${index}`,
      x: index % 2 ? width - 10 : 5,
      y: 90 + index * 8,
      width: 120,
      height: 32,
      onscreen: true,
      distance: index,
    }));
    const layout = layoutForestLabels(crowded, width, height);
    assert.equal(
      layout.length,
      6,
      'festival lamps and discoveries fit in the safe area',
    );
    for (const label of layout) {
      assert.ok(
        label.y - label.height >= (width < 650 ? 172 : 188),
        'labels stay below title and mission HUD',
      );
      assert.ok(
        label.y <= height - 108,
        'labels avoid lower joystick/sound controls',
      );
      assert.ok(
        label.x - label.width / 2 >= 14 &&
          label.x + label.width / 2 <= width - (width >= 1000 ? 340 : 14),
        'labels never crop or hide behind desktop mission card',
      );
      for (const other of layout.filter((candidate) => candidate !== label))
        assert.ok(
          Math.abs(label.x - other.x) >=
            (label.width + other.width) / 2 + 7.9 ||
            label.y <= other.y - other.height - 7.9 ||
            label.y - label.height >= other.y + 7.9,
          'label hit areas never overlap',
        );
    }
    const offscreen = layoutForestLabels(
      crowded.map((label) => ({ ...label, onscreen: false })),
      width,
      height,
    );
    assert.equal(
      offscreen.length,
      1,
      'empty map edge keeps exactly one nearest direction beacon',
    );
    assert.equal(offscreen[0].id, 'lamp-0');
    assert.equal(offscreen[0].edge, true);
    const finalLamp = {
      ...crowded[0],
      id: 'lantern-star',
      distance: 30,
      onscreen: false,
    };
    const secret = {
      ...crowded[1],
      id: 'secret-star',
      distance: 1,
      onscreen: false,
    };
    const requiredBeacon = layoutForestLabels(
      [secret, finalLamp],
      width,
      height,
    );
    assert.deepEqual(
      requiredBeacon.map((label) => label.id),
      ['lantern-star'],
      'last required lamp takes precedence over a nearer optional secret',
    );
    assert.equal(requiredBeacon[0].edge, true);
    const visibleSecret = layoutForestLabels(
      [{ ...secret, onscreen: true }, finalLamp],
      width,
      height,
    );
    assert.equal(
      visibleSecret.length,
      2,
      'visible discovery does not hide the offscreen required destination',
    );
    assert.equal(
      visibleSecret.find((label) => label.id === 'lantern-star').edge,
      true,
    );
    assert.equal(
      visibleSecret.find((label) => label.id === 'secret-star').edge,
      false,
    );
    const optionalOnly = layoutForestLabels([secret], width, height);
    assert.equal(
      optionalOnly[0].id,
      'secret-star',
      'optional exploration still works after required objectives are finished',
    );
  }
  const resources = new Set();
  visual.root.traverse((node) => {
    if (node.isMesh) {
      resources.add(node.geometry);
      for (const material of Array.isArray(node.material)
        ? node.material
        : [node.material])
        resources.add(material);
    }
  });
  const disposed = new Map();
  for (const resource of resources)
    resource.addEventListener('dispose', () =>
      disposed.set(resource, (disposed.get(resource) || 0) + 1),
    );
  visual.dispose();
  visual.dispose();
  assert.equal(visual.root.children.length, 0);
  assert.equal(
    disposed.size,
    resources.size,
    'all visible/hidden geometry and materials released',
  );
  assert.ok(
    [...disposed.values()].every((count) => count === 1),
    'shared resources disposed once',
  );
  console.log(
    'Forest visual smoke passed: cute route NPCs, mesh budget, batched detail, both-bank navigation, design marks, event/reset lifecycle, camera/puppet framing and resource disposal.',
  );
} finally {
  await server.close();
}
