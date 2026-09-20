'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Heart,
  Home,
  ImagePlus,
  Leaf,
  LoaderCircle,
  MessageCircle,
  Music2,
  Palette,
  Printer,
  RotateCcw,
  Send,
  Settings2,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { CompanionWorld, type CompanionWorldHandle } from './companion-world';
import {
  createCompanionSave,
  loadCompanionSave,
  saveCompanionSave,
  clearCompanionSave,
  type CompanionSave,
  type CompanionStoryBook,
} from './companion-save';
import {
  initialForestState,
  getForestView,
  transitionForest,
  getForestEnding,
  type ForestEvent,
} from './forest-story';
import type { CreatureAppearance, CreatureKind } from './creature-types';
import './companion.css';

const kinds: {
  id: CreatureKind;
  name: string;
  icon: string;
  description: string;
}[] = [
  {
    id: 'sprout',
    name: '새싹콩',
    icon: '🌱',
    description: '작은 잎사귀와 동그란 귀',
  },
  {
    id: 'bunny',
    name: '토끼콩',
    icon: '🐰',
    description: '쫑긋한 귀, 폭신한 발',
  },
  {
    id: 'cat',
    name: '고양콩',
    icon: '🐱',
    description: '귀여운 삼각 귀와 꼬리',
  },
  { id: 'bear', name: '곰콩', icon: '🐻', description: '꼬마 곰의 포근한 품' },
];
const palettes = [
  { name: '바닐라 숲', body: '#fff0d9', accent: '#85bca2' },
  { name: '복숭아 우유', body: '#f8d9cf', accent: '#c1879f' },
  { name: '구름 소다', body: '#dcecf1', accent: '#80a5c1' },
  { name: '라일락 꿈', body: '#e6dcf2', accent: '#a99bc8' },
  { name: '꿀단지', body: '#ecd4ad', accent: '#c18c62' },
];
const bellNames: Record<string, string> = {
  'bell-dew': '물방울',
  'bell-leaf': '나뭇잎',
  'bell-star': '별빛',
};
const notes: Record<string, number> = {
  'bell-dew': 523.25,
  'bell-leaf': 659.25,
  'bell-star': 783.99,
};
type Props = {
  onExit: () => void;
  onDrawing: () => void;
  sourceImage?: string | null;
  initialName?: string;
  age?: string;
};

export default function CompanionExperience({
  onExit,
  onDrawing,
  sourceImage,
  initialName,
  age = '7–9세',
}: Props) {
  const [save, setSave] = useState<CompanionSave>(() => createCompanionSave());
  const [hydrated, setHydrated] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [mode, setMode] = useState<'home' | 'forest'>('home');
  const [panel, setPanel] = useState<'customize' | 'books'>('customize');
  const [notice, setNotice] = useState('안녕! 나는 몽글. 우리 같이 놀까?');
  const [walking, setWalking] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [sound, setSound] = useState(false);
  const [activeNote, setActiveNote] = useState<string | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [book, setBook] = useState<CompanionStoryBook | null>(null);
  const [page, setPage] = useState(0);
  const [settings, setSettings] = useState(false);
  const [resetPrompt, setResetPrompt] = useState(false);
  const [chat, setChat] = useState(false);
  const [consent, setConsent] = useState(false);
  const [chatAge, setChatAge] = useState(age);
  const [messages, setMessages] = useState<
    { role: 'user' | 'assistant'; content: string }[]
  >([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [chatStatus, setChatStatus] = useState('');
  const world = useRef<CompanionWorldHandle>(null);
  const gameStage = useRef<HTMLElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const audio = useRef<AudioContext | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const chatAbort = useRef<AbortController | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const saveRef = useRef(save);
  const didHydrate = useRef(false);
  const mounted = useRef(false);
  const colorRequest = useRef(0);
  const soundRef = useRef(sound);
  const commitSave = useCallback(
    (update: CompanionSave | ((current: CompanionSave) => CompanionSave)) => {
      const next =
        typeof update === 'function' ? update(saveRef.current) : update;
      saveRef.current = next;
      setSave(next);
    },
    [],
  );
  const forest = save.forest ?? initialForestState();
  const view = getForestView(forest);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || didHydrate.current) return;
      const existing = loadCompanionSave();
      const current =
        existing ??
        createCompanionSave({ name: initialName?.trim() || '몽글' });
      commitSave(current);
      didHydrate.current = true;
      setNotice(
        `안녕! 나는 ${current.name}. ${existing ? '다시 만나서 반가워!' : '우리 같이 놀까?'}`,
      );
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [initialName, commitSave]);
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    // An empty name while editing is valid UI state, but never a corrupt save.
    const result = saveCompanionSave({
      ...save,
      name: save.name.trim() || '몽글',
    });
    queueMicrotask(() => {
      if (!cancelled) setSaveError(result.ok ? '' : result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [save, hydrated]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      timers.current.forEach(clearTimeout);
      chatAbort.current?.abort();
      chatAbort.current = null;
      void audio.current?.close().catch(() => {});
      audio.current = null;
    };
  }, []);
  useEffect(() => {
    soundRef.current = sound;
    if (!sound) void audio.current?.suspend().catch(() => {});
  }, [sound]);
  useEffect(() => {
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    chatEnd.current?.scrollIntoView({
      block: 'nearest',
      behavior: reduced ? 'instant' : 'smooth',
    });
  }, [messages, busy]);
  useEffect(() => {
    const current = dialog.current;
    if (!current) return;
    if (book || chat || settings) {
      if (!current.open) current.showModal();
    } else if (current.open) current.close();
  }, [book, chat, settings]);
  function updateAppearance(change: Partial<CreatureAppearance>) {
    commitSave((s) => ({
      ...s,
      appearance: { ...s.appearance, ...change },
      updatedAt: Date.now(),
    }));
  }
  const playTone = useCallback((id: string, delay = 0) => {
    if (!soundRef.current) return;
    try {
      const context = audio.current ?? new AudioContext();
      audio.current = context;
      void context.resume().catch(() => {});
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = 'sine';
      osc.frequency.value = notes[id] ?? 660;
      const start = context.currentTime + delay;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.075, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.8);
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start(start);
      osc.stop(start + 0.9);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    } catch {
      /* Sound is optional; visual cues stay available. */
    }
  }, []);
  const replayMelody = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const melody = getForestView(
      saveRef.current.forest ?? initialForestState(),
    ).melody;
    setReplaying(true);
    melody.forEach((id, index) => {
      timers.current.push(
        setTimeout(() => {
          setActiveNote(id);
          playTone(id);
        }, index * 720),
      );
    });
    timers.current.push(
      setTimeout(() => {
        setActiveNote(null);
        setReplaying(false);
      }, melody.length * 720),
    );
  }, [playTone]);
  const dispatch = useCallback(
    (event: ForestEvent) => {
      const old = saveRef.current;
      const previous = old.forest ?? initialForestState();
      const next = transitionForest(previous, event);
      const ending = getForestEnding(next);
      const timestamp = Date.now();
      let nextSave = { ...old, forest: next, updatedAt: timestamp };
      if (ending && previous.chapter !== 'complete') {
        const accessory =
          next.owlChoice === 'invite'
            ? ('scarf' as const)
            : ('flower' as const);
        const story: CompanionStoryBook = {
          id: `forest-${timestamp}-${old.completedAdventures + 1}`,
          title: ending.title,
          pages: ending.paragraphs,
          createdAt: timestamp,
          ending: next.ending ?? 'sky',
        };
        nextSave = {
          ...nextSave,
          completedAdventures: old.completedAdventures + 1,
          unlockedAccessories: Array.from(
            new Set([...old.unlockedAccessories, accessory]),
          ),
          storyBooks: [story, ...old.storyBooks].slice(0, 10),
        };
        world.current?.react('celebrate');
      }
      commitSave(nextSave);
      setWalking('');
      if (event.type === 'interact' && event.id.startsWith('bell-')) {
        playTone(event.id);
        setActiveNote(event.id);
        timers.current.push(setTimeout(() => setActiveNote(null), 550));
      }
      if (
        (event.type === 'choose-owl' ||
          (event.type === 'interact' && event.id === 'owl-grove')) &&
        next.owlChoice &&
        next.chapter === 'grove'
      )
        replayMelody();
    },
    [commitSave, playTone, replayMelody],
  );
  function goTo(id: string) {
    if (unavailable) dispatch({ type: 'interact', id });
    else {
      if (window.matchMedia('(max-width: 760px)').matches) {
        gameStage.current?.scrollIntoView({
          block: 'start',
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)')
            .matches
            ? 'instant'
            : 'smooth',
        });
      }
      world.current?.walkTo(id);
    }
  }
  function startAdventure() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setActiveNote(null);
    setReplaying(false);
    const current = saveRef.current;
    if (!current.forest || current.forest.chapter === 'complete')
      commitSave((s) => ({
        ...s,
        forest: initialForestState(),
        updatedAt: Date.now(),
      }));
    setWalking('');
    setMode('forest');
  }
  function goHome(showBooks = false) {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setActiveNote(null);
    setReplaying(false);
    setWalking('');
    setMode('home');
    if (showBooks) setPanel('books');
  }
  function closeDialog() {
    setBook(null);
    setChat(false);
    setSettings(false);
    setResetPrompt(false);
    chatAbort.current?.abort();
    chatAbort.current = null;
    setChatStatus('');
    setBusy(false);
  }
  async function extractColors(url: string) {
    const request = ++colorRequest.current;
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (!mounted.current || request !== colorRequest.current) return;
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error();
      ctx.drawImage(image, 0, 0, 64, 64);
      const data = ctx.getImageData(0, 0, 64, 64).data;
      const buckets = new Map<string, { count: number; rgb: number[] }>();
      for (let i = 0; i < data.length; i += 4) {
        const rgb = [data[i], data[i + 1], data[i + 2]];
        if (
          data[i + 3] < 180 ||
          Math.max(...rgb) - Math.min(...rgb) < 22 ||
          Math.min(...rgb) > 228
        )
          continue;
        const key = rgb.map((v) => Math.round(v / 40)).join(',');
        const b = buckets.get(key);
        if (b) b.count++;
        else buckets.set(key, { count: 1, rgb });
      }
      const main = [...buckets.values()].sort((a, b) => b.count - a.count)[0]
        ?.rgb;
      if (!main) {
        setNotice(
          '색이 적은 그림이네! 아래에서 친구에게 어울리는 색을 골라 줘.',
        );
        return;
      }
      const toHex = (mix: number) =>
        '#' +
        main
          .map((v) =>
            Math.round(v * (1 - mix) + 255 * mix)
              .toString(16)
              .padStart(2, '0'),
          )
          .join('');
      updateAppearance({ bodyColor: toHex(0.75), accentColor: toHex(0.22) });
      setNotice('네 그림에서 찾은 색으로 옷을 입었어! 모양도 골라 줄래?');
      world.current?.react('wave');
    } catch {
      if (mounted.current && request === colorRequest.current)
        setNotice(
          '사진을 읽지 못했어요. JPG·PNG·WebP 그림을 다시 골라 주세요.',
        );
    }
  }
  async function uploadColors(file: File | undefined) {
    if (!file) return;
    if (
      !/^image\/(jpeg|png|webp)$/.test(file.type) ||
      file.size > 10 * 1024 * 1024
    ) {
      setNotice('10MB 이하의 JPG·PNG·WebP 그림을 골라 주세요.');
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      await extractColors(url);
    } finally {
      URL.revokeObjectURL(url);
      if (upload.current) upload.current.value = '';
    }
  }
  async function sendChat() {
    const message = input.trim();
    if (!message || busy || chatAbort.current || !consent) return;
    const history = messages.slice(-8);
    setMessages((items) => [...items, { role: 'user', content: message }]);
    setInput('');
    setBusy(true);
    setChatStatus('');
    const controller = new AbortController();
    chatAbort.current = controller;
    const timeout = setTimeout(() => controller.abort(), 32000);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          history,
          age: chatAge,
          persona: {
            name: save.name,
            likes: '숲의 작은 발견과 이야기',
            traits: '다정하고 호기심이 많음',
            ability: '친구들과 달빛 숲을 밝히기',
            quirk: '기쁘면 귀가 살랑거림',
          },
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error();
      const result = (await response.json()) as {
        text?: string;
        safety?: string;
      };
      if (chatAbort.current !== controller || controller.signal.aborted) return;
      if (typeof result.text !== 'string' || !result.text.trim())
        throw new Error();
      setMessages((items) => [
        ...items,
        { role: 'assistant', content: result.text as string },
      ]);
      if (result.safety === 'fallback')
        setChatStatus(
          '지금은 AI 연결 대신 준비된 짧은 대답을 들려주고 있어요.',
        );
      world.current?.react('wave');
    } catch {
      if (chatAbort.current === controller)
        setChatStatus(
          '지금은 이야기를 보내지 못했어요. 잠시 뒤 다시 이야기해 주세요.',
        );
    } finally {
      clearTimeout(timeout);
      if (chatAbort.current === controller) {
        setBusy(false);
        chatAbort.current = null;
      }
    }
  }
  function openBook(item: CompanionStoryBook) {
    setBook(item);
    setPage(0);
  }
  return (
    <main
      className={`cw-app cw-mode-${mode}`}
      aria-busy={!hydrated}
      inert={!hydrated}
    >
      <header className="cw-header">
        <button
          className="cw-brand"
          onClick={onExit}
          aria-label="그림친구 처음으로"
        >
          <span>✦</span>그림친구<small>작은 상상이 사는 곳</small>
        </button>
        <nav aria-label="친구 메뉴">
          <button
            className={mode === 'home' ? 'is-active' : ''}
            onClick={() => goHome()}
          >
            <Home size={17} />
            친구의 집
          </button>
          <button
            className={mode === 'forest' ? 'is-active' : ''}
            onClick={startAdventure}
          >
            <Leaf size={17} />
            달빛 숲
          </button>
        </nav>
        <button
          className="cw-icon"
          aria-label="소리와 저장 설정"
          onClick={() => setSettings(true)}
        >
          <Settings2 size={20} />
        </button>
      </header>
      {saveError && (
        <div className="cw-alert" role="alert">
          {saveError} 이 창에서는 계속 놀 수 있지만, 창을 닫으면 이번 변경이
          사라질 수 있어요.
        </div>
      )}
      {mode === 'home' ? (
        <div className="cw-home-layout">
          <section className="cw-home-stage" aria-label="내 입체 친구">
            <div className="cw-home-heading">
              <span className="cw-eyebrow">HELLO, LITTLE FRIEND</span>
              <h1>
                만나서 반가워,
                <br />
                <em>{save.name}!</em>
              </h1>
              <p>
                살랑이는 귀, 반짝이는 눈.
                <br />
                너와 첫 모험을 기다리고 있어.
              </p>
            </div>
            <CompanionWorld
              ref={world}
              mode="home"
              appearance={save.appearance}
              forest={forest}
              onInteract={() => {}}
              onPet={() => {
                setNotice('헤헤, 간지러워! 한 번 더 쓰다듬어 줄래?');
                playTone('bell-leaf');
              }}
              onStatus={setWalking}
              onUnavailable={() => setUnavailable(true)}
              onReady={() => setUnavailable(false)}
            />
            <output className="cw-bubble">{notice}</output>
            <div className="cw-pet-controls">
              <button
                className="cw-icon"
                onClick={() => world.current?.turn(-1)}
                aria-label="친구 왼쪽 보기"
              >
                <RotateCcw size={17} />
              </button>
              <button
                onClick={() => {
                  world.current?.react('wave');
                  setNotice('안녕! 오늘은 어떤 걸 발견하게 될까?');
                }}
              >
                <Heart size={17} />
                인사하기
              </button>
              <button
                onClick={() => {
                  world.current?.react('hop');
                  setNotice('폴짝! 준비 운동 끝!');
                }}
              >
                <Sparkles size={17} />
                폴짝!
              </button>
              <button
                className="cw-icon"
                onClick={() => world.current?.turn(1)}
                aria-label="친구 오른쪽 보기"
              >
                <RotateCcw size={17} style={{ transform: 'scaleX(-1)' }} />
              </button>
            </div>
            <small className="cw-stage-hint">
              친구를 눌러 쓰다듬거나, 화면을 드래그해 돌려 보세요.
            </small>
          </section>
          <aside className="cw-home-side">
            <div className="cw-tabs">
              <button
                className={panel === 'customize' ? 'is-active' : ''}
                onClick={() => setPanel('customize')}
              >
                <Palette size={17} />
                나만의 친구
              </button>
              <button
                className={panel === 'books' ? 'is-active' : ''}
                onClick={() => setPanel('books')}
              >
                <BookOpen size={17} />
                우리 책장{' '}
                {save.storyBooks.length > 0 && <b>{save.storyBooks.length}</b>}
              </button>
            </div>
            {panel === 'customize' ? (
              <div className="cw-customize">
                <label className="cw-label" htmlFor="companion-name">
                  친구에게 이름을 지어 주세요
                </label>
                <input
                  id="companion-name"
                  maxLength={24}
                  value={save.name}
                  onChange={(e) =>
                    commitSave((s) => ({
                      ...s,
                      name: e.target.value,
                      updatedAt: Date.now(),
                    }))
                  }
                  onBlur={() => {
                    if (!save.name.trim())
                      commitSave((s) => ({
                        ...s,
                        name: '몽글',
                        updatedAt: Date.now(),
                      }));
                  }}
                  placeholder="몽글"
                  autoComplete="off"
                />
                <fieldset>
                  <legend>어떤 친구를 만날까?</legend>
                  <div className="cw-kinds">
                    {kinds.map((kind) => (
                      <button
                        key={kind.id}
                        className={
                          save.appearance.kind === kind.id ? 'is-selected' : ''
                        }
                        aria-pressed={save.appearance.kind === kind.id}
                        title={kind.description}
                        onClick={() => updateAppearance({ kind: kind.id })}
                      >
                        <span>{kind.icon}</span>
                        {kind.name}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>좋아하는 색을 입혀요</legend>
                  <div className="cw-palettes">
                    {palettes.map((p) => (
                      <button
                        key={p.name}
                        title={p.name}
                        aria-label={p.name}
                        aria-pressed={save.appearance.bodyColor === p.body}
                        onClick={() =>
                          updateAppearance({
                            bodyColor: p.body,
                            accentColor: p.accent,
                          })
                        }
                        style={{
                          background: `linear-gradient(135deg,${p.body} 55%,${p.accent} 55%)`,
                        }}
                      >
                        {save.appearance.bodyColor === p.body && (
                          <Check size={18} />
                        )}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <input
                  ref={upload}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  onChange={(e) => void uploadColors(e.target.files?.[0])}
                />
                <button
                  className="cw-outline cw-color-upload"
                  onClick={() =>
                    sourceImage
                      ? void extractColors(sourceImage)
                      : upload.current?.click()
                  }
                >
                  <ImagePlus size={18} />
                  {sourceImage
                    ? '내 그림의 색 가져오기'
                    : '사진·그림에서 색 가져오기'}
                  <ArrowRight size={16} />
                </button>
                <p className="cw-fine">
                  그림의 색을 입체 친구에게 입혀요. 사진은 기기 안에서만 읽고
                  저장하거나 전송하지 않아요. 모양은 위의 4종 중 골라요.
                </p>
                <div className="cw-accessories">
                  <span>작은 선물</span>
                  {(['star', 'flower', 'scarf'] as const).map((item, index) => (
                    <button
                      key={item}
                      disabled={!save.unlockedAccessories.includes(item)}
                      aria-pressed={save.equippedAccessory === item}
                      title={
                        save.unlockedAccessories.includes(item)
                          ? ['별 목걸이', '꽃 장식', '포근한 스카프'][index]
                          : '달빛 숲을 마치면 받을 수 있어요'
                      }
                      onClick={() =>
                        commitSave((s) => ({
                          ...s,
                          equippedAccessory: item,
                          appearance: { ...s.appearance, accessory: item },
                          updatedAt: Date.now(),
                        }))
                      }
                    >
                      {['⭐', '🌸', '🧣'][index]}
                      {!save.unlockedAccessories.includes(item) && (
                        <small>모험 선물</small>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="cw-bookshelf">
                <h2>우리가 만든 이야기</h2>
                <p>선택이 달라지면 책 속 이야기도 달라져요.</p>
                {save.storyBooks.length === 0 ? (
                  <div className="cw-empty-book">
                    <BookOpen size={40} />
                    <strong>첫 번째 책을 기다리는 중</strong>
                    <span>
                      달빛 숲에서 모험을 마치면
                      <br />
                      여기에 동화책이 생겨요.
                    </span>
                  </div>
                ) : (
                  save.storyBooks.map((item) => (
                    <button
                      className="cw-book-spine"
                      key={item.id}
                      onClick={() => openBook(item)}
                    >
                      <span>✦</span>
                      <div>
                        <strong>{item.title}</strong>
                        <small>
                          {new Date(item.createdAt).toLocaleDateString('ko-KR')}{' '}
                          · {item.pages.length}장
                        </small>
                      </div>
                      <ChevronRight size={18} />
                    </button>
                  ))
                )}
              </div>
            )}
            <button className="cw-adventure-card" onClick={startAdventure}>
              <span className="cw-adventure-icon">☾</span>
              <span>
                <small>우리의 첫 번째 모험 · 약 5분</small>
                <strong>
                  {save.forest && save.forest.chapter !== 'complete'
                    ? '달빛 숲, 이어서 떠나기'
                    : '달빛 숲의 작은 약속'}
                </strong>
                <span>잠든 숲을 함께 깨워 줄래?</span>
              </span>
              <ArrowRight size={23} />
            </button>
            <div className="cw-secondary-actions">
              <button onClick={() => setChat(true)}>
                <MessageCircle size={17} />
                친구와 이야기
              </button>
              <button onClick={onDrawing}>
                <ImagePlus size={17} />
                AI 그림 변환
              </button>
            </div>
          </aside>
        </div>
      ) : (
        <div className="cw-forest-layout">
          <section ref={gameStage} className="cw-game-stage">
            <div className="cw-game-title">
              <span className="cw-eyebrow">MOONLIGHT FOREST</span>
              <h1>{view.title}</h1>
              <span>{view.chapterLabel}</span>
            </div>
            <CompanionWorld
              ref={world}
              mode="forest"
              appearance={save.appearance}
              forest={forest}
              onInteract={(id) => dispatch({ type: 'interact', id })}
              onPet={() => {}}
              onStatus={setWalking}
              onUnavailable={() => setUnavailable(true)}
              onReady={() => setUnavailable(false)}
            />
            <div className="cw-world-instructions">
              {unavailable
                ? '이야기 모드 · 아래 행동 버튼으로 함께해요'
                : '땅을 눌러 걷기 · 반짝이는 물건 누르기 · 방향키로 이동'}
            </div>
            <button
              className="cw-sound"
              aria-label={sound ? '효과음 끄기' : '효과음 켜기'}
              onClick={() => setSound((v) => !v)}
            >
              {sound ? <Volume2 size={19} /> : <VolumeX size={19} />}
            </button>
          </section>
          <aside className="cw-story-panel">
            <div className="cw-progress">
              <span>우리의 발자국</span>
              <b>{view.progress}%</b>
              <div>
                <i style={{ width: `${view.progress}%` }} />
              </div>
            </div>
            <div className="cw-narrator">
              <span>🦉</span>
              <div>
                <small>숲의 이야기</small>
                <p aria-live="polite">{view.dialogue}</p>
              </div>
            </div>
            <div className="cw-objective">
              <Sparkles size={18} />
              <strong>{view.objective}</strong>
            </div>
            {walking && <output className="cw-walking">{walking}</output>}
            {view.choices.length > 0 && (
              <div className="cw-choices">
                {view.choices.map((choice) => (
                  <button
                    key={choice.id}
                    onClick={() => dispatch(choice.event)}
                  >
                    <strong>{choice.label}</strong>
                    <span>{choice.description}</span>
                    <ArrowRight size={17} />
                  </button>
                ))}
              </div>
            )}
            {forest.chapter === 'grove' && forest.owlChoice && (
              <div className="cw-melody">
                <button
                  className="cw-outline"
                  onClick={replayMelody}
                  disabled={replaying}
                >
                  <Music2 size={17} />
                  {replaying ? '노래를 들어 봐요…' : '종소리 순서 다시 듣기'}
                </button>
                <div aria-label="종을 울리는 순서">
                  {view.melody.map((id, index) => (
                    <span
                      key={`${id}-${index}`}
                      className={`${index < forest.melody ? 'is-done' : ''} ${activeNote === id ? 'is-playing' : ''}`}
                    >
                      {index + 1}. {bellNames[id]}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {forest.chapter !== 'complete' && (
              <div className="cw-nearby">
                <h2>{unavailable ? '함께할 행동' : '어디로 가 볼까?'}</h2>
                {view.hotspots
                  .filter((h) => h.available && !h.complete)
                  .map((h) => (
                    <button
                      key={h.id}
                      className={activeNote === h.id ? 'is-playing' : ''}
                      onClick={() => goTo(h.id)}
                    >
                      <span>
                        {h.kind === 'wood'
                          ? '🪵'
                          : h.kind === 'seed'
                            ? '🌱'
                            : h.kind === 'flower'
                              ? '🌷'
                              : h.kind === 'bell'
                                ? '🔔'
                                : h.kind === 'water'
                                  ? '💧'
                                  : h.kind === 'lantern'
                                    ? '✨'
                                    : h.kind === 'npc'
                                      ? '🦉'
                                      : '✦'}
                      </span>
                      {h.label}
                      <ChevronRight size={16} />
                    </button>
                  ))}
              </div>
            )}
            {forest.chapter === 'complete' && (
              <div className="cw-completed">
                <span>✧</span>
                <h2>우리가 숲을 깨웠어!</h2>
                <p>
                  {view.reward}
                  <br />
                  친구의 집에 새로운 장식과 동화책이 도착했어요.
                </p>
                <button
                  className="cw-primary"
                  onClick={() =>
                    save.storyBooks[0] && openBook(save.storyBooks[0])
                  }
                >
                  <BookOpen size={18} />
                  우리 동화책 펼치기
                </button>
                <button className="cw-outline" onClick={() => goHome(true)}>
                  <Home size={18} />
                  친구의 집으로
                </button>
              </div>
            )}
            <p className="cw-autosave">
              <Check size={13} />
              {saveError
                ? '이번 모험은 현재 창에서만 유지돼요'
                : '발자국은 이 기기에 자동으로 남아요.'}
            </p>
          </aside>
        </div>
      )}
      <footer className="cw-footer">
        <span>작은 선택이 모여, 우리만의 이야기가 돼요.</span>
        <button onClick={() => setSettings(true)}>
          보호자 안내 · 저장 설정
        </button>
      </footer>
      <dialog
        ref={dialog}
        className={`cw-dialog ${book ? 'cw-book-dialog' : ''}`}
        onCancel={closeDialog}
        aria-label={
          book
            ? book.title
            : chat
              ? `${save.name}와 도란도란`
              : '보호자 안내와 저장 설정'
        }
      >
        <button
          className="cw-dialog-close cw-icon"
          aria-label="닫기"
          onClick={closeDialog}
        >
          <X size={22} />
        </button>
        {book && (
          <article className="cw-storybook">
            <div className="cw-book-art">
              {/* These local WebP pages are already sized and must also print without an image-proxy dependency. */}
              {/* eslint-disable-next-line next/no-img-element */}
              <img
                src={`/moon-forest-scene-${Math.min(page + 1, 5)}.webp`}
                alt={`달빛 숲 이야기 ${page + 1}장 삽화`}
                decoding="async"
              />
              <span>나와 {save.name}, 둘만의 모험</span>
              <h2>{book.title}</h2>
            </div>
            <div className="cw-book-text">
              <span className="cw-eyebrow">OUR LITTLE STORY · {page + 1}</span>
              <p>{book.pages[page]}</p>
              <small>이야기를 만든 사람 · 나와 {save.name}</small>
              <div className="cw-book-navigation">
                <button
                  aria-label="이전 장"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft />
                </button>
                <span>
                  {page + 1} / {book.pages.length}
                </span>
                <button
                  aria-label="다음 장"
                  disabled={page === book.pages.length - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight />
                </button>
              </div>
              <button className="cw-print" onClick={() => window.print()}>
                <Printer size={16} />이 장 인쇄하기
              </button>
            </div>
          </article>
        )}
        {chat && (
          <section className="cw-chat">
            <span className="cw-eyebrow">A LITTLE CONVERSATION</span>
            <h2>{save.name}와 도란도란</h2>
            {!consent ? (
              <div className="cw-chat-consent">
                <p>
                  AI가 들려주는 상상 이야기예요. 실제 사람이나 생명체는
                  아니에요. 대화는 답변을 만들기 위해 OpenAI에 전송되며 이
                  기기의 책장에는 저장하지 않아요.
                </p>
                <label>
                  듣는 친구의 나이
                  <select
                    value={chatAge}
                    onChange={(e) => setChatAge(e.target.value)}
                  >
                    <option>4–6세</option>
                    <option>7–9세</option>
                    <option>10–12세</option>
                  </select>
                </label>
                <p>실제 이름·주소·학교는 말하지 않아도 괜찮아요.</p>
                <button className="cw-primary" onClick={() => setConsent(true)}>
                  보호자와 확인했어요 · 이야기 시작
                </button>
              </div>
            ) : (
              <>
                <div className="cw-messages" aria-live="polite">
                  {messages.length === 0 && (
                    <p className="assistant">
                      안녕, 나는 {save.name}! 달빛 숲에서 어떤 친구를 만나고
                      싶어?
                    </p>
                  )}
                  {messages.map((m, i) => (
                    <p key={i} className={m.role}>
                      {m.content}
                    </p>
                  ))}
                  {busy && <p className="assistant">어떤 이야기를 들려줄까…</p>}
                  <div ref={chatEnd} />
                </div>
                {chatStatus && (
                  <output className="cw-fine">{chatStatus}</output>
                )}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void sendChat();
                  }}
                >
                  <input
                    value={input}
                    maxLength={400}
                    onChange={(e) => setInput(e.target.value)}
                    aria-label="친구에게 할 이야기"
                    placeholder="오늘은 어떤 상상을 해 볼까?"
                  />
                  <button
                    disabled={busy || !input.trim()}
                    aria-label="이야기 보내기"
                  >
                    {busy ? (
                      <LoaderCircle className="cw-spin" />
                    ) : (
                      <Send size={20} />
                    )}
                  </button>
                </form>
                <small>
                  AI의 말이 이상하거나 마음이 불편하면 보호자에게 알려 주세요.
                </small>
              </>
            )}
          </section>
        )}
        {settings && (
          <section className="cw-settings">
            <span className="cw-eyebrow">FOR OUR GROWN-UPS</span>
            <h2>안심하고 함께 놀아요</h2>
            <p>
              입체 친구와 숲 모험은 API 없이 기기에서 작동합니다. 친구의
              이름·색·모험 선택·완성한 동화는 이 브라우저에만 저장돼요. 다른
              기기로는 옮겨지지 않아요.
            </p>
            <p>
              사진에서 색을 가져올 때 사진은 전송되지 않습니다. 별도의 ‘AI 그림
              변환’과 ‘친구와 이야기’는 안내 후 OpenAI를 사용해요.
            </p>
            <button className="cw-outline" onClick={() => setSound((v) => !v)}>
              {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}효과음{' '}
              {sound ? '켜짐' : '꺼짐'}
            </button>
            <p className="cw-fine">
              기기 설정의 ‘동작 줄이기’를 따르며, 소리 없이도 모든 모험을 마칠
              수 있습니다.
            </p>
            {resetPrompt ? (
              <div className="cw-reset-confirm">
                <strong>친구와 이 기기의 동화책을 모두 지울까요?</strong>
                <p>지운 기록은 되돌릴 수 없어요.</p>
                <button
                  className="cw-danger"
                  onClick={() => {
                    const result = clearCompanionSave();
                    if (!result.ok) {
                      setSaveError(result.error);
                      return;
                    }
                    commitSave(createCompanionSave());
                    colorRequest.current++;
                    timers.current.forEach(clearTimeout);
                    timers.current = [];
                    setActiveNote(null);
                    setReplaying(false);
                    setConsent(false);
                    setMessages([]);
                    setInput('');
                    setNotice('안녕! 나는 몽글. 우리 같이 놀까?');
                    setPanel('customize');
                    setMode('home');
                    closeDialog();
                  }}
                >
                  모든 기록 지우기
                </button>
                <button
                  className="cw-outline"
                  onClick={() => setResetPrompt(false)}
                >
                  그대로 둘래요
                </button>
              </div>
            ) : (
              <button
                className="cw-reset-link"
                onClick={() => setResetPrompt(true)}
              >
                이 기기의 친구·모험 기록 지우기
              </button>
            )}
          </section>
        )}
      </dialog>
    </main>
  );
}
