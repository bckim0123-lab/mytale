'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react';
import type { DrawingAssetMetadata } from './drawing-assets';
import { useDrawingPreviews } from './use-drawing-previews';

export const FRIENDS_PER_PAGE = 6;

export function friendLibraryPage(total: number, requested: number) {
  const pages = Math.max(1, Math.ceil(total / FRIENDS_PER_PAGE));
  const page = Math.max(0, Math.min(pages - 1, requested));
  return { page, pages, start: page * FRIENDS_PER_PAGE };
}

export default function CompanionArtLibrary({
  assets,
  selectedId,
  onSelect,
}: {
  assets: readonly DrawingAssetMetadata[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const [cursor, setPage] = useState<{
    page: number;
    selection?: string;
  } | null>(null);
  const firstFriend = useRef<HTMLButtonElement>(null);
  const focusAfterPaging = useRef(false);
  const selectedPage = Math.floor(
    Math.max(
      0,
      assets.findIndex((asset) => asset.id === selectedId),
    ) / FRIENDS_PER_PAGE,
  );
  // Metadata may arrive after the first render. Follow the chosen friend until
  // the child explicitly pages away; a newly chosen friend becomes visible
  // without remounting cards or stealing their keyboard focus.
  const range = friendLibraryPage(
    assets.length,
    cursor && cursor.selection === selectedId ? cursor.page : selectedPage,
  );
  const visible = assets.slice(range.start, range.start + FRIENDS_PER_PAGE);
  const previews = useDrawingPreviews(visible.map((asset) => asset.id));
  useEffect(() => {
    if (focusAfterPaging.current) {
      focusAfterPaging.current = false;
      firstFriend.current?.focus({ preventScroll: true });
    }
  }, [range.page]);
  function turnPage(page: number) {
    focusAfterPaging.current = true;
    setPage({ page, selection: selectedId });
  }
  if (!assets.length) return null;
  return (
    <section className="cw-art-library" aria-label="내가 만든 그림친구">
      <span className="cw-label">내가 만든 그림친구</span>
      <div className="cw-art-library-grid">
        {visible.map((asset, index) => (
          <button
            key={asset.id}
            ref={index === 0 ? firstFriend : undefined}
            type="button"
            aria-pressed={selectedId === asset.id}
            onClick={() => onSelect(asset.id)}
          >
            {previews[asset.id] ? (
              // eslint-disable-next-line next/no-img-element -- Device-local approved artwork, never uploaded to an optimizer.
              <img
                src={previews[asset.id]}
                alt=""
                loading="lazy"
                decoding="async"
              />
            ) : (
              <span className="cw-art-preview-placeholder" aria-hidden="true">
                <ImageIcon size={26} />
              </span>
            )}
            <span className="cw-art-friend-name">
              {asset.name || '그림친구'}
            </span>
          </button>
        ))}
      </div>
      {range.pages > 1 && (
        <nav className="cw-art-pagination" aria-label="그림친구 보관함 넘기기">
          <button
            type="button"
            disabled={range.page === 0}
            aria-label="이전 친구들"
            onClick={() => turnPage(range.page - 1)}
          >
            <ChevronLeft size={20} />
          </button>
          <output>
            {range.page + 1} / {range.pages} · 친구 {assets.length}명
          </output>
          <button
            type="button"
            disabled={range.page === range.pages - 1}
            aria-label="다음 친구들"
            onClick={() => turnPage(range.page + 1)}
          >
            <ChevronRight size={20} />
          </button>
        </nav>
      )}
      <p className="cw-fine">
        그림의 실루엣에 두께를 준 입체 그림인형이에요. 얼굴·무늬는 생성한 모습
        그대로예요.
      </p>
    </section>
  );
}
