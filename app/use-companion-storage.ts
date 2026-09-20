'use client';

import { useEffect, useRef, useState } from 'react';
import { COMPANION_SAVE_KEY } from './companion-save';
import { CompanionStorageSession } from './companion-storage-session';

export function useCompanionStorage(initialName?: string) {
  const [session] = useState(
    () => new CompanionStorageSession({ initialName }),
  );
  const [state, setState] = useState(session.getState);
  const saveRef = useRef(state.save);
  useEffect(() => {
    const unsubscribe = session.subscribe((next) => {
      saveRef.current = next.save;
      setState(next);
    });
    session.hydrate();
    const onStorage = (event: StorageEvent) => {
      if (event.key === COMPANION_SAVE_KEY || event.key === null)
        session.handleStorageChange();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') session.handleStorageChange();
    };
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      unsubscribe();
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [session]);
  return {
    ...state,
    saveRef,
    commitSave: session.commitSave,
    reloadLatest: session.reloadLatest,
    restoreSave: session.restoreSave,
    reset: session.reset,
    flush: session.flush,
  };
}
