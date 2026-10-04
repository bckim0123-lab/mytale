'use client';

import { useEffect, useRef, useState } from 'react';
import { COMPANION_SAVE_KEY } from './companion-save';
import { captureDrawingGeneration, readDrawingAsset } from './drawing-assets';

const EMPTY_PREVIEWS: Readonly<Record<string, string>> = Object.freeze({});

/** Only the current shelf page retains preview PNGs, never the whole library. */
export function useDrawingPreviews(
  ids: readonly (string | undefined)[],
): Readonly<Record<string, string>> {
  const unique = new Set<string>();
  for (const id of ids) {
    if (typeof id === 'string' && /^[a-f0-9]{64}$/.test(id)) unique.add(id);
    if (unique.size === 6) break;
  }
  const key = [...unique].join('|');
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    key: string;
    images: Readonly<Record<string, string>>;
  } | null>(null);
  const request = useRef(0);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (!active) return;
      // Invalidate immediately, even before React runs the next read effect.
      request.current += 1;
      setState(null);
      setRevision((value) => value + 1);
    };
    const storage = (event: StorageEvent) => {
      if (event.key === COMPANION_SAVE_KEY || event.key === null) refresh();
    };
    window.addEventListener('drawing-friend-artworks-changed', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', storage);
    return () => {
      active = false;
      request.current += 1;
      window.removeEventListener('drawing-friend-artworks-changed', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', storage);
    };
  }, []);

  useEffect(() => {
    let canceled = false;
    const operation = ++request.current;
    const current = () => !canceled && request.current === operation;
    // Drop the previous page's PNG references, not merely its rendered cards.
    queueMicrotask(() => {
      if (current()) setState(null);
    });
    if (key) {
      void (async () => {
        try {
          const generation = captureDrawingGeneration();
          const entries = await Promise.all(
            key.split('|').map(async (id) => {
              try {
                const asset = await readDrawingAsset(id);
                return asset?.id === id ? ([id, asset.png] as const) : null;
              } catch {
                // One missing/unreadable friend must not hide the other covers.
                return null;
              }
            }),
          );
          if (!current()) return;
          if (captureDrawingGeneration() !== generation) {
            setState(null);
            return;
          }
          setState({
            key,
            images: Object.fromEntries(
              entries.filter((entry) => entry !== null),
            ),
          });
        } catch {
          if (current()) setState(null);
        }
      })();
    }
    return () => {
      canceled = true;
    };
  }, [key, revision]);

  // Effects run after rendering: never expose the last page during that gap.
  return state?.key === key ? state.images : EMPTY_PREVIEWS;
}
