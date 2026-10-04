'use client';

import { useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import type { CompanionStoryBook } from './companion-save';
import type { DrawingAsset } from './drawing-assets';
import { storybookWorldSvg } from './storybook-export';
import './companion-bookshelf.css';

export const BOOKS_PER_SHELF = 6;

/** A cover uses its historical hero only, never the currently selected friend. */
export function bookshelfCover(
  book: CompanionStoryBook,
  assets: readonly DrawingAsset[],
) {
  const id = book.heroAppearance?.drawingAssetId;
  return {
    hero: id ? assets.find((asset) => asset.id === id)?.png : undefined,
    background: book.illustrationTheme
      ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(storybookWorldSvg(book.illustrationTheme, 0))}`
      : `/moon-forest-scene-${book.choices?.ending === 'home' ? 4 : book.choices?.route === 'garden' ? 2 : 1}.webp`,
    caption: book.heroName ? `${book.heroName}의 이야기` : '우리가 만든 이야기',
  };
}

export function bookshelfPage(total: number, requestedPage: number) {
  const pages = Math.max(1, Math.ceil(total / BOOKS_PER_SHELF));
  const page = Math.max(0, Math.min(pages - 1, requestedPage));
  return {
    page,
    pages,
    start: page * BOOKS_PER_SHELF,
    end: Math.min(total, (page + 1) * BOOKS_PER_SHELF),
  };
}

export default function CompanionBookshelf({
  books,
  assets,
  onOpen,
}: {
  books: readonly CompanionStoryBook[];
  assets: readonly DrawingAsset[];
  onOpen: (book: CompanionStoryBook) => void;
}) {
  const [requestedPage, setPage] = useState(0);
  const firstCover = useRef<HTMLButtonElement>(null);
  const focusAfterPaging = useRef(false);
  const shelf = bookshelfPage(books.length, requestedPage);
  useEffect(() => {
    if (focusAfterPaging.current) {
      focusAfterPaging.current = false;
      firstCover.current?.focus();
    }
  }, [shelf.page]);
  function turnPage(page: number) {
    focusAfterPaging.current = true;
    setPage(page);
  }
  return (
    <div className="cbl-library">
      <p className="cbl-invitation">
        <BookOpen size={17} aria-hidden="true" />
        표지를 톡 눌러, 그날의 모험으로
      </p>
      <ul className="cbl-grid" aria-label="보관한 동화책">
        {books.slice(shelf.start, shelf.end).map((book, index) => {
          const cover = bookshelfCover(book, assets);
          const number = books.length - shelf.start - index;
          return (
            <li key={book.id}>
              <button
                ref={index === 0 ? firstCover : undefined}
                className="cbl-book"
                type="button"
                onClick={() => onOpen(book)}
                aria-label={`${number}번째 책, ${book.title}, ${book.pages.length}장, 다시 읽기`}
              >
                <span className="cbl-cover" aria-hidden="true">
                  {/* Local decorative assets only; no image optimizer or provider requests. */}
                  {/* eslint-disable-next-line next/no-img-element */}
                  <img
                    className="cbl-world"
                    src={cover.background}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                  <span className="cbl-cover-shade" />
                  <span className="cbl-edition">우리의 {number}번째 책</span>
                  {cover.hero ? (
                    // eslint-disable-next-line next/no-img-element -- Approved, device-local artwork from this book's own snapshot.
                    <img
                      className="cbl-hero"
                      src={cover.hero}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <span className="cbl-moon">
                      ☾<span>✦</span>
                    </span>
                  )}
                  <span className="cbl-cover-caption">{cover.caption}</span>
                </span>
                <span className="cbl-book-info">
                  <strong>{book.title}</strong>
                  <span>
                    {new Date(book.createdAt).toLocaleDateString('ko-KR')} ·{' '}
                    {book.pages.length}장
                  </span>
                  <span className="cbl-read">
                    다시 읽기 <ChevronRight size={14} aria-hidden="true" />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {shelf.pages > 1 && (
        <nav className="cbl-pagination" aria-label="책장 넘기기">
          <button
            type="button"
            disabled={shelf.page === 0}
            onClick={() => turnPage(shelf.page - 1)}
            aria-label="이전 책장"
          >
            <ChevronLeft size={18} />
          </button>
          <output>
            {shelf.page + 1} / {shelf.pages} 책장{' '}
            <small>총 {books.length}권</small>
          </output>
          <button
            type="button"
            disabled={shelf.page === shelf.pages - 1}
            onClick={() => turnPage(shelf.page + 1)}
            aria-label="다음 책장"
          >
            <ChevronRight size={18} />
          </button>
        </nav>
      )}
    </div>
  );
}
