'use client';

import { useEffect, useState } from 'react';
import type { CompanionAppearance } from './companion-save';

export type CompanionPortraitState = {
  src: string | null;
  unavailable: boolean;
};

/** One short-lived renderer, shared by every page. Its image never enters storage. */
export function useCompanionPortrait(
  appearance: CompanionAppearance,
): CompanionPortraitState {
  const signature = JSON.stringify(appearance);
  const [portrait, setPortrait] = useState<CompanionPortraitState>({
    src: null,
    unavailable: false,
  });

  useEffect(() => {
    let canceled = false;
    let dispose: (() => void) | undefined;
    queueMicrotask(() => {
      if (!canceled) setPortrait({ src: null, unavailable: false });
    });

    void (async () => {
      try {
        const [THREE, { createCreature }, { RoomEnvironment }] =
          await Promise.all([
            import('three'),
            import('./creature-rig'),
            import('three/examples/jsm/environments/RoomEnvironment.js'),
          ]);
        if (canceled) return;
        const renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          preserveDrawingBuffer: true,
        });
        const cleanup: (() => void)[] = [
          () => {
            renderer.dispose();
            renderer.forceContextLoss();
          },
        ];
        dispose = () => {
          while (cleanup.length) cleanup.pop()?.();
        };
        renderer.setSize(720, 900, false);
        renderer.setPixelRatio(1);
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.03;

        const scene = new THREE.Scene();
        const pmrem = new THREE.PMREMGenerator(renderer);
        cleanup.push(() => pmrem.dispose());
        const room = new RoomEnvironment();
        cleanup.push(() => room.dispose());
        const environment = pmrem.fromScene(room, 0.04);
        cleanup.push(() => environment.dispose());
        scene.environment = environment.texture;
        scene.environmentIntensity = 0.4;
        scene.add(new THREE.HemisphereLight('#fffaf1', '#b99594', 1.55));
        const key = new THREE.DirectionalLight('#fff5df', 2.5);
        key.position.set(-3, 6, 5);
        scene.add(key);
        const fill = new THREE.DirectionalLight('#ffe0ee', 1.05);
        fill.position.set(4, 3, 1);
        scene.add(fill);
        const edge = new THREE.DirectionalLight('#e2ffef', 1.15);
        edge.position.set(-1, 4, -3);
        scene.add(edge);

        const rig = createCreature(
          JSON.parse(signature) as CompanionAppearance,
        );
        cleanup.push(() => rig.dispose());
        rig.root.rotation.y = -0.12;
        // Advance into a warm, open-eyed greeting, not the first blink frame.
        for (let i = 0; i < 42; i++)
          rig.update(1 / 60, i / 60, {
            moving: false,
            action: 'wave',
            lookX: 0.12,
          });
        scene.add(rig.root);
        const camera = new THREE.OrthographicCamera(
          -1.48,
          1.48,
          1.85,
          -1.85,
          0.1,
          30,
        );
        camera.position.set(0, 1.55, 7);
        camera.lookAt(0, 1.43, 0);
        // Render in the same task as toDataURL, before the drawing buffer can be cleared.
        renderer.render(scene, camera);
        const src = renderer.domElement.toDataURL('image/png');
        if (!src.startsWith('data:image/png') || src.length < 500)
          throw new Error('Portrait unavailable');
        if (!canceled) setPortrait({ src, unavailable: false });
      } catch {
        if (!canceled) setPortrait({ src: null, unavailable: true });
      } finally {
        dispose?.();
      }
    })();
    return () => {
      canceled = true;
      dispose?.();
    };
  }, [signature]);

  return portrait;
}

export function CompanionPortrait({
  portrait,
  name,
  className = '',
}: {
  portrait: CompanionPortraitState;
  name: string;
  className?: string;
}) {
  return portrait.src ? (
    // A transient canvas data URL cannot use a server-side image optimizer.
    // eslint-disable-next-line next/no-img-element
    <img
      className={`csb-hero ${className}`}
      src={portrait.src}
      alt={`입체 친구 ${name}`}
      draggable={false}
    />
  ) : (
    <output className={`csb-portrait-fallback ${className}`}>
      <span aria-hidden="true">{name.slice(0, 1)}</span>
      <strong>{name}</strong>
      <small>
        {portrait.unavailable
          ? '이 기기에서는 친구의 입체 모습을 표시할 수 없어요. 이야기는 그대로 읽을 수 있어요.'
          : '친구가 책 속으로 오는 중…'}
      </small>
    </output>
  );
}

export default CompanionPortrait;
