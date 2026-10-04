import assert from 'node:assert/strict';
import { createServer } from 'vite';
import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Vector3,
} from 'three';
const server = await createServer({
  configFile: false,
  cacheDir: 'node_modules/.vite-forest-visual-test',
  root: process.cwd(),
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
});
try {
  const {
    createForestVisuals,
    forestCameraFrame,
    forestRouteFriendSlot,
    forestOwlSlot,
  } = await server.ssrLoadModule('/app/forest-diorama-visuals.ts');
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
    projectForestActorBounds,
    forestPlushTargetYaw,
    createWorldPointerGesture,
  } = await server.ssrLoadModule('/app/companion-world-runtime.ts');
  const gesture = createWorldPointerGesture();
  const primary = {
    pointerId: 7,
    clientX: 120,
    clientY: 80,
    button: 0,
    isPrimary: true,
  };
  const second = { ...primary, pointerId: 8, clientX: 280, isPrimary: false };
  assert.equal(
    gesture.begin({ ...primary, button: 2 }),
    false,
    'right click never starts a world gesture',
  );
  assert.equal(
    gesture.begin(second),
    false,
    'secondary finger cannot initiate a world tap',
  );
  assert.equal(gesture.begin(primary), true);
  assert.equal(
    gesture.begin({ ...second, isPrimary: true }),
    false,
    'an additional pointer cannot replace the active press even across input devices',
  );
  assert.equal(
    gesture.move({ ...second, clientX: 310 }),
    null,
    'other finger cannot orbit or turn a tap into a drag',
  );
  assert.equal(
    gesture.end(second),
    null,
    'other finger cannot commit the primary destination',
  );
  assert.equal(
    gesture.cancel(second.pointerId),
    false,
    'other finger cancellation cannot stop the owner',
  );
  assert.equal(gesture.pointerId, primary.pointerId);
  assert.deepEqual(
    gesture.end(primary),
    { tap: true, dx: 0 },
    'original press remains a valid single tap',
  );
  assert.equal(
    gesture.end(primary),
    null,
    'duplicate releases do not interact twice',
  );

  assert.equal(gesture.begin(primary), true);
  let orbitTravel = 0;
  for (let step = 1; step <= 12; step++)
    orbitTravel += gesture.move({
      ...primary,
      clientX: primary.clientX + step * 2,
    });
  assert.equal(orbitTravel, 24, 'slow orbit keeps incremental camera deltas');
  assert.deepEqual(
    gesture.end({ ...primary, clientX: primary.clientX + 24 }),
    { tap: false, dx: 0 },
    'twelve tiny home drags cannot become a pet/tap',
  );
  gesture.begin(primary);
  gesture.move({ ...primary, clientX: primary.clientX + 10 });
  gesture.move(primary);
  assert.equal(
    gesture.end(primary).tap,
    false,
    'dragging back to the start is still not a tap',
  );
  gesture.begin(primary);
  assert.equal(
    gesture.end({ ...primary, clientY: primary.clientY + 20 }).tap,
    false,
    'release displacement is checked even when move events were coalesced',
  );
  gesture.begin({ ...primary, pointerId: 0 });
  assert.equal(
    gesture.cancel(0),
    true,
    'pointer id zero cancels on lost capture',
  );
  assert.equal(
    gesture.end({ ...primary, pointerId: 0 }),
    null,
    'lost capture cannot leave a stale click behind',
  );
  assert.equal(
    gesture.begin(primary),
    true,
    'new input works after cancellation',
  );
  assert.equal(
    gesture.end({
      ...primary,
      clientX: primary.clientX + 2,
      clientY: primary.clientY + 1,
    }).tap,
    true,
    'normal touch jitter remains a tap after prior drags',
  );
  const button = new EventTarget();
  const captured = new Set();
  button.setPointerCapture = (id) => captured.add(id);
  button.hasPointerCapture = (id) => captured.has(id);
  button.releasePointerCapture = (id) => captured.delete(id);
  const pointerEvent = (type, values = {}) => {
    const event = new Event(type, { cancelable: true });
    for (const [key, value] of Object.entries({ ...primary, ...values }))
      Object.defineProperty(event, key, { value });
    return event;
  };
  let labelActivations = 0;
  const unbind = bindForestHotspotButton(button, () => labelActivations++);
  button.dispatchEvent(pointerEvent('pointerdown', second));
  assert.equal(
    labelActivations,
    0,
    'second finger cannot redirect the hero through a projected label',
  );
  const pointerPress = pointerEvent('pointerdown');
  button.dispatchEvent(pointerPress);
  assert.equal(
    labelActivations,
    0,
    'pressing a label cannot navigate before tap versus scroll is known',
  );
  assert.equal(
    pointerPress.defaultPrevented,
    false,
    'press preserves browser vertical scrolling',
  );
  assert.equal(
    captured.has(primary.pointerId),
    true,
    'camera movement cannot steal the pressed label',
  );
  button.dispatchEvent(pointerEvent('pointerdown', second));
  button.dispatchEvent(pointerEvent('pointercancel', second));
  assert.equal(
    captured.has(primary.pointerId),
    true,
    'another finger cannot cancel the owner',
  );
  button.dispatchEvent(
    pointerEvent('pointerup', { clientX: primary.clientX + 2 }),
  );
  assert.equal(
    labelActivations,
    1,
    'small touch jitter commits the captured label once',
  );
  assert.equal(captured.size, 0, 'tap releases pointer capture');
  const pointerClick = new Event('click', { cancelable: true });
  Object.defineProperty(pointerClick, 'detail', { value: 1 });
  button.dispatchEvent(pointerClick);
  assert.equal(
    labelActivations,
    1,
    'pointer click cannot trigger interaction twice',
  );
  button.dispatchEvent(pointerEvent('pointerdown'));
  button.dispatchEvent(
    pointerEvent('pointermove', { clientY: primary.clientY - 40 }),
  );
  button.dispatchEvent(pointerEvent('pointerup'));
  assert.equal(
    labelActivations,
    1,
    'a swipe returning to its start is still not a tap',
  );
  button.dispatchEvent(pointerEvent('pointerdown'));
  button.dispatchEvent(
    pointerEvent('pointerup', { clientY: primary.clientY + 30 }),
  );
  assert.equal(
    labelActivations,
    1,
    'coalesced vertical swipe is rejected at release',
  );
  for (const cancellation of ['pointercancel', 'lostpointercapture']) {
    button.dispatchEvent(pointerEvent('pointerdown'));
    button.dispatchEvent(pointerEvent(cancellation));
    button.dispatchEvent(pointerEvent('pointerup'));
    assert.equal(
      labelActivations,
      1,
      `${cancellation} prevents delayed activation`,
    );
    assert.equal(captured.size, 0);
  }
  const keyboardClick = new Event('click', { cancelable: true });
  Object.defineProperty(keyboardClick, 'detail', { value: 0 });
  button.dispatchEvent(keyboardClick);
  assert.equal(
    labelActivations,
    2,
    'keyboard/screen reader native activation preserved',
  );
  button.dispatchEvent(pointerEvent('pointerdown'));
  unbind();
  assert.equal(
    captured.size,
    0,
    'disposing a pressed label releases its pointer',
  );
  button.dispatchEvent(pointerEvent('pointerup'));
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
    const playerAtStart = { x: 0, z: 3.3 };
    const startSlot = forestRouteFriendSlot(playerAtStart, route);
    assert.equal(
      Math.sign(npc.position.x),
      Math.sign(startSlot.x),
      'Friend spawns on the same side it will follow',
    );
    let closestApproach = Infinity;
    for (let frame = 0; frame < 180; frame++) {
      time += 1 / 60;
      visual.update({
        dt: 1 / 60,
        time,
        player: playerAtStart,
        moving: false,
        reducedMotion: false,
        walkable: (point) => isForestWalkablePoint(point, false),
        path: (from, to) => getCompanionNavigationPath(from, to, false),
      });
      closestApproach = Math.min(
        closestApproach,
        Math.hypot(npc.position.x, npc.position.z - playerAtStart.z),
      );
    }
    assert.ok(
      closestApproach > 1.4,
      'Greeting follower does not walk through the player center',
    );
    assert.ok(
      npc.position.z < playerAtStart.z,
      'Settled follower stays on the camera-far side',
    );
    const owlSlot = forestOwlSlot(playerAtStart, route);
    assert.equal(
      Math.sign(owlSlot.x),
      -Math.sign(startSlot.x),
      'Owl occupies the opposite side regardless of movement heading',
    );
    assert.ok(owlSlot.z < playerAtStart.z);
    assert.equal(
      forestRouteFriendSlot(playerAtStart, route, () => false),
      null,
      'No safe slot never targets the player center',
    );
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
    // A late movement/event may leave a follower too close; celebration must
    // finish spacing the group instead of freezing this overlap.
    npc.position.set(targets.at(-1).x, 0, targets.at(-1).z);
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
    assert.ok(
      Math.hypot(
        npc.position.x - targets.at(-1).x,
        npc.position.z - targets.at(-1).z,
      ) > 1.35,
      'Completion resolves an overlapping companion before settling',
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
    [320, 410],
    [390, 410],
    [390, 480],
    [1280, 720],
    [768, 600],
  ]) {
    const crowded = Array.from({ length: 6 }, (_, index) => ({
      id: `lamp-${index}`,
      x: index % 2 ? width - 10 : 5,
      y: 90 + index * 8,
      width: width < 650 ? 130 : 150,
      height: 48,
      onscreen: true,
      distance: index,
    }));
    const layout = layoutForestLabels(crowded, width, height);
    assert.equal(
      layout.length,
      height === 410 ? 4 : 6,
      'readable touch targets fill the safe area without shrinking text',
    );
    for (const label of layout) {
      assert.ok(
        label.y - label.height >= (width < 650 ? 186 : 212),
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
  for (const [width, height] of [
    [320, 410],
    [390, 410],
    [390, 490],
    [1280, 720],
  ]) {
    const actors = [
      { left: width * 0.22, top: 223, right: width * 0.57, bottom: 327 },
      { left: width * 0.6, top: 233, right: width * 0.81, bottom: 300 },
    ];
    const labels = Array.from({ length: 6 }, (_, index) => ({
      id: index < 3 ? `lantern-${index}` : `secret-${index}`,
      x: width / 2,
      y: 254,
      width: 126,
      height: 44,
      onscreen: true,
      distance: index,
    }));
    const layout = layoutForestLabels(labels, width, height, {
      top: 160,
      avoid: actors,
    });
    assert.ok(
      layout.some((label) => label.id === 'lantern-0'),
      'nearest required target remains when a safe slot exists',
    );
    for (const label of layout) {
      assert.equal(
        label.height,
        44,
        'avoidance never shrinks the touch target',
      );
      assert.ok(label.y - label.height >= 160);
      assert.ok(label.y <= height - 108);
      for (const rect of actors)
        assert.ok(
          label.x + label.width / 2 <= rect.left ||
            label.x - label.width / 2 >= rect.right ||
            label.y <= rect.top ||
            label.y - label.height >= rect.bottom,
          'both greedy and grid placements keep the actual actors unobscured',
        );
      for (const other of layout.filter((candidate) => candidate !== label))
        assert.ok(
          Math.abs(label.x - other.x) >=
            (label.width + other.width) / 2 + 7.9 ||
            label.y <= other.y - other.height - 7.9 ||
            label.y - label.height >= other.y + 7.9,
          'actor avoidance does not stack hit targets',
        );
    }
    assert.deepEqual(
      layoutForestLabels(labels, width, height, {
        top: 160,
        avoid: [{ left: 0, top: 0, right: width, bottom: height }],
      }),
      [],
      'completely obstructed canvas defers to the existing full action guide, never overlays a face',
    );
    const required = { ...labels[0], onscreen: false, distance: 50 };
    const secret = { ...labels[3], distance: 0 };
    const prioritized = layoutForestLabels([secret, required], width, height, {
      top: 160,
      avoid: actors,
    });
    assert.equal(prioritized[0].id, required.id);
    assert.ok(
      prioritized.some((label) => label.id === secret.id),
      'safe optional discoveries remain selectable',
    );
  }
  const camera = new PerspectiveCamera(40, 390 / 490, 0.1, 100);
  camera.position.set(0, 2, 8);
  camera.lookAt(0, 1, 0);
  camera.updateMatrixWorld();
  const actor = new Group();
  const silhouette = new Mesh(
    new BoxGeometry(4, 2, 0.3),
    new MeshBasicMaterial(),
  );
  silhouette.name = 'InflatedDrawingSilhouette';
  silhouette.position.y = 1;
  actor.add(silhouette);
  const before = projectForestActorBounds(actor, camera, 390, 490);
  assert.ok(
    before.right - before.left > 250,
    'wide drawings protect the whole authored silhouette',
  );
  actor.position.x = 1;
  actor.scale.setScalar(0.6);
  const after = projectForestActorBounds(actor, camera, 390, 490);
  assert.ok(
    after.right - after.left < before.right - before.left,
    'cached mesh follows current scale',
  );
  assert.ok(
    (after.right + after.left) / 2 > (before.right + before.left) / 2,
    'cached mesh follows current translation',
  );
  actor.visible = false;
  assert.equal(projectForestActorBounds(actor, camera, 390, 490), null);
  actor.visible = true;
  actor.position.z = 100;
  assert.equal(
    projectForestActorBounds(actor, camera, 390, 490),
    null,
    'behind-camera actor does not reserve the screen',
  );
  silhouette.geometry.dispose();
  silhouette.material.dispose();
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
    'Forest visual smoke passed: pointer ownership/slow-drag safety, route NPCs, mesh budget, batched detail, both-bank navigation, design marks, event/reset lifecycle, camera/puppet framing and resource disposal.',
  );
} finally {
  await server.close();
}
