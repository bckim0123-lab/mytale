import * as THREE from 'three';
import { DEFAULT_APPEARANCE } from './creature-types';
import type { CreatureAppearance, CreatureFrame, CreatureKind } from './creature-types';

export { DEFAULT_APPEARANCE } from './creature-types';
export type { CreatureAppearance, CreatureAction, CreatureFrame, CreatureKind } from './creature-types';

export type CreatureRig = {
  root: THREE.Group;
  update: (dt: number, time: number, input: CreatureFrame) => void;
  dispose: () => void;
};

const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;

// Small, object-space fibres catch light like brushed fabric. This augments
// the portable PBR material in WebGL without texture downloads or extra meshes.
function addPlushSurface(material: THREE.MeshPhysicalMaterial) {
  material.roughness = .89;
  material.sheen = .60;
  material.specularIntensity = .38;
  material.onBeforeCompile = shader => {
    shader.vertexShader = `varying vec3 vPlushPosition;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\nvPlushPosition = position;',
    );
    shader.fragmentShader = `
      varying vec3 vPlushPosition;
      float plushHash(vec3 p) {
        p = fract(p * vec3(.1031, .11369, .13787));
        p += dot(p, p.yzx + 19.19);
        return fract((p.x + p.y) * p.z);
      }
      float plushNoise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(plushHash(i), plushHash(i + vec3(1,0,0)), f.x),
                       mix(plushHash(i + vec3(0,1,0)), plushHash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(plushHash(i + vec3(0,0,1)), plushHash(i + vec3(1,0,1)), f.x),
                       mix(plushHash(i + vec3(0,1,1)), plushHash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      vec3 plushNormal(vec3 surface, vec3 surfaceNormal, float height) {
        vec3 dx = dFdx(surface), dy = dFdy(surface);
        vec3 acrossX = cross(dy, surfaceNormal), acrossY = cross(surfaceNormal, dx);
        float determinant = dot(dx, acrossX);
        vec3 gradient = sign(determinant) * (dFdx(height) * acrossX + dFdy(height) * acrossY);
        return normalize(abs(determinant) * surfaceNormal - gradient);
      }
      ${shader.fragmentShader}`.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
       float plushDetail = plushNoise(vPlushPosition * vec3(85.0, 112.0, 85.0));
       float plushFade = 1.0 - smoothstep(.025, .08, length(fwidth(vPlushPosition)));
       normal = plushNormal(-vViewPosition, normal, plushDetail * .0014 * plushFade);`,
    );
  };
  material.customProgramCacheKey = () => 'drawing-friend-plush-v1';
}

/** A reusable, articulated mesh companion. All features have real volume;
 * there are no billboard/image planes or remote texture dependencies. */
export function createCreature(appearance: CreatureAppearance = DEFAULT_APPEARANCE): CreatureRig {
  const root = new THREE.Group();
  root.name = 'DrawingFriend';
  root.userData = { assetVersion: 1, rigType: 'articulated', appearance: { ...appearance } };
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const geometry = <T extends THREE.BufferGeometry>(g: T) => { geometries.add(g); return g; };
  const sphere = geometry(new THREE.SphereGeometry(1, 32, 20));
  const detailSphere = geometry(new THREE.SphereGeometry(1, 20, 14));
  const makeMaterial = (color: THREE.ColorRepresentation, extra: THREE.MeshPhysicalMaterialParameters = {}) => {
    const m = new THREE.MeshPhysicalMaterial({ color, roughness: .78, metalness: 0, sheen: .75, sheenRoughness: .86, sheenColor: '#ffffff', ...extra });
    materials.add(m);
    return m;
  };
  const fur = makeMaterial(appearance.bodyColor);
  const cream = makeMaterial(new THREE.Color(appearance.bodyColor).lerp(new THREE.Color('#fffaf1'), .57));
  addPlushSurface(fur);
  addPlushSurface(cream);
  const accent = makeMaterial(appearance.accentColor, { roughness: .67 });
  const accentLight = makeMaterial(new THREE.Color(appearance.accentColor).lerp(new THREE.Color('#eaffda'), .4));
  const pink = makeMaterial('#efa795');
  const innerEar = makeMaterial('#efc6b4');
  const dark = makeMaterial('#251c20', { roughness: .27, clearcoat: .32, clearcoatRoughness: .16, specularIntensity: .42, envMapIntensity: .33, sheen: 0 });
  const iris = makeMaterial('#604034', { roughness: .60, clearcoat: 0, specularIntensity: .08, envMapIntensity: .15, sheen: 0 });
  const pupil = makeMaterial('#251c20', { roughness: .50, clearcoat: 0, specularIntensity: .08, envMapIntensity: .15, sheen: 0 });
  const white = new THREE.MeshBasicMaterial({ color: '#fffaf1', toneMapped: false });
  materials.add(white);
  const gold = makeMaterial('#f9c571', { roughness: .3, metalness: .28, clearcoat: .4 });
  const seam = makeMaterial('#705947', { roughness: .95, sheen: 0 });

  function ellipsoid(parent: THREE.Object3D, name: string, mat: THREE.Material, position: [number, number, number], size: [number, number, number], detail = false) {
    const mesh = new THREE.Mesh(detail ? detailSphere : sphere, mat);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.scale.set(...size);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function pivot(parent: THREE.Object3D, name: string, x: number, y: number, z: number) {
    const node = new THREE.Group(); node.name = name; node.position.set(x, y, z); parent.add(node); return node;
  }
  function tube(parent: THREE.Object3D, name: string, points: number[][], radius: number, mat: THREE.Material) {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    const mesh = new THREE.Mesh(geometry(new THREE.TubeGeometry(curve, 20, radius, 6, false)), mat);
    mesh.name = name; mesh.castShadow = true; parent.add(mesh); return mesh;
  }
  const bodyPivot = pivot(root, 'BodyPivot', 0, .83, 0);
  ellipsoid(bodyPivot, 'PearBody', fur, [0, 0, 0], [.57, .66, .43]);
  ellipsoid(bodyPivot, 'SoftTummy', cream, [0, -.045, .335], [.37, .40, .135]);
  const head = pivot(bodyPivot, 'HeadPivot', 0, .88, .015);
  const headGeometry = geometry(new THREE.SphereGeometry(1, 40, 28));
  const headPositions = headGeometry.attributes.position;
  // Sculpt the lower cheeks into one continuous surface, with no attached lobes.
  for (let i = 0; i < headPositions.count; i++) {
    const x = headPositions.getX(i), y = headPositions.getY(i), z = headPositions.getZ(i);
    const lowerCheek = Math.sin(clamp(-y, 0, 1) * Math.PI);
    const cheekFront = .08 * Math.exp(-((Math.abs(x) - .52) ** 2 / .08 + (y + .30) ** 2 / .12)) * Math.max(z, 0);
    headPositions.setXYZ(i, x * (1 + lowerCheek * .09 - Math.max(y, 0) * .035), y, z * (1 + lowerCheek * .035) + cheekFront);
  }
  headGeometry.computeVertexNormals();
  const headNormals = headGeometry.attributes.normal;
  for (let i = 0; i < headNormals.count; i++) {
    const normal = new THREE.Vector3().fromBufferAttribute(headNormals, i);
    if (normal.lengthSq() < .5) normal.fromBufferAttribute(headPositions, i);
    normal.normalize();
    headNormals.setXYZ(i, normal.x, normal.y, normal.z);
  }
  const headMesh = new THREE.Mesh(headGeometry, fur);
  headMesh.name = 'CloudHead'; headMesh.scale.set(.86, .70, .64); headMesh.castShadow = true; headMesh.receiveShadow = true; head.add(headMesh);
  ellipsoid(head, 'MuzzleL', cream, [-.113, -.25, .592], [.19, .139, .095], true);
  ellipsoid(head, 'MuzzleR', cream, [.113, -.25, .592], [.19, .139, .095], true);
  ellipsoid(head, 'BlushL', pink, [-.53, -.17, .539], [.135, .083, .023], true).rotation.y = -.30;
  ellipsoid(head, 'BlushR', pink, [.53, -.17, .539], [.135, .083, .023], true).rotation.y = .30;

  const eyes: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const eye = pivot(head, side === -1 ? 'EyeL' : 'EyeR', side * .30, .032, .572);
    eye.rotation.y = side * .13;
    ellipsoid(eye, `EyeWhite${side}`, cream, [0, 0, -.008], [.144, .172, .066], true);
    ellipsoid(eye, `EyeGlass${side}`, dark, [0, 0, .024], [.126, .154, .087], true);
    ellipsoid(eye, `WarmIris${side}`, iris, [0, -.048, .096], [.079, .058, .019], true);
    ellipsoid(eye, `EyePupil${side}`, pupil, [0, .02, .092], [.092, .108, .031], true);
    ellipsoid(eye, `EyeCatchlight${side}`, white, [-.040, .060, .119], [.040, .045, .014], true);
    ellipsoid(eye, `EyeSpark${side}`, white, [.046, -.045, .120], [.016, .017, .009], true);
    // Layered eye details must not shadow each other: that produces glittery
    // shadow acne at mobile sizes instead of a single clear expression.
    eye.traverse(node => { if (node instanceof THREE.Mesh) { node.castShadow = false; node.receiveShadow = false; } });
    eyes.push(eye);
  }
  ellipsoid(head, 'ButtonNose', pink, [0, -.152, .680], [.079, .060, .052], true);
  ellipsoid(head, 'NoseHighlight', cream, [-.018, -.133, .727], [.017, .01, .007], true);
  const smile = tube(head, 'Smile', [[-.125, -.287, .674], [-.065, -.324, .694], [0, -.337, .696], [.065, -.324, .694], [.125, -.287, .674]], .012, seam);
  const openMouth = pivot(head, 'OpenMouth', 0, -.307, .693);
  ellipsoid(openMouth, 'MouthInterior', dark, [0, 0, 0], [.070, .079, .018], true);
  ellipsoid(openMouth, 'TinyTongue', pink, [0, -.035, .020], [.045, .022, .009], true);
  openMouth.scale.setScalar(.001);

  const earPivots: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const ear = pivot(head, side === -1 ? 'EarL' : 'EarR', side * .57, .44, -.055);
    ear.rotation.z = side * -.23;
    if (appearance.kind === 'bunny') {
      ellipsoid(ear, `BunnyEar${side}`, fur, [0, .28, 0], [.18, .49, .145]);
      ellipsoid(ear, `BunnyEarInner${side}`, innerEar, [0, .29, .115], [.10, .355, .045], true);
    } else if (appearance.kind === 'cat') {
      const shape = new THREE.Shape(); shape.moveTo(-.20, -.07); shape.quadraticCurveTo(-.16, .20, -.035, .37); shape.quadraticCurveTo(.005, .42, .05, .35); shape.quadraticCurveTo(.22, .15, .22, -.07); shape.closePath();
      const g = geometry(new THREE.ExtrudeGeometry(shape, { depth: .12, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: .065, bevelThickness: .06, curveSegments: 10 }));
      const mesh = new THREE.Mesh(g, fur); mesh.name = `CatEar${side}`; mesh.castShadow = true; mesh.position.z = -.12; ear.add(mesh);
      ellipsoid(ear, `CatEarInner${side}`, innerEar, [0, .12, .071], [.10, .18, .04], true);
    } else {
      ellipsoid(ear, `RoundEar${side}`, fur, [0, .065, 0], [.235, .235, .145]);
      ellipsoid(ear, `RoundEarInner${side}`, innerEar, [0, .07, .113], [.128, .135, .041], true);
    }
    earPivots.push(ear);
  }
  const tuft = pivot(head, 'LeafTuft', 0, .64, .015);
  if (appearance.kind === 'sprout') {
    tube(tuft, 'LeafStem', [[0, -.015, 0], [.025, .125, -.014], [0, .22, -.018]], .029, accent);
    const leafL = ellipsoid(tuft, 'LeafL', accent, [-.12, .19, 0], [.205, .085, .125], true); leafL.rotation.z = -.43;
    const leafR = ellipsoid(tuft, 'LeafR', accentLight, [.11, .27, -.018], [.20, .077, .11], true); leafR.rotation.z = .43;
  } else {
    ellipsoid(tuft, 'ForeheadTuftL', cream, [-.085, -.042, .045], [.14, .11, .12], true).rotation.z = -.3;
    ellipsoid(tuft, 'ForeheadTuftR', cream, [.07, -.025, .024], [.12, .12, .12], true).rotation.z = .38;
  }

  const armL = pivot(bodyPivot, 'ArmL', -.50, .21, .01);
  const armR = pivot(bodyPivot, 'ArmR', .50, .21, .01);
  armL.rotation.z = -.11;
  armR.rotation.z = .11;
  for (const [arm, side] of [[armL, -1], [armR, 1]] as const) {
    ellipsoid(arm, `ArmFur${side}`, fur, [side * .09, -.22, .025], [.195, .30, .19]);
    ellipsoid(arm, `PawPad${side}`, innerEar, [side * .095, -.35, .175], [.083, .065, .03], true);
  }
  const legL = pivot(bodyPivot, 'LegL', -.255, -.42, .012);
  const legR = pivot(bodyPivot, 'LegR', .255, -.42, .012);
  for (const [leg, side] of [[legL, -1], [legR, 1]] as const) {
    ellipsoid(leg, `Foot${side}`, fur, [0, -.225, .085], [.205, .18, .27]);
    ellipsoid(leg, `ToeGlow${side}`, cream, [0, -.196, .297], [.124, .091, .043], true);
  }
  const tail = pivot(bodyPivot, 'TailPivot', 0, -.19, -.37);
  if (appearance.kind === 'cat') {
    tube(tail, 'CurledTail', [[0, 0, 0], [.23, .02, -.23], [.48, .24, -.30], [.48, .49, -.19], [.33, .53, -.15]], .095, fur);
  } else {
    ellipsoid(tail, 'PomTail', cream, [0, .015, -.12], [.215, .20, .22]);
  }

  const accessory = pivot(bodyPivot, 'AccessoryPivot', 0, .345, .405);
  // A softly curved leaf collar gives each creature the same family identity.
  for (const side of [-1, 1]) {
    const collar = ellipsoid(bodyPivot, `LeafCollar${side}`, accent, [side * .215, .385, .328], [.267, .10, .115], true);
    collar.rotation.z = side * .39;
  }
  if (appearance.accessory === 'star') {
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const angle = Math.PI / 2 + i * Math.PI / 5; const radius = i % 2 === 0 ? .157 : .078;
      const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
      if (i === 0) star.moveTo(x, y); else star.lineTo(x, y);
    }
    star.closePath();
    const pendant = new THREE.Mesh(geometry(new THREE.ExtrudeGeometry(star, { depth: .045, bevelEnabled: true, bevelSegments: 3, bevelSize: .023, bevelThickness: .023, curveSegments: 4 })), gold);
    pendant.name = 'WishStar'; pendant.position.set(0, -.13, .016); pendant.castShadow = true; accessory.add(pendant);
    ellipsoid(accessory, 'GoldClasp', gold, [0, .045, .019], [.042, .063, .040], true);
  } else if (appearance.accessory === 'flower') {
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      ellipsoid(accessory, `Petal${i}`, cream, [Math.sin(a) * .098, -.07 + Math.cos(a) * .098, .058], [.07, .07, .037], true);
    }
    ellipsoid(accessory, 'FlowerHeart', gold, [0, -.07, .09], [.065, .065, .042], true);
  } else {
    const knot = ellipsoid(accessory, 'ScarfKnot', accentLight, [0, -.01, .05], [.106, .085, .08], true);
    knot.rotation.z = -.2;
    ellipsoid(accessory, 'ScarfEndL', accent, [-.075, -.18, .023], [.09, .18, .05], true).rotation.z = -.20;
    ellipsoid(accessory, 'ScarfEndR', accentLight, [.07, -.15, .045], [.087, .15, .05], true).rotation.z = .35;
  }

  let moveBlend = 0, localTime = 0, actionTime = 0, lastAction = 'idle';
  let headX = 0, headY = 0, headZ = 0, gaitPhase = 0;
  let expressionBlend = 0;
  function update(dt: number, _time: number, input: CreatureFrame) {
    const delta = clamp(Number.isFinite(dt) ? dt : 0, 0, .08);
    localTime += delta;
    const action = input.action || 'idle';
    if (action !== lastAction) { actionTime = 0; lastAction = action; }
    actionTime += delta;
    const eased = 1 - Math.exp(-delta * 10);
    moveBlend = mix(moveBlend, input.moving ? 1 : 0, eased);
    expressionBlend = mix(expressionBlend, action === 'sleep' ? 1 : 0, eased);
    const reduced = input.reducedMotion ? .16 : 1;
    gaitPhase += delta * (7.5 + clamp(input.speed ?? 1, 0, 3) * 3.5);
    const gait = Math.sin(gaitPhase) * moveBlend * reduced;
    const breathing = Math.sin(localTime * 2.15) * .014 * reduced;
    const joy = action === 'celebrate';
    const pet = action === 'pet';
    const sleeping = action === 'sleep';
    const hop = action === 'hop' ? Math.pow(Math.max(0, Math.sin(Math.min(actionTime / .8, 1) * Math.PI)), 1.25) * .47 * reduced : 0;
    const bouncing = joy ? Math.abs(Math.sin(actionTime * 6.5)) * .14 * reduced : 0;
    bodyPivot.position.y = .83 + breathing + Math.abs(gait) * .055 + hop + bouncing - expressionBlend * .10;
    bodyPivot.rotation.z = gait * .048 + (pet ? Math.sin(actionTime * 5) * .045 * reduced : 0);
    bodyPivot.rotation.x = moveBlend * .07 - expressionBlend * .09;
    bodyPivot.scale.set(1 + breathing * .36, 1 + breathing, 1 + breathing * .6);
    const curious = action === 'curious';
    const targetX = clamp(input.lookY ?? 0, -.5, .5) * .21 + (sleeping ? .17 : pet ? -.10 : 0);
    const targetY = clamp(input.lookX ?? 0, -1, 1) * .34 + (curious ? Math.sin(actionTime * 1.7) * .15 : 0);
    const targetZ = curious ? -.17 : pet ? Math.sin(actionTime * 2.3) * .09 : 0;
    headX = mix(headX, targetX, eased * .65); headY = mix(headY, targetY, eased * .65); headZ = mix(headZ, targetZ, eased * .65);
    head.rotation.set(headX - gait * .025, headY, headZ - gait * .027);
    // Deterministic double blinks. The whole glossy eye squashes into a smile.
    const blinkCycle = localTime % 4.7;
    const blink = blinkCycle < .14 ? Math.sin(blinkCycle / .14 * Math.PI) : blinkCycle > .29 && blinkCycle < .39 ? Math.sin((blinkCycle - .29) / .1 * Math.PI) : 0;
    const happyEyes = pet ? .57 + Math.sin(actionTime * 3) * .05 : 1;
    const eyeScale = Math.max(.065, (1 - blink * .93) * happyEyes * (1 - expressionBlend * .92));
    for (const eye of eyes) eye.scale.y = eyeScale;
    const mouthIsOpen = joy || (curious && Math.sin(actionTime * 1.7) > .15);
    smile.visible = !mouthIsOpen;
    if (mouthIsOpen) openMouth.scale.set(joy ? 1.28 : .78, joy ? .85 : 1, 1);
    else openMouth.scale.setScalar(.001);
    let leftX = gait * .62, rightX = -gait * .62;
    let leftZ = -.11, rightZ = .11, rightY = 0;
    if (action === 'wave') {
      rightX = -.12;
      rightY = Math.sin(actionTime * 6) * .22 * reduced;
      rightZ = 2.25 + Math.sin(actionTime * 9) * .24 * reduced;
      head.rotation.z -= .075;
    } else if (joy) {
      leftZ = -1.96 - Math.sin(actionTime * 7) * .18 * reduced;
      rightZ = 1.96 + Math.sin(actionTime * 7) * .18 * reduced;
    } else if (pet || sleeping) {
      leftX = -.39; rightX = -.39;
      leftZ = .13; rightZ = -.13;
    } else if (hop > .02) {
      leftZ = -.80; rightZ = .80;
    }
    armL.rotation.set(mix(armL.rotation.x, leftX, eased), 0, mix(armL.rotation.z, leftZ, eased));
    armR.rotation.set(mix(armR.rotation.x, rightX, eased), mix(armR.rotation.y, rightY, eased), mix(armR.rotation.z, rightZ, eased));
    legL.rotation.x = -gait * .63;
    legR.rotation.x = gait * .63;
    legL.position.y = -.42 + Math.max(0, gait) * .042;
    legR.position.y = -.42 + Math.max(0, -gait) * .042;
    tail.rotation.y = Math.sin(localTime * (pet || joy ? 9 : 3.1)) * (pet || joy ? .40 : .13) * reduced;
    const earWiggle = (Math.sin(localTime * 2.6) * .027 + Math.abs(gait) * .09) * reduced;
    earPivots[0].rotation.z = .23 + earWiggle;
    earPivots[1].rotation.z = -.23 - earWiggle;
    earPivots[0].rotation.x = appearance.kind === 'bunny' ? -.12 + gait * .09 : 0;
    earPivots[1].rotation.x = appearance.kind === 'bunny' ? .05 - gait * .09 : 0;
    tuft.rotation.z = Math.sin(localTime * 2.9) * .045 * reduced + gait * .05;
    accessory.rotation.z = Math.sin(localTime * 3.4) * .025 * reduced + gait * .09;
  }
  update(0, 0, { moving: false });
  return { root, update, dispose: () => { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); } };
}

/** Portable animation clips use the same named pivots as the realtime rig.
 * They remain editable in a 3D authoring tool after exporting the GLB. */
export function createCreatureAnimations(): THREE.AnimationClip[] {
  const rotation = (name: string, times: number[], angles: number[][]) => {
    const values = angles.flatMap(a => new THREE.Quaternion().setFromEuler(new THREE.Euler(a[0], a[1], a[2])).toArray());
    return new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, values);
  };
  const position = (name: string, times: number[], values: number[][]) => new THREE.VectorKeyframeTrack(`${name}.position`, times, values.flat());
  const idle = new THREE.AnimationClip('Breathe', 2.8, [position('BodyPivot', [0, 1.4, 2.8], [[0, .83, 0], [0, .845, 0], [0, .83, 0]]), rotation('HeadPivot', [0, 1.4, 2.8], [[0, -.025, -.018], [.018, .025, .018], [0, -.025, -.018]])]);
  const t = [0, .2, .4, .6, .8];
  const walk = new THREE.AnimationClip('Walk', .8, [rotation('LegL', t, [[0, 0, 0], [.52, 0, 0], [0, 0, 0], [-.52, 0, 0], [0, 0, 0]]), rotation('LegR', t, [[0, 0, 0], [-.52, 0, 0], [0, 0, 0], [.52, 0, 0], [0, 0, 0]]), rotation('ArmL', t, [[0, 0, -.11], [-.40, 0, -.11], [0, 0, -.11], [.40, 0, -.11], [0, 0, -.11]]), rotation('ArmR', t, [[0, 0, .11], [.40, 0, .11], [0, 0, .11], [-.40, 0, .11], [0, 0, .11]]), position('BodyPivot', t, [[0, .83, 0], [0, .88, 0], [0, .83, 0], [0, .88, 0], [0, .83, 0]])]);
  const wave = new THREE.AnimationClip('Wave', 1.6, [rotation('ArmR', [0, .3, .55, .8, 1.05, 1.3, 1.6], [[0, 0, .11], [-.12, 0, 2.2], [-.12, -.2, 2.5], [-.12, .2, 2.1], [-.12, -.2, 2.5], [-.12, .2, 2.1], [0, 0, .11]]), rotation('HeadPivot', [0, .35, 1.3, 1.6], [[0, 0, 0], [0, 0, -.07], [0, 0, -.07], [0, 0, 0]])]);
  const hop = new THREE.AnimationClip('Hop', .8, [position('BodyPivot', [0, .15, .4, .65, .8], [[0, .83, 0], [0, .76, 0], [0, 1.30, 0], [0, .78, 0], [0, .83, 0]]), rotation('ArmL', [0, .4, .8], [[0, 0, -.11], [0, 0, -.8], [0, 0, -.11]]), rotation('ArmR', [0, .4, .8], [[0, 0, .11], [0, 0, .8], [0, 0, .11]])]);
  const celebrate = new THREE.AnimationClip('Celebrate', 1.2, [rotation('ArmL', [0, .3, .6, .9, 1.2], [[0, 0, -.11], [0, 0, -2.2], [0, 0, -1.8], [0, 0, -2.2], [0, 0, -.11]]), rotation('ArmR', [0, .3, .6, .9, 1.2], [[0, 0, .11], [0, 0, 2.2], [0, 0, 1.8], [0, 0, 2.2], [0, 0, .11]]), position('BodyPivot', [0, .3, .6, .9, 1.2], [[0, .83, 0], [0, 1, 0], [0, .83, 0], [0, 1, 0], [0, .83, 0]])]);
  const curious = new THREE.AnimationClip('Curious', 2, [rotation('HeadPivot', [0, .5, 1.2, 2], [[0, 0, 0], [-.03, -.15, -.17], [-.03, .15, -.17], [0, 0, 0]])]);
  const eyeTrack = (name: string, duration: number, y: number) => new THREE.VectorKeyframeTrack(`${name}.scale`, [0, .2, duration - .2, duration], [1, 1, 1, 1, y, 1, 1, y, 1, 1, 1, 1]);
  const pet = new THREE.AnimationClip('Pet', 1.8, [eyeTrack('EyeL', 1.8, .5), eyeTrack('EyeR', 1.8, .5), rotation('HeadPivot', [0, .5, .9, 1.4, 1.8], [[0, 0, 0], [-.10, 0, -.07], [-.10, 0, .07], [-.10, 0, -.07], [0, 0, 0]])]);
  const sleep = new THREE.AnimationClip('Sleep', 3, [eyeTrack('EyeL', 3, .07), eyeTrack('EyeR', 3, .07), rotation('HeadPivot', [0, .5, 2.5, 3], [[0, 0, 0], [.16, 0, -.06], [.16, 0, -.06], [0, 0, 0]])]);
  return [idle, walk, wave, hop, celebrate, curious, pet, sleep];
}

export const CREATURE_VARIANTS: Record<CreatureKind, CreatureAppearance> = {
  sprout: DEFAULT_APPEARANCE,
  bunny: { kind: 'bunny', bodyColor: '#fff0e5', accentColor: '#dba5ac', accessory: 'flower' },
  cat: { kind: 'cat', bodyColor: '#efd0a6', accentColor: '#94b9c9', accessory: 'scarf' },
  bear: { kind: 'bear', bodyColor: '#ead4c4', accentColor: '#adacd4', accessory: 'star' },
};
