'use client';

import { useEffect, useId, useState } from 'react';
import { X } from 'lucide-react';
import {
  FOREST_DISCOVERIES,
  FOREST_DISCOVERY_IDS,
  type ForestChapter,
  type ForestRoute,
} from './forest-story';
import './forest-adventure-ui.css';

/** Code-native story cast, not a replacement for the child's saved hero. */
export function ForestCompanionFace({
  route,
  className = '',
}: {
  route: ForestRoute;
  className?: string;
}) {
  const gradient = `friend-${useId().replace(/:/g, '')}`;
  const bunny = route === 'garden';
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <radialGradient id={gradient} cx=".35" cy=".3">
          <stop stopColor={bunny ? '#fff8e9' : '#e6bf97'} />
          <stop offset="1" stopColor={bunny ? '#e6d8c5' : '#b78d71'} />
        </radialGradient>
      </defs>
      <ellipse cx="60" cy="108" rx="36" ry="6" fill="#5e655e" opacity=".12" />
      {bunny ? (
        <g fill={`url(#${gradient})`}>
          <ellipse
            cx="39"
            cy="33"
            rx="13"
            ry="29"
            transform="rotate(-12 39 33)"
          />
          <ellipse
            cx="81"
            cy="33"
            rx="13"
            ry="29"
            transform="rotate(12 81 33)"
          />
          <g fill="#eec4c2">
            <ellipse
              cx="39"
              cy="31"
              rx="6"
              ry="18"
              transform="rotate(-12 39 31)"
            />
            <ellipse
              cx="81"
              cy="31"
              rx="6"
              ry="18"
              transform="rotate(12 81 31)"
            />
          </g>
        </g>
      ) : (
        <g fill={`url(#${gradient})`}>
          <circle cx="25" cy="51" r="15" />
          <circle cx="95" cy="51" r="15" />
          <g fill="#cc9e86">
            <circle cx="25" cy="51" r="8" />
            <circle cx="95" cy="51" r="8" />
          </g>
        </g>
      )}
      <ellipse cx="60" cy="73" rx="45" ry="37" fill={`url(#${gradient})`} />
      {!bunny && <ellipse cx="60" cy="87" rx="27" ry="18" fill="#fae9d1" />}
      <g fill="#403536">
        <ellipse cx="42" cy="71" rx="6" ry="8" />
        <ellipse cx="78" cy="71" rx="6" ry="8" />
      </g>
      <g fill="white">
        <circle cx="40" cy="68" r="2.3" />
        <circle cx="76" cy="68" r="2.3" />
      </g>
      <g fill="#e7aa9a" opacity=".6">
        <ellipse cx="30" cy="84" rx="8" ry="5" />
        <ellipse cx="90" cy="84" rx="8" ry="5" />
      </g>
      <path
        d="M55 82q5-4 10 0q-1 6-5 6q-4 0-5-6"
        fill={bunny ? '#d39296' : '#63463e'}
      />
      <path
        d="M60 88q-1 7-8 3m8-3q1 7 8 3"
        stroke="#805a52"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
      {!bunny && (
        <g stroke="#a6806b" strokeWidth="1.2" strokeLinecap="round">
          <path d="M38 85l-18-3m19 9-20 3m63-9 18-3m-19 9 20 3" />
        </g>
      )}
      <path
        d="M44 104q16 9 32 0l-4 12-13-4-10 4z"
        fill={bunny ? '#b1bd8c' : '#8ab4b1'}
      />
    </svg>
  );
}

const moments: Record<
  ForestChapter,
  { kicker: string; title: string; line: string }
> = {
  arrival: {
    kicker: '달빛 숲의 작은 약속',
    title: '어? 숲의 불빛이 사라졌어.',
    line: '작은 친구와 함께, 잠든 숲에 첫발을 내디뎌요.',
  },
  crossing: {
    kicker: '새 친구를 만났어요',
    title: '혼자서는 어려웠는데!',
    line: '재료를 모아 우리 손으로 길을 만들어 줄까요?',
  },
  grove: {
    kicker: '나뭇잎 사이로 들리는 소리',
    title: '부엉이가 노래를 잊어버렸대.',
    line: '친구의 이야기를 듣고 반짝이는 종을 울려요.',
  },
  festival: {
    kicker: '숲이 깨어나는 순간',
    title: '봐! 나무에 빛이 돌아왔어.',
    line: '우리가 만든 불빛을 어디에 선물할까요?',
  },
  complete: {
    kicker: '이야기의 마지막 장',
    title: '이 숲은 우리를 기억할 거야.',
    line: '오늘의 선택이 한 권의 동화책이 되었어요.',
  },
};

export function ForestMoment({
  chapter,
  crafted = false,
}: {
  chapter: ForestChapter;
  crafted?: boolean;
}) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    // A non-blocking caption, never an animation the child must wait through.
    const timer = setTimeout(() => setVisible(false), 6500);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  const moment =
    chapter === 'crossing' && crafted
      ? {
          kicker: '우리가 함께 만든 길',
          title: '다음 친구도 여기로 지나갈 거야.',
          line: '함께 만든 길을 따라 숲 안쪽으로 걸어가요.',
        }
      : moments[chapter];
  return (
    <output className="fa-moment">
      <small>{moment.kicker}</small>
      <strong>{moment.title}</strong>
      <p>{moment.line}</p>
      <button onClick={() => setVisible(false)} aria-label="장면 소개 닫기">
        <X size={16} />
      </button>
    </output>
  );
}

const discoveryIcons: Record<string, string> = {
  'secret-shell': '🐚',
  'secret-mushroom': '🍄',
  'secret-star': '✦',
};
export function ForestMemories({
  discovered,
  compact = false,
}: {
  discovered: readonly string[];
  compact?: boolean;
}) {
  return (
    <details className={`fa-memories ${compact ? 'fa-memories-compact' : ''}`}>
      <summary>
        <span>✧ 숲에서 주운 작은 기억</span>
        <small>
          {FOREST_DISCOVERY_IDS.filter((id) => discovered.includes(id)).length}{' '}
          / 3
        </small>
      </summary>
      <p>서두르지 않아도 괜찮아요. 강가와 정원을 산책하다 보면 만나요.</p>
      <div>
        {FOREST_DISCOVERY_IDS.map((id) => {
          const found = discovered.includes(id);
          return (
            <figure key={id} className={found ? 'is-found' : ''}>
              <span aria-hidden="true">{found ? discoveryIcons[id] : '?'}</span>
              <figcaption>
                <strong>
                  {found
                    ? FOREST_DISCOVERIES[id].label
                    : id === 'secret-shell'
                      ? '강가의 작은 비밀'
                      : id === 'secret-mushroom'
                        ? '정원의 작은 비밀'
                        : '나무 사이의 반짝임'}
                </strong>
                <small>
                  {found
                    ? FOREST_DISCOVERIES[id].description
                    : '아직 만나지 않았어요'}
                </small>
              </figcaption>
            </figure>
          );
        })}
      </div>
    </details>
  );
}

export function ForestRouteArt({ route }: { route: 'river' | 'garden' }) {
  return (
    <svg className="fa-route-art" viewBox="0 0 280 70" aria-hidden="true">
      <rect
        width="280"
        height="70"
        rx="14"
        fill={route === 'river' ? '#dcece8' : '#edf0d8'}
      />
      <path
        d="M0 47Q50 22 112 49T280 42V70H0Z"
        fill={route === 'river' ? '#b0cec0' : '#c8d9ad'}
      />
      {route === 'river' ? (
        <>
          <path
            d="M195 0Q124 24 184 47T103 70H192Q265 48 205 29T250 0"
            fill="#8dc6cd"
          />
          <path
            d="M175 18l48 8m-53 29 32 4"
            stroke="#eafff6"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <g stroke="#a78266" strokeWidth="7" strokeLinecap="round">
            <path d="M176 23l-6 25m20-24-6 24m20-22-6 25" />
          </g>
        </>
      ) : (
        <g>
          {[180, 210, 242].map((x, i) => (
            <g key={x} transform={`translate(${x} ${35 + (i % 2) * 12})`}>
              <path d="M0 0v30" stroke="#8aa573" strokeWidth="3" />
              {[0, 72, 144, 216, 288].map((a) => (
                <ellipse
                  key={a}
                  cy="-7"
                  rx="5"
                  ry="8"
                  transform={`rotate(${a})`}
                  fill={i === 1 ? '#e4b3bf' : '#f6d894'}
                />
              ))}
              <circle r="4" fill="#e2b568" />
            </g>
          ))}
        </g>
      )}
      <circle cx="38" cy="21" r="7" fill="#fff5ce" />
      <path d="M16 62l10-19 10 19m32-1 9-17 10 17" fill="#8fac8d" />
    </svg>
  );
}
