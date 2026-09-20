'use client';
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- This custom dialog cooperates with the root's background inert, with its own focus trap and Escape handling. */

import { useEffect, useId, useRef, useState } from 'react';
import {
  createForestToy,
  getForestToyView,
  movableToyPieces,
  toyTurnCount,
  transitionForestToy,
  GARDEN_PIPES,
  WATER_PORT,
  type ForestToyDesign,
  type ForestToyDifficulty,
  type ForestToyEvent,
  type ForestToyKind,
  type ForestToyState,
} from './forest-toybox-engine';
import './forest-toybox.css';

type Props = {
  kind: ForestToyKind;
  difficulty: ForestToyDifficulty;
  companionName: string;
  onComplete: (design: ForestToyDesign) => void;
  onClose: () => void;
  sound: boolean;
};

function Sparkle({
  x,
  y,
  scale = 1,
}: {
  x: number;
  y: number;
  scale?: number;
}) {
  return (
    <path
      d="M0-10Q2-2 10 0Q2 2 0 10Q-2 2-10 0Q-2-2 0-10Z"
      transform={`translate(${x} ${y}) scale(${scale})`}
      fill="#fff1a5"
    />
  );
}

function BridgeBoard({
  state,
  hint,
  rotate,
}: {
  state: ForestToyState;
  hint: number | null;
  rotate: (index: number, direction?: 1 | -1) => void;
}) {
  const view = getForestToyView(state);
  const uid = useId().replace(/:/g, '');
  const count = state.turns.length;
  const length = 420 / count;
  return (
    <div className={`ftb-board ftb-bridge ${view.solved ? 'ftb-solved' : ''}`}>
      <svg className="ftb-scenery" viewBox="0 0 640 360" aria-hidden="true">
        <defs>
          <linearGradient id={`${uid}-water`} x2="1" y2="1">
            <stop stopColor="#8bc9d0" />
            <stop offset="1" stopColor="#c0e8de" />
          </linearGradient>
          <linearGradient id={`${uid}-grass`} x2="0" y2="1">
            <stop stopColor="#bad896" />
            <stop offset="1" stopColor="#8cb777" />
          </linearGradient>
        </defs>
        <rect width="640" height="360" rx="28" fill={`url(#${uid}-water)`} />
        <g
          className="ftb-water-ripples"
          stroke="#edfff8"
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          opacity=".7"
        >
          <path d="M125 64q23-12 47 0m55 12q32-15 61 0m166-20q30-15 61 0M172 273q27-13 55 0m180 20q32-15 65 0m-228 23q30-11 58 0" />
          <path d="M352 107q29-12 60 0m-226 20q20-10 43 0m199 111q26-13 49 0" />
        </g>
        <path
          d="M0 0h80q52 71 12 137q-24 50 12 115q13 44-8 108H0zM640 0h-80q-51 70-12 139q27 47-8 113q-14 48 9 108h91z"
          fill={`url(#${uid}-grass)`}
        />
        <path
          d="M0 163q43-14 100 0v48q-44-11-100 2m640-50q-40-14-100 0v48q44-11 100 2"
          fill="#ecdcb3"
        />
        <g fill="#f6e6c4" stroke="#cfae80" strokeWidth="3">
          <rect x="70" y="151" width="35" height="71" rx="9" />
          <rect x="535" y="151" width="35" height="71" rx="9" />
        </g>
        <path
          d="M104 185h432"
          stroke="#fcf6db"
          strokeWidth="5"
          strokeDasharray="5 12"
          opacity=".8"
        />
        <g fill="#658b65">
          <path d="M34 101q-22-16-20-30q24-3 29 29q7-28 28-19q-1 18-30 27M599 279q-20-16-17-28q23-4 28 22q7-28 26-19q0 18-27 27" />
        </g>
        <g fill="#fce5ae">
          <circle cx="41" cy="289" r="11" />
          <circle cx="60" cy="72" r="8" />
          <circle cx="588" cy="93" r="10" />
        </g>
        <g fill="#e4a06a">
          <circle cx="41" cy="289" r="4" />
          <circle cx="60" cy="72" r="3" />
          <circle cx="588" cy="93" r="4" />
        </g>
        <g className="ftb-paper-boat" transform="translate(328 290)">
          <path d="M-24 0h47l-11 15h-25z" fill="#fff7e0" />
          <path d="M0-35v35h-22z" fill="#fbefcc" />
          <path d="M3-24v24h15z" fill="#e9cd99" />
        </g>
        {view.solved && (
          <g className="ftb-success-sparkles">
            <Sparkle x={177} y={105} />
            <Sparkle x={462} y={118} scale={0.8} />
            <Sparkle x={332} y={74} scale={0.65} />
          </g>
        )}
        <text
          x="36"
          y="194"
          textAnchor="middle"
          fill="#667953"
          fontSize="14"
          fontWeight="700"
        >
          출발
        </text>
        <text
          x="600"
          y="194"
          textAnchor="middle"
          fill="#667953"
          fontSize="14"
          fontWeight="700"
        >
          도착
        </text>
      </svg>
      {state.turns.map((turn, index) => {
        const aligned = turn % (toyTurnCount(state) / 2) === 0;
        return (
          <button
            type="button"
            className={`ftb-plank ${aligned ? 'ftb-aligned' : ''} ${hint === index ? 'ftb-hinted' : ''}`}
            key={index}
            disabled={state.stage !== 'puzzle'}
            style={{
              left: `${((110 + length * (index + 0.5)) / 640) * 100}%`,
              top: `${(185 / 360) * 100}%`,
              width: `${((length + 20) / 640) * 100}%`,
            }}
            aria-label={`${index + 1}번 나무판 돌리기${aligned ? ' · 강을 가로지르는 방향이에요' : ''}`}
            onClick={() => rotate(index)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault();
                rotate(index, event.key === 'ArrowLeft' ? -1 : 1);
              }
            }}
          >
            <svg viewBox="0 0 150 150" aria-hidden="true">
              <g
                className="ftb-turning-piece"
                style={{
                  transform: `rotate(${(turn * 360) / toyTurnCount(state)}deg)`,
                  transformOrigin: '75px 75px',
                }}
              >
                <rect
                  x="8"
                  y="48"
                  width="135"
                  height="61"
                  rx="13"
                  fill="#8a5c3c"
                  opacity=".3"
                />
                <rect
                  x="5"
                  y="42"
                  width="140"
                  height="63"
                  rx="12"
                  fill={aligned ? '#e9bd7b' : '#d9aa6c'}
                  stroke="#95633c"
                  strokeWidth="2.5"
                />
                <path
                  d="M17 50q34 7 65 0t51 0M15 94q30-9 61-3t57-1M17 63q24 6 37 1m34 22q25-6 44-1M108 58q21 0 20 9q-5 9-20 0q-8-8 0-9Z"
                  fill="none"
                  stroke="#b8824b"
                  strokeWidth="2"
                  opacity=".58"
                />
                <rect
                  x="12"
                  y="47"
                  width="127"
                  height="4"
                  rx="2"
                  fill="#ffe4ac"
                  opacity=".75"
                />
                <circle cx="22" cy="76" r="4" fill="#7d694d" />
                <circle cx="128" cy="76" r="4" fill="#7d694d" />
                <circle cx="21" cy="75" r="1.4" fill="#eae1bb" />
                <circle cx="127" cy="75" r="1.4" fill="#eae1bb" />
                <text
                  x="75"
                  y="83"
                  textAnchor="middle"
                  fontSize="20"
                  fontWeight="700"
                  fill="#785334"
                >
                  {index + 1}
                </text>
              </g>
            </svg>
            {hint === index && (
              <span className="ftb-piece-hint" aria-hidden="true">
                ↻
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Pipe({
  ports,
  flowing,
  turn,
}: {
  ports: number;
  flowing: boolean;
  turn: number;
}) {
  const ends = [
    [WATER_PORT.north, 'M50 50V0'],
    [WATER_PORT.east, 'M50 50H100'],
    [WATER_PORT.south, 'M50 50V100'],
    [WATER_PORT.west, 'M50 50H0'],
  ] as const;
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <g
        className="ftb-turning-pipe"
        style={{
          transform: `rotate(${turn * 90}deg)`,
          transformOrigin: '50px 50px',
        }}
        fill="none"
        strokeLinecap="round"
      >
        {ends
          .filter(([port]) => Boolean(ports & port))
          .map(([port, path]) => (
            <g key={port}>
              <path d={path} stroke="#638b77" strokeWidth="28" />
              <path
                d={path}
                stroke={flowing ? '#89d5dc' : '#f1dfb4'}
                strokeWidth="19"
              />
              {flowing && (
                <path
                  className="ftb-flow-line"
                  d={path}
                  stroke="#e3ffff"
                  strokeWidth="3"
                  strokeDasharray="5 13"
                />
              )}
            </g>
          ))}
        <circle
          cx="50"
          cy="50"
          r="10"
          fill={flowing ? '#89d5dc' : '#f1dfb4'}
          stroke="none"
        />
      </g>
    </svg>
  );
}

function GardenBoard({
  state,
  hint,
  rotate,
}: {
  state: ForestToyState;
  hint: number | null;
  rotate: (index: number, direction?: 1 | -1) => void;
}) {
  const view = getForestToyView(state);
  const movable = movableToyPieces(state);
  return (
    <div className={`ftb-board ftb-garden ${view.solved ? 'ftb-solved' : ''}`}>
      <div className="ftb-pond" aria-hidden="true">
        <span>연못</span>
        <svg viewBox="0 0 70 120">
          <ellipse
            cx="36"
            cy="61"
            rx="28"
            ry="49"
            fill="#83c7d0"
            stroke="#78a991"
            strokeWidth="7"
          />
          <path
            d="M18 47q15-7 32 0m-35 25q12 6 30 0"
            stroke="#d9f8eb"
            strokeWidth="3"
            fill="none"
          />
          <ellipse cx="43" cy="29" rx="13" ry="8" fill="#99c783" />
          <path d="M43 29l9 5" stroke="#73945f" strokeWidth="2" />
        </svg>
      </div>
      <fieldset
        className="ftb-garden-grid"
        aria-label="연못에서 세 꽃으로 이어지는 물길"
      >
        {GARDEN_PIPES.map((pipe, index) => {
          if (!pipe)
            return (
              <div
                className="ftb-garden-decoration"
                key={index}
                aria-hidden="true"
              >
                <span>{index === 0 ? '🌿' : '🪨'}</span>
                <i>✧</i>
              </div>
            );
          const flowing = view.connected.includes(index);
          const canTurn = movable.includes(index);
          const illustration = (
            <div className="ftb-pipe-image">
              <Pipe ports={pipe} flowing={flowing} turn={state.turns[index]} />
              {canTurn && state.stage === 'puzzle' && (
                <span className="ftb-pipe-rotate" aria-hidden="true">
                  ↻
                </span>
              )}
            </div>
          );
          return canTurn ? (
            <button
              type="button"
              key={index}
              className={`ftb-pipe ${flowing ? 'ftb-wet' : ''} ${hint === index ? 'ftb-hinted' : ''}`}
              disabled={state.stage !== 'puzzle'}
              aria-label={`${Math.floor(index / 3) + 1}번째 줄 ${(index % 3) + 1}번째 물길 돌리기${flowing ? ' · 물이 도착했어요' : ''}`}
              onClick={() => rotate(index)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                  event.preventDefault();
                  rotate(index, event.key === 'ArrowLeft' ? -1 : 1);
                }
              }}
            >
              {illustration}
            </button>
          ) : (
            <div
              key={index}
              className={`ftb-pipe ftb-fixed ${flowing ? 'ftb-wet' : ''}`}
              aria-label="고정된 물길"
            >
              {illustration}
            </div>
          );
        })}
      </fieldset>
      <div
        className="ftb-flower-row"
        aria-label={`세 꽃 중 ${view.correct}송이에 물이 도착했어요`}
      >
        {view.flowers.map((bloom, index) => (
          <div
            className={`ftb-flower ${bloom ? 'ftb-bloom' : ''}`}
            key={index}
            aria-label={`${index + 1}번 꽃 ${bloom ? '활짝 피었어요' : '물을 기다려요'}`}
          >
            <svg viewBox="0 0 80 100" aria-hidden="true">
              <path
                d="M40 53v39m0-14q-26-24-26-3q9 14 26 12m0-20q24-15 22 0q-7 13-22 11"
                fill="#7b9f6d"
                stroke="#6c9260"
                strokeWidth="3"
              />
              <g className="ftb-petals" transform="translate(40 39)">
                {[0, 60, 120, 180, 240, 300].map((angle) => (
                  <ellipse
                    key={angle}
                    cy="-15"
                    rx="10"
                    ry="19"
                    transform={`rotate(${angle})`}
                    fill={['#eeabb8', '#f5d276', '#cfb2e7'][index]}
                  />
                ))}
                <circle r="12" fill="#dca65e" />
                <circle cx="-4" cy="-2" r="1.5" fill="#855b42" />
                <circle cx="4" cy="-2" r="1.5" fill="#855b42" />
                <path
                  d="M-3 3q3 3 6 0"
                  stroke="#855b42"
                  strokeWidth="1.5"
                  fill="none"
                />
              </g>
              {bloom && <Sparkle x={66} y={15} scale={0.55} />}
            </svg>
          </div>
        ))}
      </div>
    </div>
  );
}

function DesignIcon({ design }: { design: ForestToyDesign }) {
  return (
    <svg viewBox="0 0 70 70" aria-hidden="true">
      {design === 'star' ? (
        <>
          <path
            d="m35 8 8 17 19 3-14 14 3 20-16-9-17 9 4-20L8 28l19-3z"
            fill="#edc879"
            stroke="#c69b55"
            strokeWidth="2"
          />
          <path
            d="m32 18 3-5 5 12"
            fill="none"
            stroke="#fff0c2"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <path
            d="M35 59C-9 29 15 0 35 21C55 0 79 29 35 59Z"
            fill="#edaaa9"
            stroke="#c98189"
            strokeWidth="2"
          />
          <path
            d="M17 27q2-10 10-8"
            stroke="#ffe4da"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}

/** Owns its modal, focus trap and body scroll lock. Render outside other dialogs. */
export default function ForestToybox(props: Props) {
  return (
    <ForestToyboxSession key={`${props.kind}-${props.difficulty}`} {...props} />
  );
}

function ForestToyboxSession({
  kind,
  difficulty,
  companionName,
  onComplete,
  onClose,
  sound,
}: Props) {
  const [state, setState] = useState(() => createForestToy(kind, difficulty));
  const [showHint, setShowHint] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const stateRef = useRef(state);
  const panel = useRef<HTMLDivElement>(null);
  const designFirst = useRef<HTMLButtonElement>(null);
  const completeSent = useRef(false);
  const closeRef = useRef(onClose);
  const audio = useRef<AudioContext | null>(null);
  const uid = useId().replace(/:/g, '');
  const view = getForestToyView(state);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex="0"]',
        ) ?? [],
      );
      if (!focusable.length) {
        event.preventDefault();
        panel.current?.focus();
        return;
      }
      const first = focusable[0],
        last = focusable[focusable.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === panel.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          document.activeElement === panel.current)
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', keyboard, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', keyboard, true);
      previousFocus?.focus();
      void audio.current?.close().catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (state.stage === 'design') designFirst.current?.focus();
  }, [state.stage]);
  function chime(success: boolean) {
    if (!sound) return;
    try {
      const context = audio.current ?? new AudioContext();
      audio.current = context;
      void context.resume().catch(() => {});
      [success ? 523.25 : 440, ...(success ? [659.25, 783.99] : [])].forEach(
        (frequency, index) => {
          const oscillator = context.createOscillator(),
            gain = context.createGain();
          oscillator.type = 'sine';
          oscillator.frequency.value = frequency;
          const start = context.currentTime + index * 0.11;
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(0.035, start + 0.012);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.26);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(start);
          oscillator.stop(start + 0.28);
          oscillator.onended = () => {
            oscillator.disconnect();
            gain.disconnect();
          };
        },
      );
    } catch {
      /* Optional sound never blocks play. */
    }
  }
  function act(event: ForestToyEvent) {
    const old = stateRef.current;
    const next = transitionForestToy(old, event);
    if (next === old) return;
    stateRef.current = next;
    setState(next);
    if (event.type === 'restart') {
      setShowHint(false);
      setAnnouncement('처음 모습으로 돌아왔어요. 다시 천천히 해 봐요.');
      completeSent.current = false;
    } else if (event.type === 'hint') {
      setShowHint(true);
      setAnnouncement(
        '반짝이는 조각이 힌트예요. 원하면 한 조각을 함께 맞출 수 있어요.',
      );
    } else if (event.type === 'assist') {
      setAnnouncement('힌트의 도움으로 한 조각을 맞췄어요.');
      chime(next.stage === 'design');
    } else if (event.type === 'rotate') {
      const current = getForestToyView(next);
      setAnnouncement(
        kind === 'bridge'
          ? `${current.correct}개 나무판이 강을 가로지르는 방향이에요.`
          : `${current.correct}송이 꽃에 물이 도착했어요.`,
      );
      chime(next.stage === 'design');
    }
    if (old.stage === 'puzzle' && next.stage === 'design') {
      setShowHint(false);
      setAnnouncement(
        kind === 'bridge'
          ? '양쪽 강둑이 이어졌어요! 우리 다리에 달 장식을 골라 주세요.'
          : '세 꽃이 모두 활짝 피었어요! 정원에 남길 장식을 골라 주세요.',
      );
    }
    if (next.stage === 'complete' && next.design && !completeSent.current) {
      completeSent.current = true;
      onComplete(next.design);
    }
  }
  const name = companionName.trim() || '친구';
  const hints =
    view.hintIndex === null
      ? ''
      : kind === 'bridge'
        ? `${view.hintIndex + 1}번 나무판을 오른쪽으로 ${view.hintSteps}번 돌려 봐요. 하얀 점선과 나란히 놓으면 돼요.`
        : `${Math.floor(view.hintIndex / 3) + 1}번째 줄의 반짝이는 물길을 오른쪽으로 ${view.hintSteps}번 돌려 봐요. 파란 물과 빈 물길의 입구를 이어 주세요.`;
  return (
    <div className="ftb-overlay">
      <div
        className="ftb-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        aria-describedby={`${uid}-description`}
        tabIndex={-1}
        ref={panel}
      >
        <header className="ftb-header">
          <div>
            <span className="ftb-eyebrow">
              {kind === 'bridge' ? '숲속 작은 공방' : '반짝 물길 정원'}
            </span>
            <h2 id={`${uid}-title`}>
              {kind === 'bridge'
                ? '우리 손으로 다리를 놓자'
                : '꽃들에게 물을 보내자'}
            </h2>
          </div>
          <button
            className="ftb-close"
            type="button"
            onClick={onClose}
            aria-label="손놀이 닫고 모험으로 돌아가기"
          >
            ×
          </button>
        </header>
        <ol className="ftb-steps" aria-label="손놀이 순서">
          <li aria-current={state.stage === 'puzzle' ? 'step' : undefined}>
            <span>1</span> {kind === 'bridge' ? '다리 잇기' : '물길 잇기'}
          </li>
          <li aria-current={state.stage === 'design' ? 'step' : undefined}>
            <span>2</span> 장식 고르기
          </li>
          <li aria-current={state.stage === 'complete' ? 'step' : undefined}>
            <span>3</span> 완성하기
          </li>
        </ol>
        <p className="ftb-description" id={`${uid}-description`}>
          {state.stage === 'puzzle'
            ? kind === 'bridge'
              ? '나무판을 톡톡 눌러 돌려 봐요. 양쪽 강둑까지 반듯하게 이어지면 건널 수 있어요.'
              : '↻ 표시가 있는 물길을 톡톡 돌려 봐요. 연못의 물이 세 꽃까지 닿으면 꽃이 피어요.'
            : kind === 'bridge'
              ? `${name}와 건널 우리 다리가 생겼어요. 마지막으로 작은 장식을 달아 줄까요?`
              : `${name}와 꽃 세 송이를 깨웠어요. 우리가 만든 정원에 어떤 장식을 남길까요?`}
        </p>
        {kind === 'bridge' ? (
          <BridgeBoard
            state={state}
            hint={showHint ? view.hintIndex : null}
            rotate={(index, direction) =>
              act({ type: 'rotate', index, direction })
            }
          />
        ) : (
          <GardenBoard
            state={state}
            hint={showHint ? view.hintIndex : null}
            rotate={(index, direction) =>
              act({ type: 'rotate', index, direction })
            }
          />
        )}
        <div className={`ftb-progress ${view.solved ? 'ftb-success' : ''}`}>
          <span aria-hidden="true">
            {view.solved ? '✓' : kind === 'bridge' ? '🪵' : '💧'}
          </span>
          <strong>
            {view.solved
              ? kind === 'bridge'
                ? '뚝딱! 우리 다리가 이어졌어요'
                : '쪼르르! 꽃 세 송이가 활짝 피었어요'
              : kind === 'bridge'
                ? `나무판 ${view.correct} / ${view.total}개 방향 맞추기`
                : `꽃 ${view.correct} / 3송이에 물 보내기`}
          </strong>
          <span className="ftb-progress-dots" aria-hidden="true">
            {Array.from({ length: view.total }, (_, index) => (
              <i
                className={index < view.correct ? 'ftb-lit' : ''}
                key={index}
              />
            ))}
          </span>
        </div>
        {state.stage === 'puzzle' ? (
          <section className="ftb-help">
            <div className="ftb-tools">
              <button type="button" onClick={() => act({ type: 'hint' })}>
                ✧ 힌트 보기
              </button>
              <button type="button" onClick={() => act({ type: 'restart' })}>
                ↶ 처음부터 해 보기
              </button>
            </div>
            {showHint && (
              <div className="ftb-hint">
                <p>{hints}</p>
                <button type="button" onClick={() => act({ type: 'assist' })}>
                  힌트대로 한 조각 맞추기
                </button>
                <small>도움을 받아도 괜찮아요. 나머지는 천천히 해 봐요.</small>
              </div>
            )}
            <p className="ftb-reassurance">
              시간 제한도, 틀린 횟수도 없어요. 키보드는 Tab으로 고르고
              Enter·Space 또는 방향키로 돌려요.
            </p>
          </section>
        ) : (
          <section className="ftb-design">
            <h3>우리 손길을 남겨요</h3>
            <div className="ftb-designs">
              {(['star', 'heart'] as const).map((design, index) => (
                <button
                  type="button"
                  ref={index === 0 ? designFirst : undefined}
                  key={design}
                  disabled={state.stage === 'complete'}
                  aria-pressed={state.design === design}
                  onClick={() => act({ type: 'design', design })}
                >
                  <DesignIcon design={design} />
                  <span>
                    <strong>
                      {design === 'star' ? '반짝이는 별' : '따뜻한 하트'}
                    </strong>
                    <small>
                      {design === 'star'
                        ? '숲길에서 반짝, 다시 찾을 표식'
                        : '같이 만들었다는 작은 약속'}
                    </small>
                  </span>
                  {state.design === design && <b aria-hidden="true">✓</b>}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="ftb-finish"
              disabled={!state.design || state.stage === 'complete'}
              onClick={() => act({ type: 'finish' })}
            >
              {state.stage === 'complete'
                ? '우리 작품을 완성했어요'
                : '이 모습으로 완성하기'}
              <span aria-hidden="true"> →</span>
            </button>
            <p className="ftb-reassurance">
              완성 버튼을 누르면 이 장식이 우리 모험에 남아요.
            </p>
          </section>
        )}
        <output className="ftb-live" aria-live="polite" aria-atomic="true">
          {announcement}
        </output>
      </div>
    </div>
  );
}
