'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  BufferAttribute,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Texture,
} from 'three';
import type { AdventureTrait } from './adventures';

export type AdventureWorldPhase =
  | 'entering'
  | 'idle'
  | 'playing'
  | 'acting'
  | 'resolved'
  | 'exiting';

type AdventureWorld3DProps = {
  image?: string | null;
  worldId: string;
  sceneIndex: number;
  phase: AdventureWorldPhase;
  trait: AdventureTrait | null;
  questProgress: number;
  questPulse: number;
  questHits: number[];
  gesture: number;
  petted: boolean;
  memoryTraits: AdventureTrait[];
  onReady?: (ready: boolean) => void;
};

type WorldPalette = {
  ground: number;
  groundEdge: number;
  accent: number;
  accentSoft: number;
  prop: number;
  propSoft: number;
  fog: number;
};

const DEFAULT_CHARACTER_ASSET = '/game-mascot-3d-v1.webp';

const palettes: Record<string, WorldPalette> = {
  moon: {
    ground: 0x244e43,
    groundEdge: 0x112f32,
    accent: 0xffdf82,
    accentSoft: 0x9de6c2,
    prop: 0x77a873,
    propSoft: 0xb9d993,
    fog: 0x17343c,
  },
  ocean: {
    ground: 0x167c87,
    groundEdge: 0x0c4059,
    accent: 0xffbe8d,
    accentSoft: 0x8ff0e6,
    prop: 0xe77c83,
    propSoft: 0xffd1a9,
    fog: 0x0f6680,
  },
  cloud: {
    ground: 0x90cbd5,
    groundEdge: 0x7394c4,
    accent: 0xffe89a,
    accentSoft: 0xf6d4ff,
    prop: 0xf8f5e9,
    propSoft: 0xd7f2f2,
    fog: 0x9ccedf,
  },
  space: {
    ground: 0x323b75,
    groundEdge: 0x17183b,
    accent: 0xffd56e,
    accentSoft: 0xa7a6ff,
    prop: 0x9c8ee7,
    propSoft: 0xf09fd2,
    fog: 0x171938,
  },
  dino: {
    ground: 0x557d4b,
    groundEdge: 0x263f31,
    accent: 0xffc263,
    accentSoft: 0xa9dc83,
    prop: 0x89ad63,
    propSoft: 0xd8c778,
    fog: 0x3d5942,
  },
  candy: {
    ground: 0xb7749e,
    groundEdge: 0x6d496f,
    accent: 0xffe78e,
    accentSoft: 0x9ce4d6,
    prop: 0xff9fb5,
    propSoft: 0xd7b1ef,
    fog: 0x8e648c,
  },
  aurora: {
    ground: 0x326b73,
    groundEdge: 0x24385f,
    accent: 0xaaffd2,
    accentSoft: 0xb69cff,
    prop: 0x6de0ca,
    propSoft: 0xe7a9ff,
    fog: 0x253d5b,
  },
  garden: {
    ground: 0x5c8b61,
    groundEdge: 0x29493d,
    accent: 0xffd27d,
    accentSoft: 0xffb4cc,
    prop: 0x7fb96d,
    propSoft: 0xf3b3c5,
    fog: 0x456b59,
  },
};

const traitColors: Record<AdventureTrait, number> = {
  kindness: 0xffb0bc,
  curiosity: 0x75d8ff,
  courage: 0xffc35e,
  creativity: 0xb99cff,
};

function disposeMaterial(material: Material | Material[]) {
  const materials = Array.isArray(material) ? material : [material];
  for (const item of materials) {
    const withMaps = item as Material & {
      map?: Texture | null;
      alphaMap?: Texture | null;
      emissiveMap?: Texture | null;
    };
    withMaps.map?.dispose();
    if (withMaps.alphaMap && withMaps.alphaMap !== withMaps.map)
      withMaps.alphaMap.dispose();
    if (withMaps.emissiveMap && withMaps.emissiveMap !== withMaps.map)
      withMaps.emissiveMap.dispose();
    item.dispose();
  }
}

function disposeObject(root: Object3D) {
  root.traverse((object) => {
    const mesh = object as Mesh;
    mesh.geometry?.dispose();
    if (mesh.material) disposeMaterial(mesh.material);
  });
}

export function AdventureWorld3D(props: AdventureWorld3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const latestProps = useRef(props);
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback'>(
    'loading',
  );
  useEffect(() => {
    latestProps.current = props;
  }, [props]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let failed = false;
    let asyncCleanup: (() => void) | undefined;
    let textureRequest = 0;
    let loadedImage = '';
    let loadingImage = '';
    let reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointer = { x: 0, y: 0 };

    const failToFallback = () => {
      if (disposed) return;
      failed = true;
      setStatus('fallback');
      latestProps.current.onReady?.(false);
    };

    void (async () => {
      try {
        const THREE = await import('./adventure-three-runtime');
        if (disposed) return;

        const canvas = document.createElement('canvas');
        canvas.className = 'adventure-world3d-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        const context = canvas.getContext('webgl2', {
          alpha: true,
          antialias: true,
          depth: true,
          powerPreference: 'high-performance',
          premultipliedAlpha: true,
        });
        if (!context) {
          failToFallback();
          return;
        }

        container.appendChild(canvas);
        const renderer = new THREE.WebGLRenderer({
          canvas,
          context,
          alpha: true,
          antialias: true,
          powerPreference: 'high-performance',
        });
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.12;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.setPixelRatio(
          Math.min(
            window.devicePixelRatio || 1,
            window.innerWidth < 720 ? 1.25 : 1.5,
          ),
        );

        const palette = palettes[latestProps.current.worldId] || palettes.moon;
        const scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(palette.fog, 0.047);
        const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 70);
        camera.position.set(0, 3.15, 10.2);
        camera.lookAt(0, 0.45, 0);

        const ambient = new THREE.HemisphereLight(
          palette.accentSoft,
          palette.groundEdge,
          2.35,
        );
        scene.add(ambient);
        const keyLight = new THREE.DirectionalLight(0xfff2d4, 4.2);
        keyLight.position.set(-4.2, 7, 5.5);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.set(1024, 1024);
        keyLight.shadow.camera.left = -7;
        keyLight.shadow.camera.right = 7;
        keyLight.shadow.camera.top = 6;
        keyLight.shadow.camera.bottom = -4;
        scene.add(keyLight);
        const rimLight = new THREE.PointLight(palette.accent, 13, 15, 2);
        rimLight.position.set(4, 2.2, 1.2);
        scene.add(rimLight);

        const worldRoot = new THREE.Group();
        scene.add(worldRoot);

        const groundMaterial = new THREE.MeshStandardMaterial({
          color: palette.ground,
          roughness: 0.83,
          metalness: 0.03,
        });
        const ground = new THREE.Mesh(
          new THREE.CylinderGeometry(6.8, 7.25, 0.72, 64, 1),
          groundMaterial,
        );
        ground.position.y = -1.14;
        ground.scale.z = 0.64;
        ground.receiveShadow = true;
        worldRoot.add(ground);

        const groundLip = new THREE.Mesh(
          new THREE.TorusGeometry(6.55, 0.075, 10, 64),
          new THREE.MeshStandardMaterial({
            color: palette.accentSoft,
            emissive: palette.accentSoft,
            emissiveIntensity: 0.42,
            roughness: 0.55,
          }),
        );
        groundLip.rotation.x = Math.PI / 2;
        groundLip.position.y = -0.78;
        groundLip.scale.y = 0.64;
        worldRoot.add(groundLip);

        const pathGroup = new THREE.Group();
        const pathStones: Mesh[] = [];
        for (let index = 0; index < 7; index += 1) {
          const material = new THREE.MeshStandardMaterial({
            color: index % 2 === 0 ? palette.accentSoft : 0xf7f0d2,
            emissive: palette.accent,
            emissiveIntensity: 0.06,
            roughness: 0.62,
          });
          const stone = new THREE.Mesh(
            new THREE.CylinderGeometry(0.36, 0.43, 0.12, 16),
            material,
          );
          stone.position.set(
            -2.65 + index * 0.82,
            -0.7,
            0.42 + Math.sin(index) * 0.26,
          );
          stone.scale.z = 0.72;
          stone.receiveShadow = true;
          pathStones.push(stone);
          pathGroup.add(stone);
        }
        worldRoot.add(pathGroup);

        const scenery = new THREE.Group();
        const sceneryFloaters: Group[] = [];
        const createSceneryProp = (index: number, x: number, z: number) => {
          const group = new THREE.Group();
          const scale = 0.68 + (index % 4) * 0.13;
          if (latestProps.current.worldId === 'ocean') {
            const stemMaterial = new THREE.MeshStandardMaterial({
              color: index % 2 ? palette.prop : palette.propSoft,
              roughness: 0.7,
            });
            for (let branch = 0; branch < 3; branch += 1) {
              const coral = new THREE.Mesh(
                new THREE.CapsuleGeometry(0.12, 0.72 + branch * 0.13, 5, 10),
                stemMaterial,
              );
              coral.position.set((branch - 1) * 0.24, 0.25 + branch * 0.08, 0);
              coral.rotation.z = (branch - 1) * 0.3;
              coral.castShadow = true;
              group.add(coral);
            }
          } else if (latestProps.current.worldId === 'cloud') {
            const cloudMaterial = new THREE.MeshStandardMaterial({
              color: 0xfffdf2,
              roughness: 0.92,
            });
            for (let puff = 0; puff < 4; puff += 1) {
              const cloud = new THREE.Mesh(
                new THREE.SphereGeometry(0.42 + (puff % 2) * 0.16, 18, 12),
                cloudMaterial,
              );
              cloud.position.set(
                (puff - 1.5) * 0.35,
                0.26 + (puff % 2) * 0.21,
                0,
              );
              cloud.castShadow = true;
              group.add(cloud);
            }
          } else if (
            latestProps.current.worldId === 'space' ||
            latestProps.current.worldId === 'aurora'
          ) {
            for (let shard = 0; shard < 3; shard += 1) {
              const crystal = new THREE.Mesh(
                new THREE.OctahedronGeometry(0.34 + shard * 0.08, 0),
                new THREE.MeshStandardMaterial({
                  color: shard % 2 ? palette.prop : palette.propSoft,
                  emissive: palette.accentSoft,
                  emissiveIntensity: 0.34,
                  roughness: 0.28,
                  metalness: 0.12,
                }),
              );
              crystal.position.set((shard - 1) * 0.38, 0.26 + shard * 0.18, 0);
              crystal.scale.y = 1.4 + shard * 0.35;
              crystal.castShadow = true;
              group.add(crystal);
            }
          } else if (latestProps.current.worldId === 'candy') {
            const stick = new THREE.Mesh(
              new THREE.CylinderGeometry(0.06, 0.07, 1.25, 10),
              new THREE.MeshStandardMaterial({
                color: 0xfff3dc,
                roughness: 0.7,
              }),
            );
            stick.position.y = 0.07;
            const sweet = new THREE.Mesh(
              new THREE.TorusKnotGeometry(0.31, 0.12, 48, 9, 2, 3),
              new THREE.MeshStandardMaterial({
                color: index % 2 ? palette.prop : palette.propSoft,
                roughness: 0.38,
              }),
            );
            sweet.position.y = 0.82;
            sweet.castShadow = true;
            group.add(stick, sweet);
          } else {
            const trunk = new THREE.Mesh(
              new THREE.CylinderGeometry(0.12, 0.17, 0.85, 10),
              new THREE.MeshStandardMaterial({
                color: 0x7f6047,
                roughness: 0.92,
              }),
            );
            trunk.position.y = -0.28;
            const crown = new THREE.Mesh(
              new THREE.DodecahedronGeometry(0.58, 1),
              new THREE.MeshStandardMaterial({
                color: index % 2 ? palette.prop : palette.propSoft,
                roughness: 0.86,
              }),
            );
            crown.position.y = 0.35;
            crown.scale.set(1, 1.18, 0.9);
            crown.castShadow = true;
            group.add(trunk, crown);
          }
          group.position.set(x, -0.35, z);
          group.scale.setScalar(scale);
          group.rotation.y = index * 0.73;
          sceneryFloaters.push(group);
          scenery.add(group);
        };

        [
          [-4.6, -1.6],
          [-3.8, -2.3],
          [-2.6, -2.75],
          [2.2, -2.7],
          [3.6, -2.15],
          [4.75, -1.25],
          [-5.05, 0.35],
          [5.0, 0.2],
        ].forEach(([x, z], index) => createSceneryProp(index, x, z));
        worldRoot.add(scenery);

        const portal = new THREE.Group();
        const portalMaterial = new THREE.MeshStandardMaterial({
          color: palette.accent,
          emissive: palette.accent,
          emissiveIntensity: 1.7,
          roughness: 0.2,
          metalness: 0.12,
        });
        const portalRing = new THREE.Mesh(
          new THREE.TorusGeometry(1.12, 0.105, 18, 72),
          portalMaterial,
        );
        const portalCore = new THREE.Mesh(
          new THREE.CircleGeometry(1.01, 64),
          new THREE.MeshBasicMaterial({
            color: palette.accentSoft,
            transparent: true,
            opacity: 0.13,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        portalCore.position.z = -0.025;
        portal.add(portalCore, portalRing);
        portal.position.set(3.6, 0.55, -1.1);
        portal.rotation.y = -0.28;
        worldRoot.add(portal);

        const targetGroup = new THREE.Group();
        const targetNodes: Group[] = [];
        const targetPositions = [
          [-1.25, -0.06],
          [-0.25, -0.42],
          [0.82, 0.06],
          [1.76, -0.36],
          [2.62, -0.02],
        ];
        targetPositions.forEach(([x, z], index) => {
          const target = new THREE.Group();
          const gemMaterial = new THREE.MeshStandardMaterial({
            color: palette.accent,
            emissive: palette.accent,
            emissiveIntensity: 0.72,
            roughness: 0.2,
            metalness: 0.08,
          });
          const gem = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.15 + (index % 2) * 0.035, 0),
            gemMaterial,
          );
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.26, 0.018, 8, 32),
            new THREE.MeshBasicMaterial({
              color: palette.accentSoft,
              transparent: true,
              opacity: 0.7,
            }),
          );
          ring.rotation.x = Math.PI / 2;
          target.add(gem, ring);
          target.position.set(x, -0.31, z);
          target.userData.gemMaterial = gemMaterial;
          targetNodes.push(target);
          targetGroup.add(target);
        });
        worldRoot.add(targetGroup);

        const memoryGroups = {} as Record<AdventureTrait, Group>;
        (Object.keys(traitColors) as AdventureTrait[]).forEach(
          (trait, traitIndex) => {
            const group = new THREE.Group();
            for (let index = 0; index < 5; index += 1) {
              const shape =
                trait === 'kindness'
                  ? new THREE.SphereGeometry(0.1, 12, 8)
                  : trait === 'curiosity'
                    ? new THREE.TorusGeometry(0.1, 0.025, 6, 18)
                    : trait === 'courage'
                      ? new THREE.TetrahedronGeometry(0.13, 0)
                      : new THREE.OctahedronGeometry(0.11, 0);
              const mark = new THREE.Mesh(
                shape,
                new THREE.MeshStandardMaterial({
                  color: traitColors[trait],
                  emissive: traitColors[trait],
                  emissiveIntensity: 0.55,
                  roughness: 0.38,
                }),
              );
              mark.position.set(
                -3.1 + index * 1.35,
                -0.52 + (index % 2) * 0.12,
                1.55 + traitIndex * 0.13,
              );
              group.add(mark);
            }
            group.visible = false;
            memoryGroups[trait] = group;
            worldRoot.add(group);
          },
        );

        const particleCount =
          reducedMotion || window.innerWidth < 720 ? 54 : 96;
        const particlePositions = new Float32Array(particleCount * 3);
        for (let index = 0; index < particleCount; index += 1) {
          particlePositions[index * 3] = (Math.random() - 0.5) * 12;
          particlePositions[index * 3 + 1] = Math.random() * 5 - 0.5;
          particlePositions[index * 3 + 2] = (Math.random() - 0.5) * 6 - 0.8;
        }
        const particleGeometry = new THREE.BufferGeometry();
        particleGeometry.setAttribute(
          'position',
          new THREE.BufferAttribute(particlePositions, 3),
        );
        const particleMaterial = new THREE.PointsMaterial({
          color: palette.accent,
          size: 0.072,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          sizeAttenuation: true,
        });
        const particles = new THREE.Points(particleGeometry, particleMaterial);
        worldRoot.add(particles);

        const characterRoot = new THREE.Group();
        characterRoot.position.set(-2.55, -0.72, 0.28);
        worldRoot.add(characterRoot);
        const characterVisual = new THREE.Group();
        characterRoot.add(characterVisual);
        const characterShadow = new THREE.Mesh(
          new THREE.CircleGeometry(0.82, 40),
          new THREE.MeshBasicMaterial({
            color: 0x07151a,
            transparent: true,
            opacity: 0.33,
            depthWrite: false,
          }),
        );
        characterShadow.rotation.x = -Math.PI / 2;
        characterShadow.scale.y = 0.38;
        characterShadow.position.y = -0.03;
        characterShadow.position.z = 0.04;
        characterRoot.add(characterShadow);

        const clearCharacterVisual = () => {
          const children = [...characterVisual.children];
          for (const child of children) {
            characterVisual.remove(child);
            disposeObject(child);
          }
        };

        const installCharacterTexture = (texture: Texture) => {
          clearCharacterVisual();
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = Math.min(
            renderer.capabilities.getMaxAnisotropy(),
            4,
          );
          texture.minFilter = THREE.LinearMipmapLinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.needsUpdate = true;
          const source = texture.image as {
            naturalWidth?: number;
            naturalHeight?: number;
            width?: number;
            height?: number;
          };
          const sourceWidth = source.naturalWidth || source.width || 1;
          const sourceHeight = source.naturalHeight || source.height || 1;
          const aspect = Math.max(
            0.48,
            Math.min(1.35, sourceWidth / sourceHeight),
          );
          let height = 3.25;
          let width = height * aspect;
          if (width > 3.05) {
            width = 3.05;
            height = width / aspect;
          }
          const geometry = new THREE.PlaneGeometry(width, height, 1, 1);
          const halo = new THREE.Mesh(
            geometry.clone(),
            new THREE.MeshBasicMaterial({
              map: texture,
              color: palette.accentSoft,
              transparent: true,
              opacity: 0.18,
              alphaTest: 0.025,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
              side: THREE.DoubleSide,
            }),
          );
          halo.position.set(0, height / 2 + 0.04, -0.08);
          halo.scale.setScalar(1.035);
          const characterMaterial = new THREE.MeshStandardMaterial({
            map: texture,
            transparent: true,
            alphaTest: 0.04,
            depthWrite: true,
            roughness: 0.88,
            metalness: 0,
            side: THREE.DoubleSide,
          });
          const front = new THREE.Mesh(geometry, characterMaterial);
          front.position.set(0, height / 2 + 0.04, 0);
          front.castShadow = true;
          front.userData.characterMaterial = characterMaterial;
          characterVisual.add(halo, front);
        };

        const loadCharacter = async (source: string) => {
          const request = ++textureRequest;
          loadingImage = source;
          try {
            const texture = await new THREE.TextureLoader().loadAsync(source);
            if (disposed || request !== textureRequest) {
              texture.dispose();
              return;
            }
            installCharacterTexture(texture);
            loadedImage = source;
          } catch {
            if (source !== DEFAULT_CHARACTER_ASSET) {
              loadingImage = '';
              void loadCharacter(DEFAULT_CHARACTER_ASSET);
              return;
            }
            failToFallback();
          }
        };

        const clock = new THREE.Clock();
        let lastScene = latestProps.current.sceneIndex;
        let lastPhase = latestProps.current.phase;
        let sceneChangedAt = 0;
        let phaseChangedAt = 0;
        let hidden = document.hidden;

        const resize = () => {
          const bounds = container.getBoundingClientRect();
          if (bounds.width < 2 || bounds.height < 2) return;
          renderer.setSize(bounds.width, bounds.height, false);
          camera.aspect = bounds.width / bounds.height;
          camera.updateProjectionMatrix();
        };
        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(container);
        resize();

        const updateMotion = (event: MediaQueryListEvent) => {
          reducedMotion = event.matches;
        };
        motionQuery.addEventListener('change', updateMotion);

        const pointerHost = container.parentElement || container;
        const updatePointer = (event: PointerEvent) => {
          if (reducedMotion) return;
          const bounds = container.getBoundingClientRect();
          if (!bounds.width || !bounds.height) return;
          pointer.x = Math.max(
            -1,
            Math.min(
              1,
              ((event.clientX - bounds.left) / bounds.width - 0.5) * 2,
            ),
          );
          pointer.y = Math.max(
            -1,
            Math.min(
              1,
              ((event.clientY - bounds.top) / bounds.height - 0.5) * 2,
            ),
          );
        };
        const resetPointer = () => {
          pointer.x = 0;
          pointer.y = 0;
        };
        pointerHost.addEventListener('pointermove', updatePointer, {
          passive: true,
        });
        pointerHost.addEventListener('pointerleave', resetPointer);

        const updateVisibility = () => {
          hidden = document.hidden;
        };
        document.addEventListener('visibilitychange', updateVisibility);

        const renderFrame = () => {
          if (disposed || hidden) return;
          const delta = Math.min(clock.getDelta(), 0.05);
          const elapsed = clock.elapsedTime;
          const current = latestProps.current;
          const desiredImage = current.image || DEFAULT_CHARACTER_ASSET;
          if (desiredImage !== loadedImage && desiredImage !== loadingImage)
            void loadCharacter(desiredImage);

          if (current.sceneIndex !== lastScene) {
            lastScene = current.sceneIndex;
            sceneChangedAt = elapsed;
          }
          if (current.phase !== lastPhase) {
            lastPhase = current.phase;
            phaseChangedAt = elapsed;
          }

          const ease = reducedMotion ? 1 : 1 - Math.exp(-delta * 4.8);
          const progress = Math.max(0, Math.min(1, current.questProgress));
          const phaseTime = elapsed - phaseChangedAt;
          const lastQuestTarget = current.questHits.at(-1);
          const questWaypoint =
            lastQuestTarget === undefined
              ? null
              : targetPositions[lastQuestTarget] || null;
          const targetX =
            current.phase === 'exiting'
              ? 3.3
              : questWaypoint
                ? questWaypoint[0]
                : -2.55 +
                  progress * 4.35 +
                  (current.phase === 'resolved' ? 0.18 : 0);
          const targetZ = questWaypoint
            ? questWaypoint[1] + 0.26
            : 0.32 - Math.sin(progress * Math.PI) * 0.5;
          characterRoot.position.x +=
            (targetX - characterRoot.position.x) * ease;
          characterRoot.position.z +=
            (targetZ - characterRoot.position.z) * ease;

          const walking = Math.abs(targetX - characterRoot.position.x) > 0.035;
          const walkBob =
            walking && !reducedMotion
              ? Math.abs(Math.sin(elapsed * 10.5)) * 0.105
              : 0;
          const idleBob = !reducedMotion ? Math.sin(elapsed * 2.15) * 0.045 : 0;
          let actionLift = 0;
          let actionLean = 0;
          let actionScaleX = 1;
          let actionScaleY = 1;
          if (current.phase === 'acting' && !reducedMotion) {
            const action = Math.min(1, phaseTime / 1.7);
            const arc = Math.sin(action * Math.PI);
            if (current.trait === 'courage') actionLift = arc * 0.78;
            else if (current.trait === 'curiosity') {
              actionLift = arc * 0.28;
              actionLean = -arc * 0.085;
            } else if (current.trait === 'creativity') {
              actionLift = arc * 0.4;
              actionLean = Math.sin(action * Math.PI * 4) * 0.12 * arc;
            } else {
              actionLift = arc * 0.18;
              actionLean = arc * 0.06;
            }
            actionScaleX = 1 + Math.sin(action * Math.PI * 2) * 0.055;
            actionScaleY = 1 - Math.sin(action * Math.PI * 2) * 0.045;
          }
          if (
            current.gesture === 2 &&
            current.phase === 'idle' &&
            !reducedMotion
          )
            actionLift += Math.max(0, Math.sin(elapsed * 3.4)) * 0.08;
          if (
            current.gesture === 1 &&
            current.phase === 'idle' &&
            !reducedMotion
          )
            actionLean += Math.sin(elapsed * 1.7) * 0.025;
          if (current.petted && !reducedMotion) {
            const pet = Math.sin(Math.min(1, phaseTime / 0.82) * Math.PI);
            actionScaleX += pet * 0.07;
            actionScaleY -= pet * 0.035;
          }

          characterVisual.position.y = walkBob + idleBob + actionLift;
          characterVisual.rotation.z = actionLean;
          characterVisual.scale.set(actionScaleX, actionScaleY, 1);
          characterVisual.rotation.y +=
            (pointer.x * 0.11 - characterVisual.rotation.y) *
            (reducedMotion ? 1 : 0.08);
          characterShadow.material.opacity = Math.max(
            0.12,
            0.34 - (actionLift + walkBob) * 0.18,
          );
          characterShadow.scale.x = 1 - Math.min(0.28, actionLift * 0.18);

          targetNodes.forEach((target, index) => {
            const completed = current.questHits.length
              ? current.questHits.includes(index)
              : index <
                Math.max(0, Math.min(targetNodes.length, current.questPulse));
            const pulse = reducedMotion
              ? 1
              : 1 + Math.sin(elapsed * 3.1 + index) * 0.13;
            const desiredScale = completed
              ? 0.38
              : current.phase === 'playing'
                ? pulse
                : 0.16;
            target.scale.lerp(
              new THREE.Vector3(desiredScale, desiredScale, desiredScale),
              reducedMotion ? 1 : 0.12,
            );
            target.position.y =
              -0.31 +
              (reducedMotion ? 0 : Math.sin(elapsed * 2.4 + index) * 0.08);
            const material = target.userData
              .gemMaterial as MeshStandardMaterial;
            material.emissiveIntensity = completed ? 2.2 : 0.72 + pulse * 0.18;
          });

          pathStones.forEach((stone, index) => {
            const awakened =
              index / Math.max(1, pathStones.length - 1) <= progress + 0.02;
            const material = stone.material as MeshStandardMaterial;
            material.emissiveIntensity +=
              ((awakened ? 0.62 : 0.06) - material.emissiveIntensity) * 0.1;
            stone.position.y =
              -0.7 +
              (awakened && !reducedMotion
                ? Math.sin(elapsed * 2.8 + index) * 0.025
                : 0);
          });

          (Object.keys(memoryGroups) as AdventureTrait[]).forEach((trait) => {
            memoryGroups[trait].visible = current.memoryTraits.includes(trait);
            if (memoryGroups[trait].visible && !reducedMotion)
              memoryGroups[trait].rotation.y = Math.sin(elapsed * 0.45) * 0.035;
          });

          const sceneAge = elapsed - sceneChangedAt;
          const sceneBurst = reducedMotion
            ? 0
            : Math.exp(-sceneAge * 2.8) * 0.08;
          worldRoot.rotation.y +=
            (current.sceneIndex * 0.055 +
              pointer.x * 0.035 -
              worldRoot.rotation.y) *
            0.035;
          worldRoot.scale.setScalar(1 + sceneBurst);
          sceneryFloaters.forEach((prop, index) => {
            if (!reducedMotion)
              prop.position.y =
                -0.35 + Math.sin(elapsed * 0.8 + index * 0.7) * 0.035;
          });

          portalRing.rotation.z +=
            delta * (current.phase === 'exiting' ? 1.8 : 0.32);
          const portalPulse = reducedMotion
            ? 1
            : 1 + Math.sin(elapsed * 2.2) * 0.045;
          portal.scale.setScalar(portalPulse + current.sceneIndex * 0.018);
          portalMaterial.emissiveIntensity =
            1.45 +
            (current.phase === 'resolved' || current.phase === 'exiting'
              ? 1.1
              : 0) +
            (reducedMotion ? 0 : Math.sin(elapsed * 2.2) * 0.22);

          if (!reducedMotion) {
            const positions = particleGeometry.getAttribute(
              'position',
            ) as BufferAttribute;
            for (let index = 0; index < particleCount; index += 1) {
              const nextY =
                positions.getY(index) + delta * (0.12 + (index % 5) * 0.015);
              positions.setY(index, nextY > 4.6 ? -0.6 : nextY);
              positions.setX(
                index,
                positions.getX(index) +
                  Math.sin(elapsed * 0.5 + index) * delta * 0.012,
              );
            }
            positions.needsUpdate = true;
            particles.rotation.y += delta * 0.018;
          }
          const liveColor = current.trait
            ? traitColors[current.trait]
            : palette.accent;
          particleMaterial.color.lerp(new THREE.Color(liveColor), 0.035);
          rimLight.color.lerp(new THREE.Color(liveColor), 0.04);

          const cameraTargetX =
            characterRoot.position.x * 0.12 + pointer.x * 0.38;
          const cameraTargetY =
            3.15 - pointer.y * 0.18 + (current.phase === 'acting' ? 0.12 : 0);
          camera.position.x += (cameraTargetX - camera.position.x) * 0.035;
          camera.position.y += (cameraTargetY - camera.position.y) * 0.04;
          camera.lookAt(characterRoot.position.x * 0.09, 0.45, -0.15);

          renderer.render(scene, camera);
        };

        const onContextLost = (event: Event) => {
          event.preventDefault();
          renderer.setAnimationLoop(null);
          failToFallback();
        };
        const onContextRestored = () => {
          if (disposed) return;
          setStatus('ready');
          latestProps.current.onReady?.(true);
          renderer.setAnimationLoop(renderFrame);
        };
        canvas.addEventListener('webglcontextlost', onContextLost);
        canvas.addEventListener('webglcontextrestored', onContextRestored);

        let cleaned = false;
        const cleanup = () => {
          if (cleaned) return;
          cleaned = true;
          renderer.setAnimationLoop(null);
          resizeObserver.disconnect();
          motionQuery.removeEventListener('change', updateMotion);
          pointerHost.removeEventListener('pointermove', updatePointer);
          pointerHost.removeEventListener('pointerleave', resetPointer);
          document.removeEventListener('visibilitychange', updateVisibility);
          canvas.removeEventListener('webglcontextlost', onContextLost);
          canvas.removeEventListener('webglcontextrestored', onContextRestored);
          disposeObject(scene);
          renderer.renderLists.dispose();
          renderer.dispose();
          canvas.remove();
        };
        asyncCleanup = cleanup;

        await loadCharacter(
          latestProps.current.image || DEFAULT_CHARACTER_ASSET,
        );
        if (disposed || failed) {
          cleanup();
          return;
        }
        renderer.setAnimationLoop(renderFrame);
        setStatus('ready');
        latestProps.current.onReady?.(true);
      } catch {
        failToFallback();
        asyncCleanup?.();
      }
    })();

    return () => {
      disposed = true;
      textureRequest += 1;
      latestProps.current.onReady?.(false);
      asyncCleanup?.();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`adventure-world3d is-${status}`}
      aria-hidden="true"
    >
      {status === 'loading' && (
        <span className="adventure-world3d-loading">3D 세상을 여는 중…</span>
      )}
    </div>
  );
}
