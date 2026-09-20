'use client';
import { useEffect, useState } from 'react';
import { readDrawingAsset } from './drawing-assets';

export function useDrawingAsset(id?: string) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    id?: string;
    png?: string;
    loading: boolean;
    error: string;
  }>({ loading: !!id, error: '' });
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener('drawing-friend-artworks-changed', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('drawing-friend-artworks-changed', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  useEffect(() => {
    let canceled = false;
    queueMicrotask(() => {
      if (!canceled) setState({ id, loading: !!id, error: '' });
    });
    if (id)
      void readDrawingAsset(id)
        .then((asset) => {
          if (!canceled)
            setState({
              id,
              png: asset?.png,
              loading: false,
              error: asset
                ? ''
                : '이 기기에 친구 그림이 없어요. 그림이 포함된 백업을 가져오면 다시 만날 수 있어요.',
            });
        })
        .catch(() => {
          if (!canceled)
            setState({
              id,
              loading: false,
              error:
                '보관한 친구 그림을 읽지 못했어요. 백업 파일을 확인해 주세요.',
            });
        });
    return () => {
      canceled = true;
    };
  }, [id, revision]);
  return state.id === id
    ? state
    : { id, loading: !!id, error: '', png: undefined };
}
