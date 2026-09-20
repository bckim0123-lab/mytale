import * as T from 'three';
import { createCreature } from './creature-rig';
import type { CreatureAction } from './creature-types';
import { FOREST_LOCATIONS, type ForestState } from './forest-story';

type Point = { x: number; z: number };
type Frame = {
  dt: number;
  time: number;
  player: Point;
  camera?: Point;
  moving: boolean;
  reducedMotion: boolean;
  walkable: (point: Point) => boolean;
  path: (from: Point, to: Point) => Point[];
};

/** Pure camera framing: stay near the child, with a small chapter/event glance.
 * It never jumps to an offscreen objective or takes away movement control. */
export function forestCameraFrame(
  player: Point,
  state: ForestState,
  width: number,
  focus?: Point,
) {
  const narrow = width < 650;
  const goal =
    focus ??
    (state.chapter === 'grove' ||
    state.chapter === 'festival' ||
    state.chapter === 'complete'
      ? FOREST_LOCATIONS['owl-grove']
      : player);
  const glance = focus ? 0.28 : 0.1;
  return {
    x: T.MathUtils.clamp(
      player.x +
        T.MathUtils.clamp(goal.x - player.x, -2, 2) * glance +
        (width >= 1000 ? 0.65 : 0),
      -6.5,
      6.5,
    ),
    y: state.chapter === 'complete' ? 1.1 : 0.94,
    z: T.MathUtils.clamp(
      player.z - 0.45 + T.MathUtils.clamp(goal.z - player.z, -2, 2) * glance,
      -7,
      3.4,
    ),
    height: narrow ? 6.6 : 6.9,
    distance: narrow ? 9.1 : 10.0,
  };
}

export function createForestVisuals(initial: ForestState) {
  const root = new T.Group();
  root.name = 'StorybookDiorama';
  const geometries = new Set<T.BufferGeometry>();
  const materials = new Set<T.Material>();
  const instances: T.InstancedMesh[] = [];
  const geo = <G extends T.BufferGeometry>(value: G) => {
    geometries.add(value);
    return value;
  };
  const mat = (color: string) => {
    const result = new T.MeshStandardMaterial({ color, roughness: 0.88 });
    materials.add(result);
    return result;
  };
  const sphere = geo(new T.SphereGeometry(1, 10, 7));
  const cylinder = geo(new T.CylinderGeometry(1, 1, 1, 10));
  const greens = [mat('#86a578'), mat('#aac68c'), mat('#6a9b80')];
  const cream = mat('#fff0cf'),
    pink = mat('#efaeb9'),
    gold = mat('#e8c879');
  const pathMaterial = mat('#d9c5a3'),
    wood = mat('#957357'),
    mushroomMaterial = mat('#d69a9e');
  const moss = mat('#91ae7c');
  const mint = mat('#9bc5ba');
  const matrix = new T.Object3D();
  function part(
    parent: T.Object3D,
    geometry: T.BufferGeometry,
    material: T.Material,
    position: number[],
    scale: number[],
  ) {
    const mesh = new T.Mesh(geometry, material);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.scale.set(scale[0], scale[1], scale[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function batch(
    parent: T.Object3D,
    geometry: T.BufferGeometry,
    material: T.Material,
    values: Array<{ p: number[]; s: number[]; rotation?: number[] }>,
    shadows = false,
  ) {
    const mesh = new T.InstancedMesh(geometry, material, values.length);
    values.forEach((value, index) => {
      matrix.position.set(value.p[0], value.p[1], value.p[2]);
      matrix.scale.set(value.s[0], value.s[1], value.s[2]);
      matrix.rotation.set(
        ...((value.rotation ?? [0, 0, 0]) as [number, number, number]),
      );
      matrix.updateMatrix();
      mesh.setMatrixAt(index, matrix.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    parent.add(mesh);
    instances.push(mesh);
    return mesh;
  }
  const sharedPath: { p: number[]; s: number[]; rotation?: number[] }[] = [];
  const routePaths = { river: new T.Group(), garden: new T.Group() };
  routePaths.river.name = 'RiverFootpath';
  routePaths.garden.name = 'GardenFootpath';
  root.add(routePaths.river, routePaths.garden);
  for (const [route, sign] of [
    ['river', 1],
    ['garden', -1],
  ] as const) {
    const stones = [];
    for (let i = 0; i < 22; i++) {
      const t = i / 21;
      const x = sign * (Math.sin(t * Math.PI * 0.65) * 4.4);
      const z = 3.4 - t * 3.65;
      stones.push({
        p: [x, -0.038, z],
        s: [0.43 + Math.sin(i) * 0.05, 0.038, 0.27],
        rotation: [0, sign * 0.4 + Math.sin(i) * 0.3, 0],
      });
    }
    batch(routePaths[route], sphere, pathMaterial, stones);
  }
  for (let i = 0; i < 13; i++) {
    const t = i / 12;
    sharedPath.push({
      p: [Math.sin(t * Math.PI * 2) * 0.4, -0.035, -0.25 - t * 7],
      s: [0.46, 0.035, 0.32],
      rotation: [0, t * 2, 0],
    });
  }
  batch(root, sphere, pathMaterial, sharedPath);

  // Every ground detail is low enough to preserve the character's silhouette.
  // Hundreds of blades/flower heads share geometry and a small number of draws.
  for (let color = 0; color < 3; color++) {
    const blades = [],
      groundPatches = [],
      buds = [];
    for (let i = 0; i < 58; i++) {
      const a = i * 2.399 + color * 0.7;
      const ring = 3.4 + ((i * 17 + color * 7) % 55) / 10;
      const x = Math.cos(a) * ring;
      const z = Math.sin(a) * ring * 0.66 - 1.2;
      if (x > 1.2 && z > -3 && z < -0.7) continue;
      // Keep all interaction landing pads clear.
      if (
        Object.values(FOREST_LOCATIONS).some(
          (p) => Math.hypot(p.x - x, p.z - z) < 0.75,
        )
      )
        continue;
      for (let blade = 0; blade < 3; blade++) {
        blades.push({
          p: [x + (blade - 1) * 0.09, 0.1, z],
          s: [0.045, 0.12 + (i % 3) * 0.025, 0.035],
          rotation: [0, a, (blade - 1) * 0.4],
        });
      }
      if (i % 3 === 0)
        groundPatches.push({
          p: [x, -0.052, z],
          s: [0.5, 0.02, 0.32],
          rotation: [0, a, 0],
        });
      if (i % 4 === 0)
        buds.push({ p: [x + 0.12, 0.27, z + 0.12], s: [0.09, 0.1, 0.08] });
    }
    batch(root, sphere, greens[color], blades);
    batch(root, sphere, moss, groundPatches);
    batch(root, sphere, color % 2 ? pink : cream, buds);
  }
  // Small keepsake-like props make each branch recognizable at walking height.
  const branchProps = { river: new T.Group(), garden: new T.Group() };
  root.add(branchProps.river, branchProps.garden);
  for (const [x, z] of [
    [5.4, 4.05],
    [7.35, 0.3],
    [6.9, -3.55],
  ]) {
    part(branchProps.river, sphere, moss, [x, -0.01, z], [0.62, 0.08, 0.4]);
    const pebble = part(
      branchProps.river,
      sphere,
      cream,
      [x, 0.18, z],
      [0.31, 0.18, 0.22],
    );
    pebble.rotation.y = x;
    part(
      branchProps.river,
      sphere,
      mint,
      [x + 0.3, 0.13, z + 0.15],
      [0.17, 0.12, 0.14],
    );
  }
  for (const [x, z] of [
    [-3.6, 4.15],
    [-7.8, 1.2],
    [-5.1, -3.7],
  ]) {
    for (let i = 0; i < 3; i++) {
      const size = 0.65 + i * 0.2,
        px = x + i * 0.24,
        pz = z + Math.sin(i) * 0.18;
      part(
        branchProps.garden,
        cylinder,
        cream,
        [px, 0.2 * size, pz],
        [0.055 * size, 0.4 * size, 0.055 * size],
      );
      part(
        branchProps.garden,
        sphere,
        mushroomMaterial,
        [px, 0.43 * size, pz],
        [0.24 * size, 0.13 * size, 0.22 * size],
      );
      part(
        branchProps.garden,
        sphere,
        cream,
        [px - 0.05, 0.53 * size, pz + 0.06],
        [0.045, 0.025, 0.04],
      );
    }
  }

  function shapeGeometry(design: 'star' | 'heart') {
    const shape = new T.Shape();
    if (design === 'star') {
      for (let i = 0; i < 10; i++) {
        const angle = Math.PI / 2 + (i * Math.PI) / 5,
          r = i % 2 ? 0.45 : 1;
        if (i === 0) shape.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
        else shape.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
      }
    } else {
      shape.moveTo(0, -0.85);
      shape.bezierCurveTo(-1.5, -0.03, -1.15, 1.2, -0.35, 0.87);
      shape.quadraticCurveTo(-0.12, 0.78, 0, 0.55);
      shape.quadraticCurveTo(0.12, 0.78, 0.35, 0.87);
      shape.bezierCurveTo(1.15, 1.2, 1.5, -0.03, 0, -0.85);
    }
    shape.closePath();
    return geo(
      new T.ExtrudeGeometry(shape, {
        depth: 0.11,
        bevelEnabled: true,
        bevelSize: 0.045,
        bevelThickness: 0.045,
        bevelSegments: 2,
        steps: 1,
        curveSegments: 12,
      }),
    );
  }
  const symbols = {
    star: shapeGeometry('star'),
    heart: shapeGeometry('heart'),
  };
  const craftGroups = { star: new T.Group(), heart: new T.Group() };
  craftGroups.star.name = 'StarCraftDecorations';
  craftGroups.heart.name = 'HeartCraftDecorations';
  root.add(craftGroups.star, craftGroups.heart);
  const bridgeSymbols: T.Object3D[] = [],
    flowerSymbols: T.Object3D[] = [],
    festivalSymbols: T.Object3D[] = [];
  for (const design of ['star', 'heart'] as const) {
    const container = craftGroups[design];
    for (const [x, z] of [
      [3.46, -0.48],
      [4.94, -3.28],
    ]) {
      const badge = part(
        container,
        symbols[design],
        design === 'heart' ? pink : gold,
        [x, 0.86, z + 0.045],
        [0.22, 0.22, 0.22],
      );
      badge.userData.scene = 'bridge';
      bridgeSymbols.push(badge);
    }
    // The child's pattern appears as a little channel of coloured stones.
    const channel = new T.Group();
    channel.position.set(-4.4, 0.07, -1.45);
    container.add(channel);
    const outline =
      design === 'star'
        ? Array.from({ length: 40 }, (_, i) => {
            const edge = Math.floor(i / 4),
              t = (i % 4) / 4;
            const point = (j: number) => {
              const a = Math.PI / 2 + (j * Math.PI) / 5,
                r = j % 2 ? 0.42 : 0.93;
              return { x: Math.cos(a) * r, z: Math.sin(a) * r };
            };
            const a = point(edge),
              b = point((edge + 1) % 10);
            return {
              x: T.MathUtils.lerp(a.x, b.x, t),
              z: T.MathUtils.lerp(a.z, b.z, t),
            };
          })
        : Array.from({ length: 40 }, (_, i) => {
            const a = (i / 40) * Math.PI * 2;
            return {
              x: (16 * Math.sin(a) ** 3) / 18,
              z:
                -(
                  13 * Math.cos(a) -
                  5 * Math.cos(2 * a) -
                  2 * Math.cos(3 * a) -
                  Math.cos(4 * a)
                ) / 18,
            };
          });
    batch(
      channel,
      sphere,
      design === 'heart' ? pink : mint,
      outline.map((p) => ({ p: [p.x, 0, p.z * 0.7], s: [0.08, 0.035, 0.08] })),
    );
    channel.userData.scene = 'garden';
    flowerSymbols.push(channel);
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 * i) / 6;
      const badge = part(
        container,
        symbols[design],
        design === 'heart' ? pink : gold,
        [Math.cos(a) * 2.0, 2.1 + (i % 2) * 0.35, -7.55 + Math.sin(a) * 0.25],
        [0.15, 0.15, 0.15],
      );
      badge.userData.phase = i;
      festivalSymbols.push(badge);
    }
  }

  const otter = createCreature({
    kind: 'bear',
    bodyColor: '#b99173',
    accentColor: '#94bfc4',
    accessory: 'scarf',
    pattern: 'plain',
  });
  otter.root.name = 'MomoOtter';
  const rabbit = createCreature({
    kind: 'bunny',
    bodyColor: '#fff0df',
    accentColor: '#d9a6b3',
    accessory: 'flower',
    earStyle: 'floppy',
  });
  rabbit.root.name = 'PopoRabbit';
  for (const rig of [otter, rabbit]) {
    rig.root.scale.setScalar(0.55);
    rig.root.visible = false;
    root.add(rig.root);
  }
  const otterFur = (otter.root.getObjectByName('PearBody') as T.Mesh)
    .material as T.Material;
  const tail = otter.root.getObjectByName('TailPivot')!;
  const pom = otter.root.getObjectByName('PomTail');
  if (pom) pom.visible = false;
  part(
    tail,
    sphere,
    otterFur,
    [0, -0.055, -0.47],
    [0.21, 0.13, 0.58],
  ).rotation.x = -0.1;
  const nose = otter.root.getObjectByName('ButtonNose') as T.Mesh;
  nose.material = wood;
  nose.scale.set(0.1, 0.068, 0.06);
  for (const side of [-1, 1]) {
    const ear = otter.root.getObjectByName(side < 0 ? 'EarL' : 'EarR')!;
    ear.scale.setScalar(0.7);
    for (const row of [-1, 1]) {
      const whisker = part(
        otter.root.getObjectByName('HeadPivot')!,
        cylinder,
        cream,
        [side * 0.26, -0.26 + row * 0.038, 0.676],
        [0.006, 0.2, 0.006],
      );
      whisker.rotation.z = side * 1.31 + row * 0.13;
    }
  }
  for (const name of ['MuzzleL', 'MuzzleR'])
    otter.root.getObjectByName(name)!.scale.multiplyScalar(1.12);
  otter.root.userData.species = 'otter';
  rabbit.root.userData.species = 'rabbit';
  let state = initial;
  let route = initial.route;
  let npcAction: CreatureAction = 'wave',
    npcActionUntil = 2,
    actionId = 1;
  let followPath: Point[] = [];
  let nextPathAt = 0;
  let eventAt = -100;
  let eventPoint: Point = { x: 0, z: 0 };
  const eventGlowMaterial = new T.MeshBasicMaterial({
    color: '#ffe7a7',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: T.DoubleSide,
  });
  materials.add(eventGlowMaterial);
  const eventGlow = new T.Mesh(
    geo(new T.RingGeometry(0.5, 1, 48)),
    eventGlowMaterial,
  );
  eventGlow.rotation.x = -Math.PI / 2;
  eventGlow.position.y = 0.075;
  eventGlow.visible = false;
  root.add(eventGlow);
  const activeRig = () => (state.route === 'river' ? otter : rabbit);
  function trigger(
    time: number,
    point: Point,
    action: CreatureAction = 'celebrate',
  ) {
    eventAt = time;
    eventPoint = { ...point };
    npcAction = action;
    npcActionUntil = time + 2.6;
    actionId++;
  }
  function sync(next: ForestState, time: number, player: Point) {
    const changedRoute = next.route !== route;
    if (changedRoute && next.route === 'undecided') {
      eventAt = -100;
      followPath = [];
    }
    if (changedRoute && next.route !== 'undecided') {
      const rig = next.route === 'river' ? otter : rabbit;
      rig.root.position.set(
        player.x + (next.route === 'river' ? 1.25 : -1.25),
        0,
        player.z - 0.1,
      );
      npcAction = 'wave';
      npcActionUntil = time + 2;
      actionId++;
      followPath = [];
      nextPathAt = 0;
    }
    if (!state.bridges && next.bridges) trigger(time, { x: 4.2, z: -1.6 });
    else if (!state.gardenBloom && next.gardenBloom)
      trigger(time, { x: -4.4, z: -1.1 });
    else if (!state.ending && next.ending) trigger(time, { x: 0, z: -5.0 });
    else if ((next.discoveries?.length ?? 0) > (state.discoveries?.length ?? 0))
      trigger(time, player, 'curious');
    else if (
      next.collected.length > state.collected.length ||
      next.watered.length > state.watered.length
    ) {
      npcAction = next.watered.length > state.watered.length ? 'hop' : 'wave';
      npcActionUntil = time + 1.2;
      actionId++;
    }
    state = next;
    route = next.route;
    routePaths.river.visible = next.route !== 'garden';
    routePaths.garden.visible = next.route !== 'river';
    branchProps.river.visible = next.route !== 'garden';
    branchProps.garden.visible = next.route !== 'river';
    craftGroups.star.visible = next.craftDesign === 'star';
    craftGroups.heart.visible = next.craftDesign === 'heart';
    for (const symbol of bridgeSymbols) symbol.visible = next.bridges;
    for (const symbol of flowerSymbols)
      symbol.visible = next.route === 'garden' && Boolean(next.craftDesign);
    for (const symbol of festivalSymbols)
      symbol.visible =
        next.chapter === 'festival' || next.chapter === 'complete';
    otter.root.visible = next.route === 'river';
    rabbit.root.visible = next.route === 'garden';
  }
  // On reload the selected friend starts beside the player, never across a river.
  activeRig().root.position.set(
    initial.route === 'river' ? 1.25 : -1.25,
    0,
    3.3,
  );
  sync(initial, 0, { x: 0, z: 3.3 });
  const tempTarget = new T.Vector3();
  let disposed = false;
  function update(frame: Frame) {
    if (disposed) return;
    const { player, time, reducedMotion } = frame;
    const dt = T.MathUtils.clamp(frame.dt, 0, 0.05);
    const rig = activeRig();
    if (state.route !== 'undecided') {
      const side = state.route === 'river' ? -1 : 1;
      const beside = { x: player.x + side * 1.2, z: player.z + 0.28 };
      const target = frame.walkable(beside)
        ? beside
        : { x: player.x, z: player.z + 0.9 };
      const targetSafe = frame.walkable(target) ? target : player;
      if (time > nextPathAt) {
        nextPathAt = time + 0.35;
        followPath = frame.path(rig.root.position, targetSafe);
      }
      const posing =
        !frame.moving &&
        (state.chapter === 'complete' ||
          (time < npcActionUntil && npcAction === 'celebrate'));
      if (
        posing &&
        Math.hypot(
          player.x - rig.root.position.x,
          player.z - rig.root.position.z,
        ) < 2.8
      )
        followPath = [];
      let npcMoving = false;
      const step = followPath[0];
      if (step) {
        const distance = Math.hypot(
          step.x - rig.root.position.x,
          step.z - rig.root.position.z,
        );
        if (distance < 0.08) followPath.shift();
        else {
          const move = Math.min(distance, dt * (distance > 2 ? 4.2 : 3.0));
          tempTarget.set(
            rig.root.position.x +
              ((step.x - rig.root.position.x) / distance) * move,
            0,
            rig.root.position.z +
              ((step.z - rig.root.position.z) / distance) * move,
          );
          if (frame.walkable(tempTarget)) {
            rig.root.position.copy(tempTarget);
            npcMoving = true;
          }
        }
      }
      const toPlayer = Math.atan2(
        player.x - rig.root.position.x,
        player.z - rig.root.position.z,
      );
      const wantedYaw =
        posing && !npcMoving
          ? Math.atan2(
              (frame.camera?.x ?? player.x) - rig.root.position.x,
              (frame.camera?.z ?? player.z + 10) - rig.root.position.z,
            )
          : npcMoving && step
            ? Math.atan2(
                step.x - rig.root.position.x,
                step.z - rig.root.position.z,
              )
            : T.MathUtils.clamp(toPlayer, -0.75, 0.75);
      rig.root.rotation.y +=
        Math.atan2(
          Math.sin(wantedYaw - rig.root.rotation.y),
          Math.cos(wantedYaw - rig.root.rotation.y),
        ) *
        (1 - Math.exp(-dt * 6));
      rig.update(dt, time, {
        moving: npcMoving,
        speed: 0.8,
        action:
          time < npcActionUntil
            ? npcAction
            : state.ending === 'sky'
              ? 'curious'
              : 'idle',
        actionId,
        reducedMotion,
        lookX: T.MathUtils.clamp(
          toPlayer - rig.root.rotation.y,
          posing ? -0.3 : -1,
          posing ? 0.3 : 1,
        ),
        lookY: state.ending === 'sky' ? -0.45 : -0.12,
      });
    }
    const age = time - eventAt;
    eventGlow.visible = age >= 0 && age < 2.8;
    if (eventGlow.visible) {
      eventGlow.position.x = eventPoint.x;
      eventGlow.position.z = eventPoint.z;
      eventGlow.scale.setScalar(reducedMotion ? 2 : 0.5 + age * 1.6);
      eventGlowMaterial.opacity = reducedMotion
        ? 0.1
        : Math.sin(Math.min(1, age / 2.8) * Math.PI) * 0.32;
    }
    for (const symbol of festivalSymbols)
      if (symbol.visible) {
        symbol.rotation.z = reducedMotion
          ? 0
          : Math.sin(time * 1.2 + Number(symbol.userData.phase)) * 0.1;
      }
  }
  return {
    root,
    sync,
    update,
    react(action: CreatureAction, time: number) {
      npcAction = action === 'pet' ? 'curious' : action;
      npcActionUntil = time + (action === 'sleep' ? 3 : 1.5);
      actionId++;
    },
    cameraFocus(time: number): Point | undefined {
      return time - eventAt < 2.8 ? eventPoint : undefined;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      otter.dispose();
      rabbit.dispose();
      for (const instance of instances) instance.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      root.clear();
    },
  };
}
