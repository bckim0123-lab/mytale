import * as THREE from 'three';
import type { CreatureAppearance, CreatureFrame } from './creature-types';

type Sample = { x: number; y: number; alpha: number };
const ALPHA_EDGE = 48;
const MAX_GRID = 160;

/** Build a closed alpha-shaped cushion, not a rectangular image plane.
 * Front triangles are clipped against alpha; the same outline has a rounded
 * rear cap and real side walls. No facial/limb anatomy is invented. */
export function buildDrawingGeometry(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
): THREE.BufferGeometry | null {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 2 ||
    height < 2 ||
    width > MAX_GRID ||
    height > MAX_GRID ||
    pixels.length !== width * height * 4
  )
    return null;
  const alpha = new Float32Array(width * height);
  const distance = new Float32Array(width * height);
  let minX = width,
    maxX = -1,
    minY = height,
    maxY = -1;
  let occupied = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      alpha[i] = Number(pixels[i * 4 + 3]) || 0;
      const inside = alpha[i] >= ALPHA_EDGE;
      distance[i] = inside ? 1_000 : 0;
      if (inside) {
        occupied++;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        if (x === 0 || y === 0 || x === width - 1 || y === height - 1)
          distance[i] = 1;
      }
    }
  if (occupied < 4 || maxX <= minX || maxY <= minY) return null;
  // Reject an opaque rectangular canvas. These inputs need background cleanup.
  if (occupied / ((maxX - minX + 1) * (maxY - minY + 1)) > 0.97) return null;
  const diagonal = Math.SQRT2;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (x) distance[i] = Math.min(distance[i], distance[i - 1] + 1);
      if (y) distance[i] = Math.min(distance[i], distance[i - width] + 1);
      if (x && y)
        distance[i] = Math.min(distance[i], distance[i - width - 1] + diagonal);
      if (x + 1 < width && y)
        distance[i] = Math.min(distance[i], distance[i - width + 1] + diagonal);
    }
  for (let y = height - 1; y >= 0; y--)
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (x + 1 < width)
        distance[i] = Math.min(distance[i], distance[i + 1] + 1);
      if (y + 1 < height)
        distance[i] = Math.min(distance[i], distance[i + width] + 1);
      if (x + 1 < width && y + 1 < height)
        distance[i] = Math.min(distance[i], distance[i + width + 1] + diagonal);
      if (x && y + 1 < height)
        distance[i] = Math.min(distance[i], distance[i + width - 1] + diagonal);
    }
  // The chamfer distance has diagonal steps. Smooth the depth field, not the
  // silhouette/paint, so its lit rear does not look like a folded paper grid.
  for (let pass = 0; pass < 3; pass++) {
    const previous = distance.slice();
    for (let y = 1; y < height - 1; y++)
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        if (alpha[i] >= ALPHA_EDGE)
          distance[i] =
            previous[i] * 0.5 +
            (previous[i - 1] +
              previous[i + 1] +
              previous[i - width] +
              previous[i + width]) *
              0.125;
      }
  }
  const positions: number[] = [],
    uvs: number[] = [],
    front: number[] = [];
  const vertices = new Map<string, number>();
  const unit = Math.min(2.25 / (maxX - minX + 2), 2.65 / (maxY - minY + 2));
  const centerX = (minX + maxX) / 2;
  const bevelRadius = Math.max(3, Math.min(maxX - minX, maxY - minY) * 0.22);
  function vertex(p: Sample) {
    const key = Math.round(p.x * 100_000) + ':' + Math.round(p.y * 100_000);
    const existing = vertices.get(key);
    if (existing !== undefined) return existing;
    const index = positions.length / 3;
    const d =
      p.alpha <= ALPHA_EDGE + 0.001
        ? 0
        : distance[Math.round(p.y) * width + Math.round(p.x)];
    const t = Math.min(1, d / bevelRadius);
    const depth = 0.045 + Math.sin((t * Math.PI) / 2) * 0.18;
    positions.push(
      (p.x - centerX) * unit,
      (maxY + 1 - p.y) * unit + 0.015,
      depth,
    );
    // getImageData samples pixel CENTERS, not the outside edges of a canvas.
    // Matching those centers prevents white/transparent stripes at the rim.
    uvs.push((p.x + 0.5) / width, 1 - (p.y + 0.5) / height);
    vertices.set(key, index);
    return index;
  }
  function clippedTriangle(points: Sample[]) {
    const polygon: Sample[] = [];
    for (let index = 0; index < 3; index++) {
      const from = points[index],
        to = points[(index + 1) % 3];
      const fromInside = from.alpha >= ALPHA_EDGE,
        toInside = to.alpha >= ALPHA_EDGE;
      if (fromInside) polygon.push(from);
      if (fromInside !== toInside) {
        const ratio = (ALPHA_EDGE - from.alpha) / (to.alpha - from.alpha);
        polygon.push({
          x: from.x + (to.x - from.x) * ratio,
          y: from.y + (to.y - from.y) * ratio,
          alpha: ALPHA_EDGE,
        });
      }
    }
    for (let i = 1; i + 1 < polygon.length; i++) {
      const a = vertex(polygon[0]),
        b = vertex(polygon[i]),
        c = vertex(polygon[i + 1]);
      if (a !== b && b !== c && c !== a) front.push(a, b, c);
    }
  }
  const sample = (x: number, y: number): Sample => ({
    x,
    y,
    alpha: alpha[y * width + x],
  });
  for (let y = 0; y < height - 1; y++)
    for (let x = 0; x < width - 1; x++) {
      const a = sample(x, y),
        b = sample(x, y + 1),
        c = sample(x + 1, y),
        d = sample(x + 1, y + 1);
      clippedTriangle([a, b, c]);
      clippedTriangle([c, b, d]);
    }
  if (!front.length) return null;
  const capCount = positions.length / 3;
  for (let i = 0; i < capCount; i++) {
    positions.push(
      positions[i * 3],
      positions[i * 3 + 1],
      -positions[i * 3 + 2],
    );
    uvs.push(uvs[i * 2], uvs[i * 2 + 1]);
  }
  const rear: number[] = [];
  const edges = new Map<string, { a: number; b: number; count: number }>();
  for (let i = 0; i < front.length; i += 3) {
    rear.push(
      front[i] + capCount,
      front[i + 2] + capCount,
      front[i + 1] + capCount,
    );
    for (const [a, b] of [
      [front[i], front[i + 1]],
      [front[i + 1], front[i + 2]],
      [front[i + 2], front[i]],
    ]) {
      const key = Math.min(a, b) + ':' + Math.max(a, b);
      const edge = edges.get(key);
      if (edge) edge.count++;
      else edges.set(key, { a, b, count: 1 });
    }
  }
  const sides: number[] = [];
  for (const { a, b, count } of edges.values())
    if (count === 1)
      sides.push(a, a + capCount, b, b, a + capCount, b + capCount);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex([...front, ...rear, ...sides]);
  geometry.addGroup(0, front.length, 0);
  geometry.addGroup(front.length, rear.length + sides.length, 1);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = {
    alphaClipped: true,
    capVertices: capCount,
    frontTriangles: front.length / 3,
    sideTriangles: sides.length / 3,
    textureSampling: 'pixel-centers',
  };
  return geometry;
}

/** Locally decoded artwork becomes a softly breathing thick drawing puppet.
 * It preserves the supplied front image instead of guessing eyes or anatomy. */
export function createDrawingCreature(appearance: CreatureAppearance) {
  const root = new THREE.Group();
  root.name = 'DrawingPuppet';
  root.userData = {
    rigType: 'alpha-cushion',
    drawingStatus: 'loading',
    drawingAssetId: appearance.drawingAssetId,
  };
  const body = new THREE.Group();
  body.name = 'DrawingBody';
  root.add(body);
  let disposed = false;
  let image: HTMLImageElement | null = null;
  let mesh: THREE.Mesh | null = null;
  let texture: THREE.Texture | null = null;
  let imageTimeout: ReturnType<typeof setTimeout> | undefined;
  const materials: THREE.Material[] = [];
  let resolveReady: (value: boolean) => void = () => {};
  const ready = new Promise<boolean>((resolve) => {
    resolveReady = resolve;
  });
  const settle = (value: boolean) => {
    clearTimeout(imageTimeout);
    resolveReady(value);
  };
  const failed = () => {
    if (!disposed) root.userData.drawingStatus = 'error';
    if (image) {
      image.onload = null;
      image.onerror = null;
      image.src = '';
      image = null;
    }
    settle(false);
  };
  if (
    typeof Image === 'undefined' ||
    !appearance.drawingImage?.startsWith('data:image/png;base64,') ||
    appearance.drawingImage.length > 12_000_000
  ) {
    failed();
  } else {
    image = new Image();
    image.onload = () => {
      if (disposed || !image) return;
      try {
        if (
          !image.naturalWidth ||
          !image.naturalHeight ||
          image.naturalWidth * image.naturalHeight > 16_777_216
        ) {
          failed();
          return;
        }
        const resolution = Math.min(
          126 / image.naturalWidth,
          158 / image.naturalHeight,
          1,
        );
        const width = Math.max(2, Math.round(image.naturalWidth * resolution));
        const height = Math.max(
          2,
          Math.round(image.naturalHeight * resolution),
        );
        // A transparent border closes even silhouettes that touch the source edge.
        const mask = document.createElement('canvas');
        mask.width = width + 2;
        mask.height = height + 2;
        const context = mask.getContext('2d', { willReadFrequently: true });
        if (!context) {
          failed();
          return;
        }
        context.drawImage(image, 1, 1, width, height);
        const pixels = context.getImageData(0, 0, mask.width, mask.height).data;
        const geometry = buildDrawingGeometry(pixels, mask.width, mask.height);
        if (!geometry) {
          failed();
          return;
        }
        // Keep the texture high-resolution; geometry alone uses the bounded grid.
        const painted = document.createElement('canvas');
        const textureScale = Math.min(
          1022 / image.naturalWidth,
          1022 / image.naturalHeight,
          1,
        );
        const innerWidth = Math.max(
          1,
          Math.round(image.naturalWidth * textureScale),
        );
        const innerHeight = Math.max(
          1,
          Math.round(image.naturalHeight * textureScale),
        );
        painted.width = Math.ceil((innerWidth * mask.width) / width);
        painted.height = Math.ceil((innerHeight * mask.height) / height);
        // Exact same normalized one-pixel border as the geometry mask, even
        // when the large texture dimensions have been rounded to integers.
        const padX = painted.width / mask.width,
          padY = painted.height / mask.height;
        const painter = painted.getContext('2d');
        if (!painter) {
          geometry.dispose();
          failed();
          return;
        }
        painter.drawImage(
          image,
          padX,
          padY,
          painted.width - padX * 2,
          painted.height - padY * 2,
        );
        texture = new THREE.CanvasTexture(painted);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        // AI artwork already contains its own soft lighting. Relighting it
        // multiplies those shadows and reveals the proxy mesh's grid facets.
        const frontMaterial = new THREE.MeshBasicMaterial({
          map: texture,
          color: '#ffffff',
          toneMapped: false,
          transparent: true,
          alphaTest: 0.025,
        });
        const backMaterial = new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(appearance.bodyColor).lerp(
            new THREE.Color('#fff5e6'),
            0.25,
          ),
          roughness: 0.92,
          sheen: 0.6,
          sheenRoughness: 0.9,
          specularIntensity: 0.18,
        });
        materials.push(frontMaterial, backMaterial);
        mesh = new THREE.Mesh(geometry, [frontMaterial, backMaterial]);
        mesh.name = 'InflatedDrawingSilhouette';
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        body.add(mesh);
        root.userData.drawingStatus = 'ready';
        settle(true);
      } catch {
        failed();
      } finally {
        if (image) {
          image.onload = null;
          image.onerror = null;
        }
        image = null;
      }
    };
    image.onerror = failed;
    imageTimeout = setTimeout(failed, 8_000);
    image.src = appearance.drawingImage;
  }

  let localTime = 0,
    actionTime = 0,
    moveBlend = 0;
  let lastAction = 'idle',
    lastActionId: number | undefined;
  function update(dt: number, _time: number, input: CreatureFrame) {
    const delta = THREE.MathUtils.clamp(Number.isFinite(dt) ? dt : 0, 0, 0.08);
    localTime += delta;
    const action = input.action || 'idle';
    if (action !== lastAction || input.actionId !== lastActionId) {
      actionTime = 0;
      lastAction = action;
      lastActionId = input.actionId;
    }
    actionTime += delta;
    const reduce = input.reducedMotion ? 0.12 : 1;
    const ease = 1 - Math.exp(-delta * 10);
    moveBlend = THREE.MathUtils.lerp(moveBlend, input.moving ? 1 : 0, ease);
    const gait = Math.sin(localTime * 10.5) * moveBlend * reduce;
    const breath = Math.sin(localTime * 2.05) * 0.012 * reduce;
    const hop =
      action === 'hop'
        ? Math.sin(Math.min(actionTime / 0.8, 1) * Math.PI) * 0.46 * reduce
        : 0;
    const joy =
      action === 'celebrate'
        ? Math.abs(Math.sin(actionTime * 6)) * 0.18 * reduce
        : 0;
    const greet =
      action === 'wave'
        ? Math.sin(actionTime * 7) *
          Math.sin(Math.min(actionTime / 1.7, 1) * Math.PI) *
          0.13 *
          reduce
        : 0;
    body.position.y = Math.abs(gait) * 0.055 + hop + joy;
    body.rotation.z =
      gait * 0.045 +
      greet +
      (action === 'pet' ? Math.sin(actionTime * 4) * 0.035 * reduce : 0);
    body.rotation.x = moveBlend * 0.05 + (action === 'sleep' ? 0.08 : 0);
    body.rotation.y = THREE.MathUtils.lerp(
      body.rotation.y,
      THREE.MathUtils.clamp(input.lookX || 0, -1, 1) * 0.15 +
        (action === 'curious' ? Math.sin(actionTime * 2) * 0.1 * reduce : 0),
      ease,
    );
    body.scale.set(1 - breath * 0.3, 1 + breath, 1 + breath * 0.6);
  }
  return {
    root,
    ready,
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (image) {
        image.onload = null;
        image.onerror = null;
        image.src = '';
        image = null;
      }
      mesh?.geometry.dispose();
      texture?.dispose();
      materials.forEach((material) => material.dispose());
      body.clear();
      root.userData.drawingStatus = 'disposed';
      settle(false);
    },
  };
}
