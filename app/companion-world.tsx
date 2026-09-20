'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import type { CreatureAppearance } from './creature-types';
import type { ForestState } from './forest-story';
import type {
  mountCompanionWorld,
  WorldAction,
} from './companion-world-runtime';

type World = ReturnType<typeof mountCompanionWorld>;
export type CompanionWorldHandle = {
  walkTo: (id: string) => void;
  react: (action: WorldAction) => void;
  turn: (direction: number) => void;
};
type Props = {
  mode: 'home' | 'forest';
  appearance: CreatureAppearance;
  forest: ForestState;
  onInteract: (id: string) => void;
  onPet: () => void;
  onStatus: (text: string) => void;
  onUnavailable?: () => void;
  onReady?: () => void;
};

const movementKeys = new Set([
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'w',
  'a',
  's',
  'd',
]);

export const CompanionWorld = forwardRef<CompanionWorldHandle, Props>(
  function CompanionWorld(props, ref) {
    const host = useRef<HTMLDivElement>(null);
    const api = useRef<World | null>(null);
    const latest = useRef(props);
    useEffect(() => {
      latest.current = props;
    }, [props]);
    const fail = useRef<() => void>(() => {});
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
      'loading',
    );
    const [attempt, setAttempt] = useState(0);
    const stick = useRef<HTMLButtonElement>(null);
    const pointerId = useRef<number | null>(null);
    const heldKeys = useRef(new Set<string>());
    const [stickOffset, setStickOffset] = useState({ x: 0, y: 0 });
    const controlHelpId = useId();

    const withWorld = useCallback((action: (world: World) => void) => {
      if (!api.current) return;
      try {
        action(api.current);
      } catch {
        fail.current();
      }
    }, []);

    const stop = useCallback(() => {
      heldKeys.current.clear();
      const activePointer = pointerId.current;
      pointerId.current = null;
      if (
        activePointer !== null &&
        stick.current?.hasPointerCapture(activePointer)
      ) {
        stick.current.releasePointerCapture(activePointer);
      }
      withWorld((world) => world.steer(0, 0));
      setStickOffset({ x: 0, y: 0 });
    }, [withWorld]);

    const steerKeys = useCallback(() => {
      const keys = heldKeys.current;
      const x =
        Number(keys.has('arrowright') || keys.has('d')) -
        Number(keys.has('arrowleft') || keys.has('a'));
      const y =
        Number(keys.has('arrowdown') || keys.has('s')) -
        Number(keys.has('arrowup') || keys.has('w'));
      const length = Math.max(1, Math.hypot(x, y));
      withWorld((world) => world.steer(x / length, y / length));
      setStickOffset({ x: (x / length) * 29, y: (y / length) * 29 });
    }, [withWorld]);

    useImperativeHandle(
      ref,
      () => ({
        walkTo: (id) => withWorld((world) => world.walkTo(id)),
        react: (action) => withWorld((world) => world.react(action)),
        turn: (direction) => withWorld((world) => world.turn(direction)),
      }),
      [withWorld],
    );

    useEffect(() => {
      let cancelled = false;
      let failed = false;
      let instance: World | null = null;
      const container = host.current;
      queueMicrotask(() => {
        if (!cancelled && !failed) {
          setStatus('loading');
          stop();
        }
      });

      const release = () => {
        const previous = instance;
        instance = null;
        if (api.current === previous) api.current = null;
        // Null the live handle before dispose: forceContextLoss can dispatch a
        // context-loss event and must never re-enter the same disposer.
        try {
          previous?.dispose();
        } catch {
          /* A lost GPU may already be unavailable. */
        }
        container?.replaceChildren();
      };
      const unavailable = () => {
        if (cancelled || failed) return;
        failed = true;
        release();
        stop();
        setStatus('error');
        latest.current.onUnavailable?.();
      };
      fail.current = unavailable;
      const contextLost = (event: Event) => {
        event.preventDefault();
        unavailable();
      };
      container?.addEventListener('webglcontextlost', contextLost, true);

      void import('./companion-world-runtime')
        .then(({ mountCompanionWorld }) => {
          if (cancelled || failed || !container) return;
          try {
            instance = mountCompanionWorld(container, {
              mode: latest.current.mode,
              appearance: latest.current.appearance,
              forest: latest.current.forest,
              onInteract: (id) => latest.current.onInteract(id),
              onPet: () => latest.current.onPet(),
              onStatus: (text) => latest.current.onStatus(text),
            });
          } catch {
            unavailable();
            return;
          }
          // The canvas can lose its context synchronously while mounting.
          if (cancelled || failed) {
            release();
            return;
          }
          api.current = instance;
          setStatus('ready');
          latest.current.onReady?.();
        })
        .catch(unavailable);

      return () => {
        cancelled = true;
        if (fail.current === unavailable) fail.current = () => {};
        container?.removeEventListener('webglcontextlost', contextLost, true);
        release();
      };
    }, [props.mode, attempt, stop]);

    useEffect(() => {
      withWorld((world) => world.setAppearance(props.appearance));
    }, [props.appearance, withWorld]);
    useEffect(() => {
      withWorld((world) => world.setForest(props.forest));
    }, [props.forest, withWorld]);

    useEffect(() => {
      const visibilityChanged = () => {
        if (document.hidden) stop();
      };
      const keyReleased = (event: globalThis.KeyboardEvent) => {
        if (heldKeys.current.delete(event.key.toLowerCase())) steerKeys();
      };
      window.addEventListener('blur', stop);
      window.addEventListener('keyup', keyReleased);
      document.addEventListener('visibilitychange', visibilityChanged);
      return () => {
        window.removeEventListener('blur', stop);
        window.removeEventListener('keyup', keyReleased);
        document.removeEventListener('visibilitychange', visibilityChanged);
      };
    }, [stop, steerKeys]);

    function steer(event: PointerEvent<HTMLButtonElement>) {
      if (
        pointerId.current !== event.pointerId ||
        !event.currentTarget.hasPointerCapture(event.pointerId)
      )
        return;
      const bounds = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - bounds.left - bounds.width / 2;
      const y = event.clientY - bounds.top - bounds.height / 2;
      const length = Math.max(29, Math.hypot(x, y));
      setStickOffset({ x: (x / length) * 29, y: (y / length) * 29 });
      withWorld((world) => world.steer(x / length, y / length));
    }

    function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
      const key = event.key.toLowerCase();
      if (key === 'escape') {
        event.preventDefault();
        stop();
        return;
      }
      if (
        !movementKeys.has(key) ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      event.preventDefault();
      heldKeys.current.add(key);
      steerKeys();
    }

    return (
      <div
        className={`cw-world cw-world-${props.mode}`}
        aria-busy={status === 'loading'}
      >
        <div ref={host} className="cw-webgl" />
        {status === 'loading' && (
          <output className="cw-world-loading">
            <span aria-hidden="true">✦</span>친구가 신발을 신고 있어요…
          </output>
        )}
        {status === 'error' && (
          <div className="cw-world-loading" role="alert">
            <strong>이 기기에서 3D 화면을 열지 못했어요.</strong>
            <p>다시 열거나, 아래의 이야기 모드로 모험을 이어갈 수 있어요.</p>
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              3D 화면 다시 열기
            </button>
          </div>
        )}
        {props.mode === 'forest' && status === 'ready' && (
          <>
            <p className="sr-only" id={controlHelpId}>
              조작판을 끌거나, 방향키 또는 W A S D 키로 걸어가요. 놓으면 멈추고,
              Esc 키로도 멈출 수 있어요.
            </p>
            <button
              ref={stick}
              className="cw-stick"
              type="button"
              aria-label="방향 조작판"
              aria-describedby={controlHelpId}
              aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight w a s d Escape"
              style={{ touchAction: 'none' }}
              onPointerDown={(event) => {
                if (
                  !event.isPrimary ||
                  event.button !== 0 ||
                  pointerId.current !== null
                )
                  return;
                heldKeys.current.clear();
                pointerId.current = event.pointerId;
                event.currentTarget.setPointerCapture(event.pointerId);
                event.currentTarget.focus({ preventScroll: true });
                steer(event);
              }}
              onPointerMove={steer}
              onPointerUp={(event) => {
                if (pointerId.current === event.pointerId) stop();
              }}
              onPointerCancel={stop}
              onLostPointerCapture={stop}
              onKeyDown={keyDown}
              onBlur={stop}
            >
              <span
                aria-hidden="true"
                style={{
                  transform: `translate(${stickOffset.x}px,${stickOffset.y}px)`,
                }}
              >
                ✦
              </span>
            </button>
          </>
        )}
      </div>
    );
  },
);
