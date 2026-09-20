import * as T from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createCreature } from './creature-rig';
import type { CreatureAppearance } from './creature-types';
import {
  FOREST_BED_IDS,
  FOREST_LANTERN_IDS,
  FOREST_LOCATIONS,
  getForestView,
  type ForestState,
} from './forest-story';

export type ForestPoint = { x: number; z: number };
type WaterBounds = { minX: number; maxX: number; minZ: number; maxZ: number };
const BRIDGE_X = FOREST_LOCATIONS['river-bridge'].x;
const CREEK_Z = -1.875;
// Collision includes room for the creature's feet. The bridge build marker is on the south bank.
const CREEK: WaterBounds = { minX: 1.25, maxX: 8.5, minZ: -2.9, maxZ: -0.85 };
function waterBounds(bridgeBuilt: boolean): WaterBounds[] {
  return bridgeBuilt
    ? [
        { ...CREEK, maxX: BRIDGE_X - 0.56 },
        { ...CREEK, minX: BRIDGE_X + 0.56 },
      ]
    : [CREEK];
}
function insideWater(point: ForestPoint, bounds: WaterBounds) {
  return (
    point.x > bounds.minX &&
    point.x < bounds.maxX &&
    point.z > bounds.minZ &&
    point.z < bounds.maxZ
  );
}
export function isForestWalkablePoint(
  point: ForestPoint,
  bridgeBuilt: boolean,
) {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.z) &&
    point.x >= -8 &&
    point.x <= 8 &&
    point.z >= -8 &&
    point.z <= 4.8 &&
    !waterBounds(bridgeBuilt).some((bounds) => insideWater(point, bounds))
  );
}
function nearestWalkablePoint(
  point: ForestPoint,
  bridgeBuilt: boolean,
): ForestPoint {
  const bounded = {
    x: Math.max(-8, Math.min(8, point.x)),
    z: Math.max(-8, Math.min(4.8, point.z)),
  };
  if (isForestWalkablePoint(bounded, bridgeBuilt)) return bounded;
  const candidates = waterBounds(bridgeBuilt)
    .flatMap((bounds) => [
      { x: bounds.minX - 0.12, z: bounded.z },
      { x: bounds.maxX + 0.12, z: bounded.z },
      { x: bounded.x, z: bounds.minZ - 0.12 },
      { x: bounded.x, z: bounds.maxZ + 0.12 },
    ])
    .filter((candidate) => isForestWalkablePoint(candidate, bridgeBuilt));
  candidates.sort(
    (a, b) =>
      Math.hypot(a.x - bounded.x, a.z - bounded.z) -
      Math.hypot(b.x - bounded.x, b.z - bounded.z),
  );
  return candidates[0] ?? { x: 0, z: 3.3 };
}
function segmentMeetsWater(
  from: ForestPoint,
  to: ForestPoint,
  bounds: WaterBounds,
) {
  let near = 0;
  let far = 1;
  for (const [start, delta, low, high] of [
    [from.x, to.x - from.x, bounds.minX, bounds.maxX],
    [from.z, to.z - from.z, bounds.minZ, bounds.maxZ],
  ]) {
    if (Math.abs(delta) < 0.000001) {
      if (start <= low || start >= high) return false;
      continue;
    }
    const a = (low - start) / delta;
    const b = (high - start) / delta;
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
    if (near >= far) return false;
  }
  return near < far;
}
/** Small visibility graph routes around banks and across the built bridge; no AI/API call. */
export function getCompanionNavigationPath(
  start: ForestPoint,
  target: ForestPoint,
  bridgeBuilt: boolean,
): ForestPoint[] {
  const from = nearestWalkablePoint(start, bridgeBuilt);
  const to = nearestWalkablePoint(target, bridgeBuilt);
  const obstacles = waterBounds(bridgeBuilt);
  const corners = obstacles
    .flatMap((bounds) => [
      { x: bounds.minX - 0.12, z: bounds.minZ - 0.12 },
      { x: bounds.minX - 0.12, z: bounds.maxZ + 0.12 },
      { x: bounds.maxX + 0.12, z: bounds.minZ - 0.12 },
      { x: bounds.maxX + 0.12, z: bounds.maxZ + 0.12 },
    ])
    .filter((point) => isForestWalkablePoint(point, bridgeBuilt));
  const points = [from, to, ...corners];
  const distances = points.map((_, index) => (index === 0 ? 0 : Infinity));
  const previous = points.map(() => -1);
  const visited = new Set<number>();
  for (let step = 0; step < points.length; step++) {
    let current = -1;
    for (let index = 0; index < points.length; index++)
      if (
        !visited.has(index) &&
        (current < 0 || distances[index] < distances[current])
      )
        current = index;
    if (current < 0 || !Number.isFinite(distances[current])) return [];
    if (current === 1) break;
    visited.add(current);
    for (let next = 0; next < points.length; next++) {
      if (
        visited.has(next) ||
        obstacles.some((bounds) =>
          segmentMeetsWater(points[current], points[next], bounds),
        )
      )
        continue;
      const distance =
        distances[current] +
        Math.hypot(
          points[current].x - points[next].x,
          points[current].z - points[next].z,
        );
      if (distance < distances[next]) {
        distances[next] = distance;
        previous[next] = current;
      }
    }
  }
  const route: ForestPoint[] = [];
  for (let index = 1; index !== 0; index = previous[index]) {
    if (index < 0) return [];
    route.unshift(points[index]);
  }
  return route;
}

export type WorldAction =
  | 'idle'
  | 'wave'
  | 'hop'
  | 'celebrate'
  | 'curious'
  | 'pet'
  | 'sleep';
export type WorldOptions = {
  mode: 'home' | 'forest';
  appearance: CreatureAppearance;
  forest: ForestState;
  onInteract: (id: string) => void;
  onPet: () => void;
  onStatus: (text: string) => void;
};

/** A real mesh world. The UI only requests destinations; interactions fire after arrival. */
export function mountCompanionWorld(host: HTMLElement, options: WorldOptions) {
  const renderer = new T.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.domElement.setAttribute(
    'aria-label',
    options.mode === 'home'
      ? '움직이는 입체 친구. 드래그해서 돌려 보고 친구를 눌러 인사해요.'
      : '달빛 숲. 땅을 누르면 걸어가고 반짝이는 물건을 누르면 가까이 가서 살펴봐요.',
  );
  renderer.domElement.setAttribute('tabindex', '0');
  host.appendChild(renderer.domElement);
  const scene = new T.Scene();
  const home = options.mode === 'home';
  scene.background = new T.Color(home ? '#f4ecda' : '#b8d6c5');
  scene.fog = new T.Fog(home ? '#f4ecda' : '#b8d6c5', 27, 52);
  const camera = new T.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(home ? 3.5 : 0, home ? 2.8 : 10.3, home ? 7.4 : 14.95);
  const lookAt = new T.Vector3(0, home ? 1.3 : 0.45, home ? 0 : 1.95);
  camera.lookAt(lookAt);
  const pmrem = new T.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.35;
  room.dispose();
  pmrem.dispose();
  const hemisphere = new T.HemisphereLight('#ffeed5', '#6a967f', 1);
  scene.add(hemisphere);
  const sun = new T.DirectionalLight('#fff0cf', 2);
  sun.position.set(-7, 13, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -13,
    right: 13,
    top: 13,
    bottom: -13,
    near: 0.1,
    far: 40,
  });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  const fill = new T.DirectionalLight('#d8ecff', 0.7);
  fill.position.set(5, 4, -6);
  scene.add(fill);
  const geometries = new Set<T.BufferGeometry>();
  const materials = new Set<T.Material>();
  const textures = new Set<T.Texture>();
  const geo = <G extends T.BufferGeometry>(g: G) => {
    geometries.add(g);
    return g;
  };
  const mat = (color: string, roughness = 0.82) => {
    const m = new T.MeshStandardMaterial({ color, roughness });
    materials.add(m);
    return m;
  };
  const sphere = geo(new T.SphereGeometry(1, 20, 14));
  const cylinder = geo(new T.CylinderGeometry(1, 1, 1, 20));
  const cube = geo(new T.BoxGeometry(1, 1, 1));
  const groundMat = mat(home ? '#d8dbb2' : '#89ad82');
  const pathMat = mat('#e3ceab');
  const cream = mat('#fff1c9');
  const bark = mat('#a98765');
  const pink = mat('#edada9');
  const gold = mat('#f7ca72', 0.35);
  const leaf = mat('#6eaa88');
  const dark = mat('#333c3a', 0.28);
  const mint = mat('#92b99a');
  const lightLeaf = mat('#b9ce9a');
  const glow = mat('#fff1b2', 0.5);
  glow.emissive.set('#ffbf65');
  glow.emissiveIntensity = 0.7;
  const waterMat = mat('#82cbd1', 0.18);
  waterMat.metalness = 0.1;
  function mesh(
    g: T.BufferGeometry,
    m: T.Material,
    parent: T.Object3D,
    p: number[],
    s = [1, 1, 1],
  ) {
    const item = new T.Mesh(g, m);
    item.position.set(p[0], p[1], p[2]);
    item.scale.set(s[0], s[1], s[2]);
    item.castShadow = true;
    item.receiveShadow = true;
    parent.add(item);
    return item;
  }
  function ball(parent: T.Object3D, m: T.Material, p: number[], s: number[]) {
    return mesh(sphere, m, parent, p, s);
  }
  mesh(
    cylinder,
    groundMat,
    scene,
    [0, -0.34, -1.4],
    home ? [4.6, 0.5, 3.6] : [11.8, 0.6, 11],
  );
  mesh(
    cylinder,
    mat('#ceb38c'),
    scene,
    [0, -0.72, -1.4],
    home ? [4.65, 0.4, 3.65] : [11.85, 0.4, 11.05],
  );
  const terrain = mesh(
    geo(new T.PlaneGeometry(160, 160)),
    mat(home ? '#f4ecda' : '#b8d6c5'),
    scene,
    [0, -1.01, 0],
  );
  terrain.rotation.x = -Math.PI / 2;
  terrain.castShadow = false;
  const path = new T.Group();
  scene.add(path);
  for (let i = 0; i < (home ? 3 : 15); i++) {
    const z = home ? 0.8 + i * 0.7 : 4.7 - i * 0.8;
    const x = home ? 1.8 : Math.sin(i * 0.36) * 1.4;
    const stone = ball(
      path,
      pathMat,
      [x, -0.002, z],
      [home ? 0.5 : 0.95, 0.065, 0.54],
    );
    stone.rotation.y = i * 0.7;
    stone.castShadow = false;
  }
  function tree(x: number, z: number, size: number, alternate = false) {
    const group = new T.Group();
    group.position.set(x, 0, z);
    group.scale.setScalar(size);
    scene.add(group);
    mesh(cylinder, bark, group, [0, 1.2, 0], [0.18, 2.4, 0.18]);
    const color = alternate ? mint : leaf;
    ball(group, color, [0, 2.7, 0], [1.05, 1.35, 0.93]);
    ball(
      group,
      alternate ? lightLeaf : mint,
      [-0.56, 2.17, 0.14],
      [0.72, 0.93, 0.74],
    );
    ball(group, color, [0.62, 2.2, 0], [0.67, 0.9, 0.72]);
  }
  if (home) {
    tree(-3.1, -2.5, 0.85, true);
    tree(3.1, -3.2, 0.65);
  } else {
    const trees = [
      [-9, 1],
      [-9, -3],
      [-8, -7],
      [-5, -9],
      [-1, -10],
      [3, -9],
      [7, -8],
      [9, -4],
      [10, 0],
      [8, 5],
      [-7, 5],
      [-4, 7],
      [2, 7],
    ];
    trees.forEach(([x, z], i) =>
      // Near-camera foliage stays low so the friend never vanishes behind it.
      tree(
        x,
        z,
        z >= 5 ? 0.24 + (i % 2) * 0.06 : 0.85 + (i % 3) * 0.18,
        i % 2 === 0,
      ),
    );
    mesh(cube, waterMat, scene, [6, -0.005, CREEK_Z], [9.1, 0.06, 1.55]);
    ball(scene, waterMat, [1.65, -0.005, CREEK_Z], [0.65, 0.035, 0.775]);
    for (let i = 0; i < 16; i++) {
      const x = 1.5 + Math.floor(i / 2) * 1.2;
      if (Math.abs(x - BRIDGE_X) < 0.8) continue;
      ball(
        scene,
        pathMat,
        [x, -0.015, CREEK_Z + (i % 2 === 0 ? -0.92 : 0.92)],
        [0.36, 0.15, 0.25],
      );
    }
  }
  const flowers = new T.Group();
  scene.add(flowers);
  function flower(
    parent: T.Object3D,
    x: number,
    z: number,
    color: T.Material,
    scale = 1,
  ) {
    const g = new T.Group();
    g.position.set(x, 0, z);
    g.scale.setScalar(scale);
    parent.add(g);
    mesh(cylinder, leaf, g, [0, 0.17, 0], [0.025, 0.32, 0.025]);
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 0.4;
      ball(
        g,
        color,
        [Math.cos(a) * 0.1, 0.37 + Math.sin(a) * 0.09, 0],
        [0.095, 0.095, 0.05],
      );
    }
    ball(g, gold, [0, 0.37, 0.06], [0.06, 0.06, 0.05]);
    return g;
  }
  for (let i = 0; i < (home ? 13 : 24); i++) {
    const a = i * 2.399;
    const r = home ? 2.4 + (i % 3) * 0.3 : 6 + (i % 4) * 0.6;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r - 1.5;
    if (!home && insideWater({ x, z }, CREEK)) continue;
    flower(flowers, x, z, i % 2 === 0 ? pink : cream, 0.7 + (i % 3) * 0.2);
  }
  // The moon tree is a recognizable destination behind the playable clearing.
  const moonTree = new T.Group();
  moonTree.position.set(0, 0, -8.35);
  moonTree.visible = !home;
  scene.add(moonTree);
  const moonBark = mat('#896d50');
  const moonLeaves = [mat('#78a38b'), mat('#9bb992'), mat('#c0ca98')];
  const moonGold = mat('#edc77a', 0.4);
  moonGold.emissive.set('#efb849');
  moonGold.emissiveIntensity = 0.08;
  mesh(
    geo(new T.CylinderGeometry(0.2, 0.48, 2.9, 16)),
    moonBark,
    moonTree,
    [0, 1.4, 0],
  );
  [-1, 1].forEach((side) => {
    const branch = mesh(
      cylinder,
      moonBark,
      moonTree,
      [side * 0.55, 2.25, 0],
      [0.16, 1.8, 0.16],
    );
    branch.rotation.z = -side * 0.63;
    ball(moonTree, leaf, [side * 0.47, 0.05, 0.04], [0.85, 0.11, 0.58]);
  });
  [
    [0, 4.05, 0, 1.95, 1.42, 1.3],
    [-1.45, 3.35, 0, 1.45, 1.2, 1.14],
    [1.5, 3.4, -0.15, 1.4, 1.27, 1.2],
    [-0.58, 4.73, -0.22, 1.25, 0.83, 0.93],
  ].forEach((p, index) => {
    ball(moonTree, moonLeaves[index % 3], p.slice(0, 3), p.slice(3));
  });
  for (let index = 0; index < 7; index++) {
    const angle = index * 2.3;
    ball(
      moonTree,
      index % 2 ? pink : cream,
      [Math.cos(angle) * 1.65, 3.2 + (index % 3) * 0.42, 0.91],
      [0.15, 0.15, 0.12],
    );
  }
  const moon = mesh(
    geo(new T.TorusGeometry(0.43, 0.115, 12, 36, Math.PI * 1.6)),
    moonGold,
    moonTree,
    [0, 3.1, 1.24],
  );
  moon.rotation.z = -0.94;
  mesh(cylinder, moonGold, moonTree, [0, 3.82, 1.24], [0.016, 0.66, 0.016]);
  const treeLanterns: T.Group[] = [];
  [-1.6, -0.85, 0.86, 1.63].forEach((x, index) => {
    const lantern = new T.Group();
    lantern.position.set(x, 2.25 + (index % 2) * 0.34, 0.75);
    moonTree.add(lantern);
    mesh(cylinder, moonBark, lantern, [0, 0.5, 0], [0.012, 0.65, 0.012]);
    ball(lantern, moonGold, [0, 0.02, 0], [0.14, 0.21, 0.14]);
    mesh(cylinder, gold, lantern, [0, 0.23, 0], [0.085, 0.035, 0.085]);
    treeLanterns.push(lantern);
  });
  const moonLight = new T.PointLight('#ffe0a2', 0, 9, 2);
  moonLight.position.set(0, 2.8, 1.4);
  moonTree.add(moonLight);

  const woodlandDetails = new T.Group();
  woodlandDetails.visible = !home;
  scene.add(woodlandDetails);
  const rock = mat('#8c9e8b');
  const mushroomCap = mat('#d39782');
  [
    [-7.9, -5.4],
    [-6.9, -7.7],
    [6.3, -5.5],
    [7.6, 1.1],
    [-7.9, 4.4],
  ].forEach(([x, z], index) => {
    ball(woodlandDetails, rock, [x, 0.17, z], [0.58, 0.3, 0.41]);
    ball(woodlandDetails, leaf, [x - 0.15, 0.37, z + 0.07], [0.33, 0.08, 0.23]);
    for (let child = 0; child < 2; child++) {
      const mx = x + 0.62 + child * 0.28;
      const mz = z + 0.25 + child * 0.28;
      const size = child ? 0.73 : 1;
      mesh(
        cylinder,
        cream,
        woodlandDetails,
        [mx, size * 0.2, mz],
        [0.075 * size, 0.4 * size, 0.075 * size],
      );
      ball(
        woodlandDetails,
        index % 2 ? pink : mushroomCap,
        [mx, size * 0.43, mz],
        [0.28 * size, 0.18 * size, 0.26 * size],
      );
      ball(
        woodlandDetails,
        cream,
        [mx - 0.08, size * 0.53, mz + 0.08],
        [0.045, 0.02, 0.04],
      );
    }
  });

  // Small homes at the island edge become visibly warm in the home-light ending.
  const houseWindows = mat('#886950', 0.6);
  houseWindows.emissive.set('#ffc977');
  houseWindows.emissiveIntensity = 0;
  const cottages = new T.Group();
  cottages.visible = !home;
  scene.add(cottages);
  [
    [-8.5, -4.4],
    [8.5, -5.5],
    [-8.5, 3.6],
  ].forEach(([x, z], index) => {
    const house = new T.Group();
    house.position.set(x, 0, z);
    cottages.add(house);
    mesh(cylinder, cream, house, [0, 0.37, 0], [0.55, 0.74, 0.47]);
    ball(house, index === 1 ? mint : pink, [0, 0.89, 0], [0.73, 0.38, 0.62]);
    ball(house, dark, [0, 0.25, 0.455], [0.14, 0.27, 0.035]);
    [-1, 1].forEach((side) =>
      ball(
        house,
        houseWindows,
        [side * 0.33, 0.45, 0.415],
        [0.095, 0.115, 0.035],
      ),
    );
    ball(house, gold, [0.07, 0.26, 0.49], [0.027, 0.027, 0.02]);
  });
  const homeLights = new T.Group();
  homeLights.visible = false;
  scene.add(homeLights);
  [
    [-3.6, -4.1],
    [-5.5, -4.2],
    [-7.2, -4.3],
    [4.7, -5.1],
    [6.3, -5.3],
    [7.8, -5.5],
    [-6.2, 3.6],
    [-7.5, 3.6],
  ].forEach(([x, z]) => {
    mesh(cylinder, bark, homeLights, [x, 0.19, z], [0.028, 0.38, 0.028]);
    ball(homeLights, glow, [x, 0.46, z], [0.1, 0.15, 0.1]);
  });

  function lightParticles(count: number, color: string, size: number) {
    const positions = new Float32Array(count * 3);
    const geometry = geo(new T.BufferGeometry());
    geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
    const material = new T.ShaderMaterial({
      uniforms: {
        tint: { value: new T.Color(color) },
        size: { value: size },
        opacity: { value: 0.65 },
      },
      vertexShader:
        'uniform float size; void main(){vec4 p=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*p;gl_PointSize=clamp(size*(35.0/-p.z),2.0,20.0);}',
      fragmentShader:
        'uniform vec3 tint; uniform float opacity; void main(){float d=distance(gl_PointCoord,vec2(0.5));if(d>0.5)discard;float a=smoothstep(0.5,0.04,d);gl_FragColor=vec4(tint,a*a*opacity);}',
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
    });
    materials.add(material);
    const points = new T.Points(geometry, material);
    points.frustumCulled = false;
    points.visible = !home;
    scene.add(points);
    return { positions, geometry, material, points };
  }
  const fireflies = lightParticles(36, '#eaffb6', 5);
  const skyLights = lightParticles(44, '#ffe9a5', 11);
  skyLights.points.visible = false;
  // One bounded particle buffer serves every interaction instead of allocating effects per click.
  const effectCapacity = 112;
  type EffectKind = 'collect' | 'soil' | 'water' | 'petal' | 'spark';
  const effectSlots = Array.from({ length: effectCapacity }, () => ({
    active: false,
    kind: 'spark' as EffectKind,
    born: 0,
    life: 0.8,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    phase: 0,
  }));
  const effectPositions = new Float32Array(effectCapacity * 3);
  const effectColors = new Float32Array(effectCapacity * 3);
  const effectAlphas = new Float32Array(effectCapacity);
  const effectSizes = new Float32Array(effectCapacity);
  const effectGeometry = geo(new T.BufferGeometry());
  effectGeometry.setAttribute(
    'position',
    new T.BufferAttribute(effectPositions, 3).setUsage(T.DynamicDrawUsage),
  );
  effectGeometry.setAttribute(
    'effectColor',
    new T.BufferAttribute(effectColors, 3).setUsage(T.DynamicDrawUsage),
  );
  effectGeometry.setAttribute(
    'effectAlpha',
    new T.BufferAttribute(effectAlphas, 1).setUsage(T.DynamicDrawUsage),
  );
  effectGeometry.setAttribute(
    'effectSize',
    new T.BufferAttribute(effectSizes, 1).setUsage(T.DynamicDrawUsage),
  );
  const effectMaterial = new T.ShaderMaterial({
    vertexShader:
      'attribute vec3 effectColor;attribute float effectAlpha;attribute float effectSize;varying vec3 vColor;varying float vAlpha;void main(){vColor=effectColor;vAlpha=effectAlpha;vec4 p=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*p;gl_PointSize=clamp(effectSize*(35.0/-p.z),0.0,20.0);}',
    fragmentShader:
      'varying vec3 vColor;varying float vAlpha;void main(){float d=distance(gl_PointCoord,vec2(0.5));if(d>0.5||vAlpha<0.01)discard;float a=smoothstep(0.5,0.05,d);gl_FragColor=vec4(vColor,a*vAlpha);}',
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
  });
  materials.add(effectMaterial);
  const effectPoints = new T.Points(effectGeometry, effectMaterial);
  effectPoints.frustumCulled = false;
  effectPoints.visible = !home;
  scene.add(effectPoints);
  let nextEffectSlot = 0;
  const rippleGeometry = geo(new T.RingGeometry(0.4, 0.46, 40));
  const ripples = Array.from({ length: 5 }, () => {
    const material = new T.MeshBasicMaterial({
      color: '#ffe3a0',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: T.DoubleSide,
    });
    materials.add(material);
    const object = mesh(rippleGeometry, material, scene, [0, 0.08, 0]);
    object.castShadow = false;
    object.receiveShadow = false;
    object.visible = false;
    return { object, material, born: -10, life: 1, vertical: false };
  });
  let nextRipple = 0;

  // Grounded pawprints share one draw call and a fixed instance pool.
  const pawShapes: T.Shape[] = [];
  [
    [0, -0.025, 0.058, 0.075],
    [-0.066, 0.067, 0.028, 0.036],
    [0, 0.098, 0.03, 0.038],
    [0.066, 0.067, 0.028, 0.036],
  ].forEach(([x, y, rx, ry]) => {
    const shape = new T.Shape();
    shape.absellipse(x, y, rx, ry, 0, Math.PI * 2, false, 0);
    pawShapes.push(shape);
  });
  const pawGeometry = geo(new T.ShapeGeometry(pawShapes, 10));
  pawGeometry.rotateX(-Math.PI / 2);
  const pawMaterial = new T.MeshBasicMaterial({
    color: '#faf0c5',
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    side: T.DoubleSide,
  });
  materials.add(pawMaterial);
  const pawprints = new T.InstancedMesh(pawGeometry, pawMaterial, 20);
  pawprints.instanceMatrix.setUsage(T.DynamicDrawUsage);
  pawprints.frustumCulled = false;
  pawprints.visible = !home;
  scene.add(pawprints);
  const pawSlots = Array.from({ length: 20 }, () => ({
    born: -10,
    x: 0,
    z: 0,
    yaw: 0,
  }));
  const pawMatrix = new T.Object3D();
  let nextPaw = 0;
  let stepDistance = 0;
  const lastStepPosition = new T.Vector3(0, 0, 3.3);
  let creature = createCreature(options.appearance);
  scene.add(creature.root);
  creature.root.scale.setScalar(home ? 1 : 0.8);
  creature.root.position.set(0, 0, home ? 0 : 3.3);
  const owlBeakGeometry = geo(new T.ConeGeometry(0.075, 0.15, 12));
  function createOwlActor(parent: T.Object3D) {
    const root = new T.Group();
    parent.add(root);
    ball(root, bark, [0, 0.53, 0], [0.39, 0.5, 0.31]);
    ball(root, cream, [0, 0.57, 0.21], [0.3, 0.35, 0.13]);
    const eyes = new T.Group();
    eyes.position.set(0, 0.79, 0.3);
    root.add(eyes);
    const wings: T.Group[] = [];
    [-1, 1].forEach((side) => {
      ball(root, cream, [side * 0.15, 0.81, 0.26], [0.17, 0.19, 0.08]);
      ball(eyes, dark, [side * 0.15, 0, 0.047], [0.072, 0.092, 0.042]);
      ball(
        eyes,
        cream,
        [side * 0.15 - 0.018, 0.031, 0.081],
        [0.02, 0.024, 0.012],
      );
      ball(root, pink, [side * 0.24, 0.66, 0.31], [0.075, 0.041, 0.025]);
      ball(root, gold, [side * 0.12, 0.06, 0.13], [0.095, 0.049, 0.115]);
      const wing = new T.Group();
      wing.position.set(side * 0.31, 0.61, 0);
      root.add(wing);
      ball(wing, bark, [side * 0.075, -0.13, 0], [0.14, 0.32, 0.18]);
      wings.push(wing);
    });
    mesh(owlBeakGeometry, gold, root, [0, 0.63, 0.35]).rotation.x = Math.PI / 2;
    return { root, wings, eyes };
  }
  const owlFollower = createOwlActor(scene);
  owlFollower.root.position.set(
    FOREST_LOCATIONS['owl-grove'].x,
    0,
    FOREST_LOCATIONS['owl-grove'].z,
  );
  owlFollower.root.visible = false;
  const owlTarget = new T.Vector3();
  const cursorMat = new T.MeshBasicMaterial({
    color: '#fff6c5',
    transparent: true,
    opacity: 0.8,
    side: T.DoubleSide,
  });
  materials.add(cursorMat);
  const hitMaterial = new T.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  materials.add(hitMaterial);
  const cursor = mesh(
    geo(new T.RingGeometry(0.25, 0.34, 32)),
    cursorMat,
    scene,
    [0, 0.065, 0],
  );
  cursor.rotation.x = -Math.PI / 2;
  cursor.visible = false;
  cursor.castShadow = false;
  const hotGroup = new T.Group();
  scene.add(hotGroup);
  const persistent = new T.Group();
  scene.add(persistent);
  const bridgeGroup = new T.Group();
  persistent.add(bridgeGroup);
  const bridgePlanks: T.Mesh[] = [];
  for (let i = 0; i < 9; i++)
    bridgePlanks.push(
      mesh(
        cube,
        bark,
        bridgeGroup,
        [BRIDGE_X, 0.08, -0.55 - i * 0.33],
        [1.5, 0.18, 0.29],
      ),
    );
  const bridgeRails = new T.Group();
  bridgeGroup.add(bridgeRails);
  [BRIDGE_X - 0.74, BRIDGE_X + 0.74].forEach((x) => {
    [-0.48, -3.28].forEach((z) =>
      mesh(cylinder, bark, bridgeRails, [x, 0.45, z], [0.07, 0.9, 0.07]),
    );
    mesh(cube, bark, bridgeRails, [x, 0.77, CREEK_Z], [0.07, 0.08, 2.8]);
  });
  const garden = new T.Group();
  persistent.add(garden);
  for (let i = 0; i < 18; i++)
    flower(
      garden,
      -4.8 + (i % 6) * 0.44,
      -2.5 + Math.floor(i / 6) * 0.45,
      i % 3 === 0 ? gold : i % 2 === 0 ? pink : cream,
      1.1,
    );
  const gardenBeds = new Map<
    string,
    { root: T.Group; sprout: T.Group; bloom: T.Group }
  >();
  FOREST_BED_IDS.forEach((id, index) => {
    const root = new T.Group();
    const location = FOREST_LOCATIONS[id];
    root.position.set(location.x, 0, location.z);
    persistent.add(root);
    ball(root, bark, [0, 0.01, 0], [0.5, 0.085, 0.43]);
    [-1, 1].forEach((side) =>
      ball(root, pathMat, [side * 0.39, 0.04, 0.24], [0.13, 0.095, 0.11]),
    );
    const sprout = new T.Group();
    root.add(sprout);
    mesh(cylinder, leaf, sprout, [0, 0.15, 0], [0.035, 0.3, 0.035]);
    const left = ball(sprout, mint, [-0.12, 0.25, 0], [0.19, 0.075, 0.1]);
    left.rotation.z = -0.35;
    const right = ball(sprout, leaf, [0.13, 0.32, 0], [0.19, 0.075, 0.1]);
    right.rotation.z = 0.35;
    const bloom = new T.Group();
    root.add(bloom);
    const petals = [pink, mint, gold][index];
    flower(bloom, 0, 0, petals, 2);
    flower(bloom, -0.26, 0.1, petals, 1.25);
    flower(bloom, 0.25, 0.13, petals, 1.45);
    gardenBeds.set(id, { root, sprout, bloom });
  });
  const lanternGarden = new T.Group();
  persistent.add(lanternGarden);
  const lanternBulbs = new Map<string, { bulb: T.Mesh; light: T.PointLight }>();
  FOREST_LANTERN_IDS.forEach((id) => {
    const location = FOREST_LOCATIONS[id];
    const g = new T.Group();
    g.position.set(location.x, 0, location.z);
    lanternGarden.add(g);
    mesh(cylinder, bark, g, [0, 0.6, 0], [0.045, 1.2, 0.045]);
    const bulb = ball(g, cream, [0, 1.22, 0], [0.25, 0.32, 0.25]);
    mesh(cylinder, gold, g, [0, 1.55, 0], [0.17, 0.04, 0.17]);
    const light = new T.PointLight('#ffe7a9', 0, 3.5, 2);
    light.position.set(0, 1.1, 0);
    g.add(light);
    lanternBulbs.set(id, { bulb, light });
  });
  persistent.visible = !home;
  let forest = options.forest;
  let view = getForestView(forest);
  const hotObjects: T.Object3D[] = [];
  const bellObjects = new Map<string, T.Group>();
  const sharedHaloGeometry = geo(new T.TorusGeometry(0.38, 0.025, 6, 28));
  const sharedBellGeometry = geo(new T.ConeGeometry(0.24, 0.34, 20, 1, true));
  const sharedPortalGeometry = geo(
    new T.TorusGeometry(0.65, 0.1, 12, 32, Math.PI),
  );
  const sharedHeartGeometry = geo(new T.ConeGeometry(0.24, 0.3, 3));
  const tags: { node: HTMLButtonElement; position: T.Vector3; id: string }[] =
    [];
  const labelLayer = document.createElement('div');
  labelLayer.className = 'cw-world-labels';
  host.appendChild(labelLayer);
  const labelDisposers: (() => void)[] = [];
  function rebuild() {
    view = getForestView(forest);
    hotGroup.clear();
    hotObjects.length = 0;
    bellObjects.clear();
    labelDisposers.splice(0).forEach((fn) => fn());
    labelLayer.replaceChildren();
    tags.length = 0;
    bridgeGroup.visible = forest.bridges;
    garden.visible = forest.gardenBloom;
    gardenBeds.forEach((bed, id) => {
      bed.root.visible = forest.route === 'garden';
      bed.sprout.visible =
        forest.planted.includes(id) && !forest.watered.includes(id);
      bed.bloom.visible = forest.watered.includes(id);
    });
    lanternGarden.visible =
      forest.chapter === 'festival' || forest.chapter === 'complete';
    lanternBulbs.forEach(({ bulb, light }, id) => {
      const lit = forest.lanterns.includes(id);
      bulb.material = lit ? glow : cream;
      light.intensity = lit ? 1.4 : 0;
    });
    if (home) return;
    for (const hot of view.hotspots.filter((h) => h.available && !h.complete)) {
      const g = new T.Group();
      g.position.set(hot.x, 0, hot.z);
      g.userData.hotspotId = hot.id;
      hotGroup.add(g);
      hotObjects.push(g);
      const hitTarget = mesh(
        cylinder,
        hitMaterial,
        g,
        [0, 0.65, 0],
        [0.44, 1.3, 0.44],
      );
      hitTarget.castShadow = false;
      hitTarget.receiveShadow = false;
      if (hot.id === 'festival-tree') {
        ball(g, glow, [-0.11, 0.62, 0], [0.18, 0.19, 0.12]);
        ball(g, glow, [0.11, 0.62, 0], [0.18, 0.19, 0.12]);
        const heartTip = mesh(sharedHeartGeometry, glow, g, [0, 0.42, 0]);
        heartTip.rotation.z = Math.PI;
      } else if (hot.kind === 'npc') {
        if (hot.id === 'owl-grove' && forest.owlChoice === 'invite') {
          // The invited owl is beside the player; this marker replays its song.
          ball(g, glow, [0, 0.75, 0], [0.12, 0.15, 0.12]);
        } else createOwlActor(g);
      } else if (hot.kind === 'wood' || hot.kind === 'bridge') {
        for (let i = 0; i < 3; i++) {
          const log = mesh(
            cylinder,
            bark,
            g,
            [(i - 1) * 0.16, 0.15 + i * 0.05, 0],
            [0.1, 0.7, 0.1],
          );
          log.rotation.z = Math.PI / 2;
          log.rotation.y = i * 0.12;
        }
      } else if (hot.kind === 'bell') {
        mesh(cylinder, bark, g, [0, 0.65, 0], [0.05, 1.3, 0.05]);
        const bellSwing = new T.Group();
        bellSwing.position.y = 1.29;
        g.add(bellSwing);
        bellObjects.set(hot.id, bellSwing);
        mesh(sharedBellGeometry, gold, bellSwing, [0, -0.19, 0]).rotation.z =
          Math.PI;
        ball(bellSwing, glow, [0, -0.37, 0], [0.07, 0.07, 0.07]);
      } else if (hot.kind === 'flower') {
        // Soil, planted shoots and opened petals live in persistent beds.
      } else if (hot.kind === 'portal') {
        const arch = mesh(sharedPortalGeometry, gold, g, [0, 0.52, 0]);
        arch.castShadow = false;
        ball(g, glow, [0, 0.5, 0], [0.15, 0.2, 0.15]);
      } else if (hot.kind === 'lantern') {
        // The lamp stays visible after interaction; only its light changes.
      } else {
        ball(
          g,
          hot.id.includes('water') ? waterMat : gold,
          [0, 0.22, 0],
          [0.2, 0.24, 0.18],
        );
        ball(g, leaf, [0.1, 0.43, 0], [0.15, 0.055, 0.07]);
      }
      const halo = mesh(sharedHaloGeometry, glow, g, [0, 0.06, 0]);
      halo.rotation.x = Math.PI / 2;
      halo.castShadow = false;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = hot.label;
      button.className = 'cw-world-tag';
      button.setAttribute('aria-label', `${hot.label} · 이동하기`);
      const listener = () => walkTo(hot.id);
      button.addEventListener('click', listener);
      labelDisposers.push(() => button.removeEventListener('click', listener));
      labelLayer.appendChild(button);
      tags.push({
        node: button,
        position: new T.Vector3(hot.x, hot.kind === 'npc' ? 1.5 : 1.1, hot.z),
        id: hot.id,
      });
    }
  }
  let destination: T.Vector3 | null = null;
  let journeyTarget: T.Vector3 | null = null;
  let pendingId: string | null = null;
  let pathQueue: T.Vector3[] = [];
  let action: WorldAction = 'idle';
  let actionUntil = 0;
  let elapsed = 0;
  let bridgeStartedAt: number | null = null;
  const bellStrikes = new Map<string, number>();
  const sproutStarts = new Map<string, number>();
  let endingStartedAt = options.forest.ending ? 0 : (null as number | null);
  let yaw = 0;
  let targetYaw = 0;
  let orbit = 0.42;
  const keys = new Set<string>();
  const joystick = new T.Vector2();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ray = new T.Raycaster();
  const pointer = new T.Vector2();
  const projected = new T.Vector3();
  const groundPlane = new T.Plane(new T.Vector3(0, 1, 0), 0);
  function react(next: WorldAction) {
    action = next;
    actionUntil = elapsed + (next === 'sleep' ? 4 : 1.7);
  }
  function burst(
    kind: EffectKind,
    point: ForestPoint,
    tint: string,
    count = 18,
    delay = 0,
  ) {
    if (home || reduced.matches) return;
    const color = new T.Color(tint);
    for (let index = 0; index < count; index++) {
      const slotIndex = nextEffectSlot++ % effectCapacity;
      const slot = effectSlots[slotIndex];
      const angle = index * 2.399;
      const radius = 0.08 + (index % 5) * 0.025;
      slot.active = true;
      slot.kind = kind;
      slot.born = elapsed + delay + (index % 3) * 0.025;
      slot.life = kind === 'collect' ? 0.82 : kind === 'water' ? 0.72 : 0.9;
      slot.x = point.x + Math.cos(angle) * radius;
      slot.y =
        kind === 'water'
          ? 1.12 + (index % 4) * 0.06
          : kind === 'collect'
            ? 0.3
            : 0.12;
      slot.z = point.z + Math.sin(angle) * radius;
      slot.phase = angle;
      slot.vx =
        Math.cos(angle) * (kind === 'water' ? 0.13 : 0.3 + (index % 4) * 0.12);
      slot.vz =
        Math.sin(angle) * (kind === 'water' ? 0.13 : 0.3 + (index % 4) * 0.12);
      slot.vy =
        kind === 'water'
          ? -1.15
          : kind === 'soil'
            ? 0.7
            : 1.05 + (index % 4) * 0.16;
      effectColors[slotIndex * 3] = color.r;
      effectColors[slotIndex * 3 + 1] = color.g;
      effectColors[slotIndex * 3 + 2] = color.b;
      effectSizes[slotIndex] = kind === 'soil' ? 4 : kind === 'water' ? 6 : 8;
      effectAlphas[slotIndex] = 0;
    }
    effectGeometry.attributes.effectColor.needsUpdate = true;
    effectGeometry.attributes.effectSize.needsUpdate = true;
  }
  function ripple(point: ForestPoint, color: string, vertical = false) {
    if (home) return;
    const effect = ripples[nextRipple++ % ripples.length];
    effect.born = elapsed;
    effect.life = vertical ? 0.95 : 0.85;
    effect.vertical = vertical;
    effect.object.position.set(point.x, vertical ? 1.04 : 0.075, point.z);
    effect.object.visible = true;
    effect.object.scale.setScalar(1);
    effect.material.color.set(color);
    effect.material.opacity = 0.8;
    if (vertical) effect.object.quaternion.copy(camera.quaternion);
    else effect.object.rotation.set(-Math.PI / 2, 0, 0);
  }
  function arrivalFeedback(id: string) {
    const hot = view.hotspots.find(
      (item) => item.id === id && item.available && !item.complete,
    );
    if (!hot) return;
    const position = FOREST_LOCATIONS[id];
    if (hot.kind === 'bell') {
      bellStrikes.set(id, elapsed);
      ripple(
        position,
        id === 'bell-dew'
          ? '#9de9fa'
          : id === 'bell-leaf'
            ? '#b9eca7'
            : '#ffe19a',
        true,
      );
      react('wave');
    } else if (hot.kind === 'flower' || hot.kind === 'water') react('curious');
    else if (hot.kind === 'bridge') react('celebrate');
    else if (hot.kind === 'npc') react('wave');
    else react('hop');
  }
  function navigate(point: T.Vector3, id: string | null) {
    const safeStart = nearestWalkablePoint(
      creature.root.position,
      forest.bridges,
    );
    creature.root.position.set(safeStart.x, 0, safeStart.z);
    const route = getCompanionNavigationPath(safeStart, point, forest.bridges);
    if (!route.length) {
      destination = null;
      pendingId = null;
      journeyTarget = null;
      pathQueue = [];
      cursor.visible = false;
      options.onStatus(
        '그곳으로 가는 길을 찾고 있어요. 가까운 땅이나 반짝이는 물건을 다시 눌러 주세요.',
      );
      return;
    }
    pathQueue = route.map((step) => new T.Vector3(step.x, 0, step.z));
    journeyTarget = pathQueue[pathQueue.length - 1].clone();
    destination = pathQueue.shift()!;
    pendingId = id;
    cursor.position.set(journeyTarget.x, 0.06, journeyTarget.z);
    cursor.visible = true;
  }
  function walkTo(id: string) {
    const hot = view.hotspots.find(
      (h) => h.id === id && h.available && !h.complete,
    );
    if (!hot) return;
    options.onStatus(`${hot.label} 쪽으로 가고 있어요`);
    navigate(new T.Vector3(hot.x, 0, hot.z + 0.5), id);
  }
  const down = { x: 0, y: 0, active: false, moved: false };
  function pointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    down.x = e.clientX;
    down.y = e.clientY;
    down.active = true;
    down.moved = false;
    renderer.domElement.setPointerCapture(e.pointerId);
    renderer.domElement.focus({ preventScroll: true });
  }
  function pointerMove(e: PointerEvent) {
    if (!down.active) return;
    const dx = e.clientX - down.x;
    if (Math.abs(dx) + Math.abs(e.clientY - down.y) > 6) down.moved = true;
    if (home) {
      orbit -= dx * 0.009;
      down.x = e.clientX;
    }
  }
  function pointerUp(e: PointerEvent) {
    if (!down.active) return;
    down.active = false;
    if (down.moved) return;
    if (home) {
      react('pet');
      options.onPet();
      return;
    }
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((e.clientX - bounds.left) / bounds.width) * 2 - 1,
      (-(e.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    ray.setFromCamera(pointer, camera);
    const hits = ray.intersectObjects(hotObjects, true);
    if (hits.length) {
      let obj: T.Object3D | null = hits[0].object;
      while (obj && !obj.userData.hotspotId) obj = obj.parent;
      if (obj?.userData.hotspotId) {
        walkTo(String(obj.userData.hotspotId));
        return;
      }
    }
    const spot = new T.Vector3();
    if (ray.ray.intersectPlane(groundPlane, spot)) navigate(spot, null);
  }
  function keyDown(e: KeyboardEvent) {
    if (home) return;
    if (/^(ArrowUp|ArrowDown|ArrowLeft|ArrowRight|[wasdWASD])$/.test(e.key)) {
      e.preventDefault();
      keys.add(e.key.toLowerCase());
      destination = null;
      pendingId = null;
      journeyTarget = null;
      pathQueue = [];
      cursor.visible = false;
    }
  }
  function keyUp(e: KeyboardEvent) {
    keys.delete(e.key.toLowerCase());
  }
  function blur() {
    keys.clear();
    joystick.set(0, 0);
    down.active = false;
  }
  renderer.domElement.addEventListener('pointerdown', pointerDown);
  renderer.domElement.addEventListener('pointermove', pointerMove);
  renderer.domElement.addEventListener('pointerup', pointerUp);
  renderer.domElement.addEventListener('pointercancel', blur);
  renderer.domElement.addEventListener('keydown', keyDown);
  renderer.domElement.addEventListener('blur', blur);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', blur);
  let frame = 0;
  let last = performance.now();
  let disposed = false;
  let visible = true;
  let width = 1;
  let height = 1;
  function resize() {
    width = host.clientWidth;
    height = host.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();
  rebuild();
  const observer = new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting ?? true;
  });
  observer.observe(host);
  const moveVector = new T.Vector3();
  const cameraTarget = new T.Vector3();
  const camPosition = new T.Vector3();
  function animate(now: number) {
    if (disposed) return;
    frame = requestAnimationFrame(animate);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (document.hidden) return;
    // Mobile action controls sit below the canvas. A requested journey must
    // finish even while the user scrolls to read the objective.
    if (
      !visible &&
      !destination &&
      keys.size === 0 &&
      joystick.lengthSq() === 0
    )
      return;
    elapsed += dt;
    let moving = false;
    if (!home) {
      moveVector.set(
        (keys.has('arrowright') || keys.has('d') ? 1 : 0) -
          (keys.has('arrowleft') || keys.has('a') ? 1 : 0) +
          joystick.x,
        0,
        (keys.has('arrowdown') || keys.has('s') ? 1 : 0) -
          (keys.has('arrowup') || keys.has('w') ? 1 : 0) +
          joystick.y,
      );
      if (moveVector.lengthSq() > 0.04) {
        destination = null;
        pendingId = null;
        journeyTarget = null;
        pathQueue = [];
        cursor.visible = false;
        moveVector.normalize().multiplyScalar(dt * 3);
        moving = true;
      } else if (destination) {
        moveVector.copy(destination).sub(creature.root.position);
        moveVector.y = 0;
        const distance = moveVector.length();
        if (distance < 0.035) {
          creature.root.position.copy(destination);
          if (pathQueue.length) {
            destination = pathQueue.shift()!;
          } else {
            destination = null;
            journeyTarget = null;
            cursor.visible = false;
            const id = pendingId;
            pendingId = null;
            if (id) {
              arrivalFeedback(id);
              options.onInteract(id);
            }
          }
          moveVector.set(0, 0, 0);
        } else {
          moveVector.normalize().multiplyScalar(Math.min(distance, dt * 3));
          moving = true;
        }
      } else moveVector.set(0, 0, 0);
      const nextX = T.MathUtils.clamp(
        creature.root.position.x + moveVector.x,
        -8,
        8,
      );
      const nextZ = T.MathUtils.clamp(
        creature.root.position.z + moveVector.z,
        -8,
        4.8,
      );
      if (isForestWalkablePoint({ x: nextX, z: nextZ }, forest.bridges)) {
        creature.root.position.x = nextX;
        creature.root.position.z = nextZ;
      } else if (journeyTarget) {
        moving = false;
        navigate(journeyTarget.clone(), pendingId);
      } else {
        // Direct steering slides along the bank instead of getting stuck on a diagonal.
        if (
          isForestWalkablePoint(
            { x: nextX, z: creature.root.position.z },
            forest.bridges,
          )
        )
          creature.root.position.x = nextX;
        else if (
          isForestWalkablePoint(
            { x: creature.root.position.x, z: nextZ },
            forest.bridges,
          )
        )
          creature.root.position.z = nextZ;
        else moving = false;
      }
      if (moving) targetYaw = Math.atan2(moveVector.x, moveVector.z);
      yaw +=
        Math.atan2(Math.sin(targetYaw - yaw), Math.cos(targetYaw - yaw)) *
        Math.min(1, dt * 12);
      creature.root.rotation.y = yaw;
      const narrow = width < 650;
      cameraTarget.set(
        creature.root.position.x * (narrow ? 0.96 : 0.9),
        0.45,
        -0.95 + creature.root.position.z * (narrow ? 0.94 : 0.88),
      );
      lookAt.lerp(cameraTarget, Math.min(1, dt * 5));
      camPosition.set(
        lookAt.x,
        narrow ? 10 : 10.3,
        lookAt.z + (narrow ? 12 : 13),
      );
      camera.position.lerp(camPosition, Math.min(1, dt * 4.2));
      camera.lookAt(lookAt);
    } else {
      const homeRadius = width < 650 ? 6.1 : 7.8;
      camera.position.set(
        Math.sin(orbit) * homeRadius,
        2.9,
        Math.cos(orbit) * homeRadius,
      );
      camera.lookAt(0, 1.32, 0);
    }
    creature.update(dt, elapsed, {
      moving,
      speed: 3,
      action: elapsed < actionUntil ? action : 'idle',
      reducedMotion: reduced.matches,
    });
    const travelled = Math.hypot(
      creature.root.position.x - lastStepPosition.x,
      creature.root.position.z - lastStepPosition.z,
    );
    lastStepPosition.copy(creature.root.position);
    if (!home && moving && !reduced.matches) {
      stepDistance += Math.min(travelled, 0.2);
      if (stepDistance > 0.34) {
        stepDistance = 0;
        const side = nextPaw % 2 ? 1 : -1;
        const paw = pawSlots[nextPaw++ % pawSlots.length];
        paw.born = elapsed;
        paw.yaw = yaw + Math.PI;
        paw.x = creature.root.position.x + Math.cos(yaw) * side * 0.14;
        paw.z = creature.root.position.z - Math.sin(yaw) * side * 0.14;
      }
    }
    pawprints.visible = !home && !reduced.matches;
    pawSlots.forEach((paw, index) => {
      const age = elapsed - paw.born;
      const size =
        age < 2.5 ? Math.max(0.001, 1 - Math.max(0, age - 1) / 1.5) : 0.001;
      pawMatrix.position.set(paw.x, 0.048, paw.z);
      pawMatrix.rotation.set(0, paw.yaw, 0);
      pawMatrix.scale.setScalar(size);
      pawMatrix.updateMatrix();
      pawprints.setMatrixAt(index, pawMatrix.matrix);
    });
    pawprints.instanceMatrix.needsUpdate = true;

    let liveEffects = 0;
    effectSlots.forEach((slot, index) => {
      if (reduced.matches) slot.active = false;
      if (!slot.active) {
        effectAlphas[index] = 0;
        return;
      }
      const age = elapsed - slot.born;
      if (age < 0) {
        effectAlphas[index] = 0;
        liveEffects++;
        return;
      }
      const fraction = age / slot.life;
      if (fraction >= 1) {
        slot.active = false;
        effectAlphas[index] = 0;
        return;
      }
      liveEffects++;
      if (slot.kind === 'collect') {
        const arc = Math.sin(fraction * Math.PI);
        const ease = fraction * fraction * (3 - 2 * fraction);
        effectPositions[index * 3] =
          T.MathUtils.lerp(slot.x, creature.root.position.x, ease) +
          Math.cos(slot.phase) * arc * 0.28;
        effectPositions[index * 3 + 1] =
          T.MathUtils.lerp(slot.y, 1.1, ease) + arc * 0.67;
        effectPositions[index * 3 + 2] =
          T.MathUtils.lerp(slot.z, creature.root.position.z, ease) +
          Math.sin(slot.phase) * arc * 0.28;
      } else {
        effectPositions[index * 3] = slot.x + slot.vx * age;
        effectPositions[index * 3 + 1] = Math.max(
          0.08,
          slot.y +
            slot.vy * age -
            (slot.kind === 'water' ? 0.95 : 0.65) * age * age,
        );
        effectPositions[index * 3 + 2] = slot.z + slot.vz * age;
      }
      effectAlphas[index] =
        Math.min(1, age * 9) *
        (1 - fraction) *
        (slot.kind === 'soil' ? 0.7 : 0.95);
    });
    effectPoints.visible = !home && liveEffects > 0;
    effectGeometry.attributes.position.needsUpdate = true;
    effectGeometry.attributes.effectAlpha.needsUpdate = true;
    ripples.forEach((effect) => {
      const fraction = (elapsed - effect.born) / effect.life;
      effect.object.visible = !home && fraction >= 0 && fraction < 1;
      if (!effect.object.visible) return;
      effect.object.scale.setScalar(
        reduced.matches ? 1.1 : 0.75 + fraction * 2.5,
      );
      effect.material.opacity = (1 - fraction) * 0.65;
      if (effect.vertical) effect.object.quaternion.copy(camera.quaternion);
    });
    bellObjects.forEach((bell, id) => {
      const strike = bellStrikes.get(id);
      const age = strike === undefined ? 10 : elapsed - strike;
      bell.rotation.z =
        reduced.matches || age > 1.7
          ? 0
          : Math.sin(age * 19) * Math.exp(-age * 2.7) * 0.36;
    });
    if (forest.bridges) {
      const bridgeAge =
        reduced.matches || bridgeStartedAt === null
          ? 10
          : elapsed - bridgeStartedAt;
      bridgePlanks.forEach((plank, index) => {
        const fraction = T.MathUtils.clamp(
          (bridgeAge - index * 0.065) / 0.23,
          0,
          1,
        );
        const remainder = Math.pow(1 - fraction, 3);
        plank.visible = fraction > 0;
        plank.position.y = 0.08 + remainder * 0.78;
        plank.rotation.z = remainder * (index % 2 ? 0.17 : -0.17);
        if (
          fraction === 1 &&
          bridgeStartedAt !== null &&
          !plank.userData.landingPlayed
        ) {
          plank.userData.landingPlayed = true;
          burst('soil', { x: BRIDGE_X, z: plank.position.z }, '#ffe0a5', 4);
        }
      });
      bridgeRails.visible = bridgeAge > 0.45;
      bridgeRails.scale.y = T.MathUtils.clamp(
        (bridgeAge - 0.45) / 0.32,
        0.001,
        1,
      );
      if (bridgeAge > 1.4) bridgeStartedAt = null;
    }
    owlFollower.root.visible = !home && forest.owlChoice === 'invite';
    if (owlFollower.root.visible) {
      const trailing = moving ? 0.95 : 0.68;
      owlTarget.set(
        creature.root.position.x -
          Math.sin(yaw) * trailing +
          Math.cos(yaw) * 0.8,
        0,
        creature.root.position.z -
          Math.cos(yaw) * trailing -
          Math.sin(yaw) * 0.8,
      );
      const owlDistance = Math.hypot(
        owlTarget.x - owlFollower.root.position.x,
        owlTarget.z - owlFollower.root.position.z,
      );
      const flying = moving || owlDistance > 0.6;
      owlTarget.y = reduced.matches
        ? 0.38
        : flying
          ? 0.55 + Math.sin(elapsed * 5) * 0.075
          : 0.11 + Math.sin(elapsed * 2.4) * 0.018;
      owlFollower.root.position.lerp(
        owlTarget,
        Math.min(1, dt * (flying ? 3.4 : 2.4)),
      );
      const owlYaw = flying
        ? yaw
        : Math.atan2(
            creature.root.position.x - owlFollower.root.position.x,
            creature.root.position.z - owlFollower.root.position.z,
          );
      owlFollower.root.rotation.y +=
        Math.atan2(
          Math.sin(owlYaw - owlFollower.root.rotation.y),
          Math.cos(owlYaw - owlFollower.root.rotation.y),
        ) * Math.min(1, dt * 5);
      owlFollower.wings.forEach((wing, index) => {
        wing.rotation.z = reduced.matches
          ? 0
          : (index ? -1 : 1) *
            (flying
              ? 0.38 + Math.sin(elapsed * 16) * 0.54
              : 0.05 + Math.sin(elapsed * 2.3) * 0.025);
      });
      const blink = elapsed % 4.7;
      owlFollower.eyes.scale.y =
        !reduced.matches && blink < 0.16
          ? 0.12 + Math.abs(blink - 0.08) * 11
          : 1;
    }
    cursor.scale.setScalar(
      reduced.matches ? 1 : 1 + Math.sin(elapsed * 4) * 0.08,
    );
    if (!reduced.matches) {
      hotObjects.forEach((obj, i) => {
        obj.rotation.y = Math.sin(elapsed * 0.7 + i) * 0.06;
      });
      flowers.rotation.z = Math.sin(elapsed * 0.6) * 0.004;
    } else {
      hotObjects.forEach((obj) => {
        obj.rotation.y = 0;
      });
      flowers.rotation.z = 0;
    }
    const festival =
      !home && (forest.chapter === 'festival' || forest.chapter === 'complete');
    const peacefulTime = reduced.matches ? 0 : elapsed;
    const homeEnding = !home && forest.ending === 'home';
    const skyEnding = !home && forest.ending === 'sky';
    homeLights.visible = homeEnding;
    houseWindows.emissiveIntensity = reduced.matches
      ? homeEnding
        ? 1.3
        : 0
      : T.MathUtils.lerp(
          houseWindows.emissiveIntensity,
          homeEnding ? 1.3 : 0,
          dt * 2,
        );
    moonGold.emissiveIntensity = T.MathUtils.lerp(
      moonGold.emissiveIntensity,
      festival ? 0.8 + forest.lanterns.length * 0.2 : 0.08,
      dt * 1.5,
    );
    moonLight.intensity = T.MathUtils.lerp(
      moonLight.intensity,
      festival ? 1.8 + forest.lanterns.length * 0.35 : 0,
      dt * 1.5,
    );
    treeLanterns.forEach((lantern, index) => {
      lantern.rotation.z = reduced.matches
        ? 0
        : Math.sin(peacefulTime * 0.7 + index) * 0.055;
    });
    fireflies.geometry.setDrawRange(
      0,
      forest.owlChoice === 'listen' || festival ? 36 : 16,
    );
    fireflies.material.uniforms.opacity.value = festival
      ? 0.9
      : forest.owlChoice === 'listen'
        ? 0.75
        : 0.35;
    const guideHotspot =
      forest.owlChoice === 'listen'
        ? forest.chapter === 'grove'
          ? view.hotspots.find(
              (hot) => hot.id === view.melody[view.melodyIndex],
            )
          : forest.chapter === 'festival'
            ? view.hotspots.find(
                (hot) =>
                  hot.kind === 'lantern' && hot.available && !hot.complete,
              )
            : null
        : null;
    for (let index = 0; index < 36; index++) {
      if (guideHotspot && index < 12) {
        const fraction = reduced.matches
          ? (index + 1) / 13
          : (elapsed * 0.28 + index / 12) % 1;
        fireflies.positions[index * 3] = T.MathUtils.lerp(
          creature.root.position.x,
          guideHotspot.x,
          fraction,
        );
        fireflies.positions[index * 3 + 1] =
          0.72 + Math.sin(fraction * Math.PI) * 0.46;
        fireflies.positions[index * 3 + 2] = T.MathUtils.lerp(
          creature.root.position.z,
          guideHotspot.z,
          fraction,
        );
        continue;
      }
      const angle = index * 2.399;
      const radius = 1.3 + (index % 6) * 0.83;
      fireflies.positions[index * 3] =
        Math.cos(angle) * radius + Math.sin(peacefulTime * 0.33 + index) * 0.17;
      fireflies.positions[index * 3 + 1] =
        0.62 + (index % 5) * 0.29 + Math.sin(peacefulTime * 0.6 + angle) * 0.12;
      fireflies.positions[index * 3 + 2] =
        -4.9 + Math.sin(angle) * radius * 0.6;
    }
    fireflies.geometry.attributes.position.needsUpdate = true;
    skyLights.points.visible = skyEnding;
    if (skyEnding) {
      const endingTime = reduced.matches ? 2 : elapsed - (endingStartedAt ?? 0);
      skyLights.material.uniforms.opacity.value = reduced.matches
        ? 0.86
        : Math.min(0.86, endingTime * 0.55);
      for (let index = 0; index < 44; index++) {
        const angle = index * 2.399;
        skyLights.positions[index * 3] =
          Math.cos(angle) * (1.1 + (index % 5) * 0.85) +
          Math.sin(peacefulTime * 0.4 + index) * 0.2;
        skyLights.positions[index * 3 + 1] = reduced.matches
          ? 1.4 + (index % 9) * 0.5
          : 0.65 + ((endingTime * 0.6 + index * 0.17) % 5.5);
        skyLights.positions[index * 3 + 2] = -5.4 + Math.sin(angle) * 2.1;
      }
      skyLights.geometry.attributes.position.needsUpdate = true;
    }
    const targetColor = new T.Color(
      festival ? '#526887' : home ? '#f4ecda' : '#b8d6c5',
    );
    (scene.background as T.Color).lerp(targetColor, dt * 0.7);
    (scene.fog as T.Fog).color.copy(scene.background as T.Color);
    (terrain.material as T.MeshStandardMaterial).color.lerp(
      targetColor,
      dt * 0.7,
    );
    hemisphere.intensity = T.MathUtils.lerp(
      hemisphere.intensity,
      festival ? 0.72 : 1,
      dt * 0.7,
    );
    fill.intensity = T.MathUtils.lerp(
      fill.intensity,
      festival ? 0.85 : 0.7,
      dt * 0.7,
    );
    sun.intensity = T.MathUtils.lerp(
      sun.intensity,
      festival ? 0.9 : 2,
      dt * 0.7,
    );
    if (reduced.matches) garden.scale.setScalar(1);
    else garden.scale.lerp(new T.Vector3(1, 1, 1), dt * 3);
    gardenBeds.forEach((bed, id) => {
      const sproutStart = sproutStarts.get(id);
      if (bed.sprout.visible) {
        const progress =
          reduced.matches || sproutStart === undefined
            ? 1
            : T.MathUtils.clamp((elapsed - sproutStart) / 0.58, 0, 1);
        bed.sprout.scale.setScalar(
          0.12 + (1 - Math.pow(1 - progress, 3)) * 0.88,
        );
      }
      if (!bed.bloom.visible) return;
      if (reduced.matches) bed.bloom.scale.setScalar(1);
      else bed.bloom.scale.lerp(new T.Vector3(1, 1, 1), Math.min(1, dt * 4));
    });
    tags.forEach((tag) => {
      projected.copy(tag.position).project(camera);
      tag.node.style.transform = `translate(${(projected.x * 0.5 + 0.5) * width}px,${(-projected.y * 0.5 + 0.5) * height}px) translate(-50%,-100%)`;
      tag.node.hidden =
        projected.z > 1 ||
        Math.abs(projected.x) > 1.05 ||
        Math.abs(projected.y) > 1.05;
    });
    renderer.render(scene, camera);
  }
  frame = requestAnimationFrame(animate);
  return {
    walkTo,
    react,
    turn(direction: number) {
      orbit += direction * 0.5;
    },
    steer(x: number, z: number) {
      joystick.set(x, z);
    },
    setAppearance(appearance: CreatureAppearance) {
      const old = creature;
      const position = old.root.position.clone();
      const rotation = old.root.rotation.clone();
      scene.remove(old.root);
      old.dispose();
      creature = createCreature(appearance);
      creature.root.scale.setScalar(home ? 1 : 0.8);
      creature.root.position.copy(position);
      creature.root.rotation.copy(rotation);
      scene.add(creature.root);
      react('wave');
    },
    setForest(next: ForestState) {
      const bloomed = !forest.gardenBloom && next.gardenBloom;
      const built = !forest.bridges && next.bridges;
      const newItems = next.collected.filter(
        (id) => !forest.collected.includes(id),
      );
      const newSeeds = next.planted.filter(
        (id) => !forest.planted.includes(id),
      );
      const newLanterns = next.lanterns.filter(
        (id) => !forest.lanterns.includes(id),
      );
      const newFlowers = next.watered.filter(
        (id) => !forest.watered.includes(id),
      );
      if (next.ending !== forest.ending)
        endingStartedAt = next.ending ? elapsed : null;
      if (built) {
        bridgeStartedAt = elapsed;
        bridgePlanks.forEach((plank) => {
          plank.userData.landingPlayed = false;
        });
      }
      if (!next.bridges) bridgeStartedAt = null;
      if (next.owlChoice === 'invite' && forest.owlChoice !== 'invite') {
        const position = FOREST_LOCATIONS['owl-grove'];
        owlFollower.root.position.set(position.x, 0.12, position.z);
        burst('spark', position, '#ffd69f', 18);
      }
      if (next.owlChoice === 'listen' && forest.owlChoice !== 'listen')
        ripple(FOREST_LOCATIONS['owl-grove'], '#d9f5a3');
      newItems.forEach((id) => {
        burst(
          'collect',
          FOREST_LOCATIONS[id],
          id.startsWith('seed') ? '#ffd0bd' : '#ffe2a0',
          15,
        );
        ripple(FOREST_LOCATIONS[id], '#fff1bb');
      });
      newSeeds.forEach((id) => {
        sproutStarts.set(id, elapsed);
        burst('soil', FOREST_LOCATIONS[id], '#d7b987', 12);
      });
      newFlowers.forEach((id) => {
        burst('water', FOREST_LOCATIONS[id], '#9edbff', 24);
        burst(
          'petal',
          FOREST_LOCATIONS[id],
          id.includes('peach')
            ? '#ffc1cd'
            : id.includes('mint')
              ? '#b9f0ce'
              : '#ffe29f',
          14,
          0.25,
        );
        ripple(FOREST_LOCATIONS[id], '#cceaba');
      });
      newLanterns.forEach((id) => {
        burst('spark', FOREST_LOCATIONS[id], '#ffe19a', 22);
        ripple(FOREST_LOCATIONS[id], '#ffe4a8');
      });
      if (!forest.hasWater && next.hasWater)
        burst('water', FOREST_LOCATIONS['garden-water'], '#9edbff', 18);
      if (next.chapter === 'arrival' && forest.chapter !== 'arrival') {
        effectSlots.forEach((slot) => {
          slot.active = false;
        });
        effectAlphas.fill(0);
        ripples.forEach((effect) => {
          effect.object.visible = false;
          effect.born = -10;
        });
        pawSlots.forEach((paw) => {
          paw.born = -10;
        });
        sproutStarts.clear();
        bellStrikes.clear();
      }
      forest = next;
      rebuild();
      newFlowers.forEach((id) =>
        gardenBeds.get(id)?.bloom.scale.setScalar(reduced.matches ? 1 : 0.12),
      );
      if (bloomed) garden.scale.setScalar(reduced.matches ? 1 : 0.15);
      const safe = nearestWalkablePoint(creature.root.position, forest.bridges);
      creature.root.position.set(safe.x, 0, safe.z);
      if (
        pendingId &&
        !view.hotspots.some(
          (h) => h.id === pendingId && h.available && !h.complete,
        )
      ) {
        destination = null;
        journeyTarget = null;
        pendingId = null;
        pathQueue = [];
        cursor.visible = false;
      }
      if (next.chapter === 'complete') react('celebrate');
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      observer.disconnect();
      blur();
      labelDisposers.forEach((fn) => fn());
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointermove', pointerMove);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      renderer.domElement.removeEventListener('pointercancel', blur);
      renderer.domElement.removeEventListener('keydown', keyDown);
      renderer.domElement.removeEventListener('blur', blur);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', blur);
      creature.dispose();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      env.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      labelLayer.remove();
      scene.clear();
    },
  };
}
