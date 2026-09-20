'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Volume2,
  Square,
  Printer,
  BookOpen,
  Heart,
  X,
} from 'lucide-react';
import {
  CompanionPortrait,
  useCompanionPortrait,
  type CompanionPortraitState,
} from './companion-portrait';
import type { CompanionAppearance, CompanionStoryBook } from './companion-save';
import './companion-storybook.css';

type StorybookProps = {
  book: CompanionStoryBook;
  fallbackName: string;
  fallbackAppearance: CompanionAppearance;
  onClose?: () => void;
};

const chapterNames = [
  '숲이 우리를 불렀어',
  '작은 손으로 만든 길',
  '마음이 닿은 노래',
  '반짝, 우리가 켠 불빛',
  '또 만나, 달빛 숲',
];

function companionWith(name: string): string {
  const last = name.codePointAt(name.length - 1) ?? 0;
  const hasFinalConsonant =
    last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
  return `${name}${hasFinalConsonant ? '과' : '와'}`;
}

/** Decorative, page-specific shapes sit in the illustration; the hero is the actual saved 3D model. */
function SceneDetails({
  page,
  book,
}: {
  page: number;
  book: CompanionStoryBook;
}) {
  const route = book.choices?.route;
  const sky = book.choices?.ending === 'sky';
  const invite = book.choices?.owl === 'invite';
  const goldId = `csb-gold-${useId().replace(/:/g, '')}`;
  return (
    <svg
      className={`csb-scene-details csb-scene-details-${page}`}
      viewBox="0 0 640 600"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={goldId} x2="0" y2="1">
          <stop stopColor="#fff6b3" />
          <stop offset="1" stopColor="#f4b968" />
        </linearGradient>
      </defs>
      {page === 0 && (
        <g fill="#fff2ab" opacity=".85">
          {[
            [92, 156],
            [490, 210],
            [524, 104],
            [138, 366],
            [463, 390],
          ].map(([x, y], i) => (
            <path
              key={i}
              d={`M${x} ${y - 8}q2 7 8 8q-7 2-8 8q-2-7-8-8q7-2 8-8`}
            />
          ))}
          <path
            d="M72 530q250-60 495-3"
            fill="none"
            stroke="#ffeec9"
            strokeWidth="5"
            strokeDasharray="2 19"
            strokeLinecap="round"
          />
        </g>
      )}
      {page === 1 && route === 'river' && (
        <g>
          <path
            d="M0 477q120-36 270 0t370 0v123H0z"
            fill="#a8d9db"
            opacity=".78"
          />
          <path
            d="M58 526q150-64 430-17"
            fill="none"
            stroke="#694a43"
            strokeWidth="26"
            strokeLinecap="round"
          />
          {Array.from({ length: 9 }, (_, i) => (
            <path
              key={i}
              d={`M${98 + i * 43} ${505 - Math.sin((i / 8) * Math.PI) * 32}l-7 47`}
              stroke={i % 2 ? '#dba379' : '#ecc298'}
              strokeWidth="36"
              strokeLinecap="round"
            />
          ))}
          <path
            d="M38 559q28-12 55 0m443-24q28-12 55 0"
            stroke="#e3ffff"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />
        </g>
      )}
      {page === 1 && route !== 'river' && (
        <g>
          {[
            [107, 454, '#fac9c2'],
            [484, 420, '#f6d776'],
            [542, 510, '#d4c8ed'],
            [60, 533, '#fff0b4'],
          ].map(([x, y, color], i) => (
            <g key={i} transform={`translate(${x},${y})`}>
              <path
                d="M0 8q-8 24 0 55M-2 37q-30-22-29-4q4 17 30 17M1 23q27-19 26-4q-5 16-25 15"
                fill="#7ba47c"
                stroke="#557f64"
                strokeWidth="3"
              />
              {[0, 60, 120, 180, 240, 300].map((angle) => (
                <ellipse
                  key={angle}
                  cy="-14"
                  ry="17"
                  rx="10"
                  fill={String(color)}
                  transform={`rotate(${angle})`}
                />
              ))}
              <circle r="10" fill="#eeb862" />
              <circle cx="-3" cy="-3" r="3" fill="#fff0b7" />
            </g>
          ))}
        </g>
      )}
      {page === 2 && (
        <g>
          <g transform="translate(480,347) rotate(9)">
            <ellipse cy="28" rx="45" ry="55" fill="#b68c76" />
            <ellipse cy="35" rx="30" ry="37" fill="#f7dfb9" />
            <path d="M-40-8l3-35 27 27M40-8l-3-35-27 27" fill="#a47763" />
            {[-20, 20].map((x) => (
              <g key={x}>
                <circle cx={x} r="22" fill="#fff3d8" />
                <circle cx={x + 2} cy="2" r="9" fill="#453737" />
                <circle cx={x} cy="-1" r="3" fill="white" />
              </g>
            ))}
            <path d="M-7 18h14l-7 12z" fill="#e8ac63" />
            <ellipse
              cx="-43"
              cy="30"
              rx="12"
              ry="27"
              fill="#99715e"
              transform={`rotate(${invite ? 65 : 12} -43 30)`}
            />
            <ellipse
              cx="42"
              cy="27"
              rx="12"
              ry="28"
              fill="#99715e"
              transform={`rotate(${invite ? -70 : -10} 42 27)`}
            />
            {!invite && (
              <path
                d="M-55 83Q0 76 65 86"
                fill="none"
                stroke="#785b4a"
                strokeWidth="12"
                strokeLinecap="round"
              />
            )}
          </g>
          {invite ? (
            <g fill="#fff3b3" fontSize="40" fontFamily="serif">
              <text x="427" y="253">
                ♪
              </text>
              <text x="527" y="288">
                ♫
              </text>
              <text x="106" y="300">
                ♪
              </text>
            </g>
          ) : (
            <g fill="#fff7ad">
              {[
                [421, 250],
                [542, 297],
                [123, 323],
                [371, 390],
                [519, 200],
              ].map(([x, y], i) => (
                <g key={i}>
                  <circle cx={x} cy={y} r="16" opacity=".12" />
                  <circle cx={x} cy={y} r="4" opacity=".85" />
                </g>
              ))}
            </g>
          )}
        </g>
      )}
      {page >= 3 && (
        <g>
          {Array.from({ length: page === 3 ? 7 : 11 }, (_, i) => {
            const x = 60 + ((i * 97) % 520);
            const y =
              sky || page === 3 ? 85 + ((i * 61) % 300) : 400 + (i % 3) * 45;
            return (
              <g key={i} transform={`translate(${x},${y})`}>
                <circle r="27" fill="#ffdb8b" opacity=".08" />
                <circle r="16" fill="#ffe4a3" opacity=".14" />
                <path d="M-8-8Q0-12 8-8L6 7H-6z" fill={`url(#${goldId})`} />
                <path d="M-5 9H5" stroke="#b38560" strokeWidth="2" />
              </g>
            );
          })}
        </g>
      )}
      <ellipse
        cx={page === 2 ? 270 : 320}
        cy="553"
        rx="132"
        ry="16"
        fill="#253b38"
        opacity=".15"
      />
    </svg>
  );
}

function StoryPage({
  book,
  page,
  name,
  portrait,
  print = false,
}: {
  book: CompanionStoryBook;
  page: number;
  name: string;
  portrait: CompanionPortraitState;
  print?: boolean;
}) {
  const title = chapterNames[Math.min(page, chapterNames.length - 1)];
  return (
    <section
      className={`csb-spread csb-page-${page}${print ? ' csb-print-page' : ''}`}
      aria-label={`${page + 1}장 ${title}`}
    >
      <div className="csb-illustration">
        {/* Existing local WebP illustrations must also render directly in print. */}
        {/* eslint-disable-next-line next/no-img-element */}
        <img
          className="csb-background"
          src={`/moon-forest-scene-${Math.min(page + 1, 5)}.webp`}
          alt=""
          loading={print ? 'eager' : undefined}
        />
        <div className="csb-art-wash" />
        <SceneDetails page={page} book={book} />
        <CompanionPortrait portrait={portrait} name={name} />
        <div className="csb-illustration-title">
          <span>
            {page === 0
              ? '내가 만든 친구가 주인공인 이야기'
              : `${name}의 달빛 숲 모험`}
          </span>
          <strong>{page === 0 ? book.title : title}</strong>
        </div>
        <span className="csb-art-number" aria-hidden="true">
          {String(page + 1).padStart(2, '0')}
        </span>
      </div>
      <div className="csb-paper">
        <span className="csb-chapter">달빛 숲 이야기 · {page + 1}장</span>
        <h3>{title}</h3>
        <p>{book.pages[page]}</p>
        <div className="csb-page-signature">
          <span aria-hidden="true">✧</span> 나와 {name}, 우리가 고른 이야기
        </div>
        {page === book.pages.length - 1 && (
          <div className="csb-the-end">
            오늘의 모험 끝. 우리의 이야기는 여기 남았어.
          </div>
        )}
      </div>
    </section>
  );
}

function ParentNote({
  book,
  name,
}: {
  book: CompanionStoryBook;
  name: string;
}) {
  const choices = book.choices;
  const headingId = useId();
  const questions = choices
    ? [
        choices.route === 'river'
          ? '다리가 완성됐을 때 누가 제일 먼저 건너가면 좋겠어?'
          : '우리가 심은 꽃에 이름을 붙인다면 뭐라고 할까?',
        choices.owl === 'listen'
          ? '누군가 조용히 기다려 줘서 좋았던 적이 있어?'
          : '우리와 함께 노래하고 싶은 친구는 누구야?',
      ]
    : [
        '오늘 이야기에서 가장 마음에 든 장면은 어디였어?',
        '다음에는 친구와 어떤 곳으로 가 보고 싶어?',
      ];
  return (
    <section className="csb-parent-note" aria-labelledby={headingId}>
      <div>
        <span className="csb-parent-icon">
          <Heart size={21} />
        </span>
        <h3 id={headingId}>책을 덮고, 잠깐 도란도란</h3>
      </div>
      <p>
        {choices
          ? `${companionWith(name)} ${choices.route === 'river' ? '나뭇조각을 모아 다리를 만들고' : '씨앗을 심고 물을 주어 꽃길을 만들고'}, ${choices.owl === 'listen' ? '부엉이의 이야기를 들어 주었어요' : '부엉이를 노래에 초대했어요'}. 마지막에는 ${choices.ending === 'sky' ? '하늘로 빛을 올려 보냈어요' : '친구들의 집으로 가는 길을 밝혔어요'}.`
          : `${companionWith(name)} 함께 만든 이야기예요. 마음에 남은 장면을 한 가지씩 이야기해 보세요.`}
      </p>
      <ol>
        {questions.map((question) => (
          <li key={question}>{question}</li>
        ))}
      </ol>
      <small>
        정답은 없어요. 아이의 대답을 듣고, 어른의 이야기도 하나 들려주세요.
      </small>
    </section>
  );
}

export function CompanionStorybook(props: StorybookProps) {
  return <CompanionStorybookReader key={props.book.id} {...props} />;
}

function CompanionStorybookReader({
  book,
  fallbackName,
  fallbackAppearance,
  onClose,
}: StorybookProps) {
  const name = book.heroName || fallbackName;
  const portrait = useCompanionPortrait(
    book.heroAppearance ?? fallbackAppearance,
  );
  const [page, setPage] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const speech = useRef<SpeechSynthesisUtterance | null>(null);
  const localVoice = useRef<SpeechSynthesisVoice | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const activePage = Math.min(page, book.pages.length - 1);

  useEffect(() => {
    if (
      !('speechSynthesis' in window) ||
      !('SpeechSynthesisUtterance' in window)
    )
      return;
    const updateVoices = () => {
      localVoice.current =
        window.speechSynthesis
          .getVoices()
          .find(
            (voice) =>
              voice.localService && voice.lang.toLowerCase().startsWith('ko'),
          ) ?? null;
      setSpeechAvailable(Boolean(localVoice.current));
    };
    updateVoices();
    window.speechSynthesis.addEventListener('voiceschanged', updateVoices);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', updateVoices);
      if (speech.current) {
        speech.current.onend = null;
        speech.current.onerror = null;
        window.speechSynthesis?.cancel();
        speech.current = null;
      }
    };
  }, []);
  function stopSpeech() {
    if (speech.current) {
      speech.current.onend = null;
      speech.current.onerror = null;
      window.speechSynthesis.cancel();
      speech.current = null;
    }
    setSpeaking(false);
  }
  function readPage() {
    if (speaking) {
      stopSpeech();
      return;
    }
    if (!speechAvailable || !localVoice.current) return;
    const utterance = new SpeechSynthesisUtterance(
      `${chapterNames[Math.min(activePage, 4)]}. ${book.pages[activePage]}`,
    );
    utterance.lang = 'ko-KR';
    utterance.rate = 0.86;
    utterance.pitch = 1.04;
    utterance.voice = localVoice.current;
    utterance.onend = () => {
      if (speech.current === utterance) {
        setSpeaking(false);
        speech.current = null;
      }
    };
    utterance.onerror = (event) => {
      if (speech.current !== utterance) return;
      setSpeaking(false);
      speech.current = null;
      if (event.error !== 'canceled' && event.error !== 'interrupted')
        setSpeechError(
          '이 기기에서 읽어 주기를 시작하지 못했어요. 글로 함께 읽어 주세요.',
        );
    };
    speech.current = utterance;
    setSpeechError('');
    setSpeaking(true);
    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      speech.current = null;
      setSpeaking(false);
      setSpeechError(
        '이 기기에서 읽어 주기를 시작하지 못했어요. 글로 함께 읽어 주세요.',
      );
    }
  }
  function changePage(next: number) {
    stopSpeech();
    setSpeechError('');
    setPage(next);
    frame.current?.scrollIntoView({ behavior: 'instant', block: 'nearest' });
  }

  return (
    <article className="csb-reader">
      <header className="csb-toolbar">
        <span>
          <BookOpen size={17} /> 우리의 동화책
        </span>
        <div>
          <button
            type="button"
            onClick={readPage}
            disabled={!speechAvailable}
            aria-pressed={speaking}
            title={
              !speechAvailable
                ? '기기에 설치된 한국어 음성이 있어야 읽어 줄 수 있어요.'
                : undefined
            }
          >
            {speaking ? <Square size={16} /> : <Volume2 size={18} />}
            {speaking ? '그만 읽기' : '읽어 주기'}
          </button>
          <button
            type="button"
            disabled={!portrait.src && !portrait.unavailable}
            onClick={() => {
              stopSpeech();
              window.print();
            }}
          >
            <Printer size={17} />책 전체 인쇄
          </button>
          {onClose && (
            <button
              type="button"
              className="csb-close"
              onClick={() => {
                stopSpeech();
                onClose();
              }}
              aria-label="동화책 닫기"
            >
              <X size={20} />
            </button>
          )}
        </div>
      </header>
      <div className="csb-screen-page" ref={frame} aria-live="polite">
        <StoryPage
          key={`${book.id}-${activePage}`}
          book={book}
          page={activePage}
          name={name}
          portrait={portrait}
        />
      </div>
      <nav className="csb-navigation" aria-label="동화책 페이지">
        <button
          type="button"
          disabled={activePage === 0}
          onClick={() => changePage(activePage - 1)}
        >
          <ChevronLeft size={20} />
          <span>이전 장</span>
        </button>
        <div className="csb-page-dots">
          {book.pages.map((_, index) => (
            <button
              type="button"
              key={index}
              aria-label={`${index + 1}장으로 이동`}
              aria-current={activePage === index ? 'page' : undefined}
              onClick={() => changePage(index)}
            >
              <span>{index + 1}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={activePage === book.pages.length - 1}
          onClick={() => changePage(activePage + 1)}
        >
          <span>다음 장</span>
          <ChevronRight size={20} />
        </button>
      </nav>
      {speechError && (
        <output className="csb-speech-note">{speechError}</output>
      )}
      <p className="csb-privacy-note">
        {book.heroAppearance && book.heroName
          ? '그때의 친구와 선택을 담아 이 기기에 보관해요.'
          : '이전에 만든 책이라 그때의 모습은 저장되어 있지 않아요. 지금 친구의 모습으로 보여드려요.'}{' '}
        {speechAvailable
          ? '읽어 주기는 기기에 설치된 한국어 음성을 사용해요. 이야기를 음성 서버에 보내지 않아요.'
          : '이 기기에는 사용할 수 있는 한국어 음성이 없어서 읽어 주기가 쉬고 있어요. 글로 함께 읽어 주세요.'}
      </p>
      {activePage === book.pages.length - 1 && (
        <div className="csb-screen-note">
          <ParentNote book={book} name={name} />
        </div>
      )}
      <div className="csb-print-pages" aria-hidden="true">
        <section className="csb-print-cover">
          <span>우리가 만든 동화책</span>
          <h1>{book.title}</h1>
          <CompanionPortrait portrait={portrait} name={name} />
          <p>나와 {name}의 달빛 숲 모험</p>
          <small>
            우리의 선택이 이야기가 된 날 ·{' '}
            {new Date(book.createdAt).toLocaleDateString('ko-KR')}
          </small>
        </section>
        {book.pages.map((_, index) => (
          <StoryPage
            key={index}
            book={book}
            page={index}
            name={name}
            portrait={portrait}
            print
          />
        ))}
        <ParentNote book={book} name={name} />
      </div>
    </article>
  );
}

export default CompanionStorybook;
