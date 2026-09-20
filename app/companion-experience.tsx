'use client';
/* eslint-disable next/no-img-element -- Locally kept data-URL portraits must never be sent to an image optimizer. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Heart,
  Home,
  ImagePlus,
  Leaf,
  LoaderCircle,
  MessageCircle,
  Music2,
  Palette,
  RotateCcw,
  Send,
  Settings2,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { CompanionWorld, type CompanionWorldHandle } from './companion-world';
import CompanionStorybook from './companion-storybook';
import { drawingPalette } from './companion-palette';
import { useCompanionStorage } from './use-companion-storage';
import { useDrawingAsset } from './use-drawing-asset';
import {
  keepDrawingAsset,
  portableArtwork,
  downloadLocalFile,
  putDrawingAssets,
  clearDrawingAssets,
  listDrawingAssets,
  validDrawingAsset,
  artworkId,
  type DrawingAsset,
} from './drawing-assets';
import {
  type CompanionSave,
  type CompanionStoryBook,
  serializeCompanionBackup,
  parseCompanionBackup,
  readCompanionSave,
  COMPANION_SAVE_KEY,
} from './companion-save';
import {
  initialForestState,
  getForestView,
  transitionForest,
  getForestEnding,
  type ForestEvent,
  type ForestDifficulty,
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
  { name: '바닐라 숲', body: '#f4dfc1', accent: '#91c6a2' },
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
  incomingArtwork?: {
    png: string;
    name: string;
    persona: { likes: string; traits: string; ability: string; quirk: string };
  } | null;
  onArtworkAccepted?: () => void;
};

export default function CompanionExperience({
  onExit,
  onDrawing,
  sourceImage,
  initialName,
  age = '7–9세',
  incomingArtwork,
  onArtworkAccepted,
}: Props) {
  const {
    save,
    saveRef,
    commitSave,
    hydrated,
    saveError,
    blocked,
    reloadLatest,
    restoreSave,
    reset,
    flush,
  } = useCompanionStorage(initialName);
  const art = useDrawingAsset(save.appearance.drawingAssetId);
  const [artworkBusy, setArtworkBusy] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const artworkEpoch = useRef(0);
  const backupOperation = useRef(false);
  const [backupStatus, setBackupStatus] = useState('');
  const [pendingBackup, setPendingBackup] = useState<{
    save: CompanionSave;
    assets: DrawingAsset[];
  } | null>(null);
  const [artLibrary, setArtLibrary] = useState<DrawingAsset[]>([]);
  const backupInput = useRef<HTMLInputElement>(null);
  const acceptedArtwork = useRef<string | null>(null);
  const [mode, setMode] = useState<'home' | 'forest'>('home');
  const [panel, setPanel] = useState<'customize' | 'books'>('customize');
  const [notice, setNotice] = useState('안녕! 만나서 반가워. 우리 같이 놀까?');
  const [walking, setWalking] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [sound, setSound] = useState(false);
  const [activeNote, setActiveNote] = useState<string | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [book, setBook] = useState<CompanionStoryBook | null>(null);
  const [settings, setSettings] = useState(false);
  const [resetPrompt, setResetPrompt] = useState(false);
  const [resetAnswer, setResetAnswer] = useState('');
  const [chat, setChat] = useState(false);
  const [consent, setConsent] = useState(false);
  const [guardianAnswer, setGuardianAnswer] = useState('');
  const [guardianChecked, setGuardianChecked] = useState(false);
  const [guardianQuestion, setGuardianQuestion] = useState({ a: 17, b: 6 });
  const [colorBusy, setColorBusy] = useState(false);
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
  const mounted = useRef(false);
  const colorRequest = useRef(0);
  const soundRef = useRef(sound);
  const forest = save.forest ?? initialForestState();
  const liveAppearance = useMemo(
    () => ({
      ...save.appearance,
      ...(art.png ? { drawingImage: art.png } : {}),
    }),
    [save.appearance, art.png],
  );
  const view = getForestView(forest);
  useEffect(() => {
    if (
      !hydrated ||
      !incomingArtwork ||
      blocked ||
      acceptedArtwork.current === incomingArtwork.png
    )
      return;
    let canceled = false;
    const operation = ++artworkEpoch.current;
    const snapshot = readCompanionSave();
    if (snapshot.status !== 'ready' && snapshot.status !== 'empty') return;
    const generation = snapshot.snapshot.generation;
    const stillCurrent = () => {
      const latest = readCompanionSave();
      return (
        !canceled &&
        operation === artworkEpoch.current &&
        (latest.status === 'ready' || latest.status === 'empty') &&
        latest.snapshot.generation === generation
      );
    };
    queueMicrotask(() => {
      if (!canceled) setArtworkBusy(true);
    });
    void portableArtwork(incomingArtwork.png)
      .then((png) => {
        if (!stillCurrent())
          throw new Error('친구 보관이 취소됐어요. 다시 보관해 주세요.');
        return keepDrawingAsset(png, incomingArtwork.name, {
          expectedGeneration: generation,
          cancelled: () => !stillCurrent(),
          persona: incomingArtwork.persona,
        });
      })
      .then((asset) => {
        if (!stillCurrent()) {
          setArtworkBusy(false);
          if (!canceled) {
            acceptedArtwork.current = incomingArtwork.png;
            onArtworkAccepted?.();
          }
          return;
        }
        acceptedArtwork.current = incomingArtwork.png;
        commitSave((current) => ({
          ...current,
          name: incomingArtwork.name.trim() || current.name,
          persona: incomingArtwork.persona,
          appearance: { ...current.appearance, drawingAssetId: asset.id },
          updatedAt: Date.now(),
        }));
        setNotice(
          '네가 만든 바로 그 친구야! 같은 모습으로 숲에도, 우리 책에도 함께 갈게.',
        );
        setArtworkBusy(false);
        onArtworkAccepted?.();
      })
      .catch((error) => {
        if (!canceled) {
          acceptedArtwork.current = null;
          setBackupStatus(
            error instanceof Error
              ? error.message
              : '친구 그림을 보관하지 못했어요.',
          );
          if (!stillCurrent()) onArtworkAccepted?.();
        }
      })
      .finally(() => {
        if (!canceled) setArtworkBusy(false);
      });
    return () => {
      canceled = true;
    };
  }, [hydrated, incomingArtwork, blocked, commitSave, onArtworkAccepted]);
  useEffect(() => {
    void listDrawingAssets()
      .then(setArtLibrary)
      .catch(() => {});
  }, [save.appearance.drawingAssetId, artworkBusy]);
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
    const current = saveRef.current;
    const melody = getForestView(current.forest ?? initialForestState()).melody;
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
  }, [playTone, saveRef]);
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
          pages: ending.paragraphs.map((paragraph, index) =>
            index === 0
              ? paragraph.replace(
                  '작은 친구 둘이',
                  `나는 ${old.name.trim() || '몽글'}의 손을 잡고`,
                )
              : paragraph,
          ),
          createdAt: timestamp,
          ending: ending.paragraphs.at(-1) || ending.title,
          heroName: old.name.trim() || '몽글',
          heroAppearance: { ...old.appearance },
          choices: {
            route: next.route === 'garden' ? 'garden' : 'river',
            owl: next.owlChoice ?? 'listen',
            ending: next.ending ?? 'sky',
          },
        };
        nextSave = {
          ...nextSave,
          completedAdventures: old.completedAdventures + 1,
          unlockedAccessories: Array.from(
            new Set([...old.unlockedAccessories, accessory]),
          ),
          storyBooks: [story, ...old.storyBooks],
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
    [commitSave, playTone, replayMelody, saveRef],
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
    if (artworkBusy || art.loading || art.error) {
      setBackupStatus(
        art.error || '친구 모습을 준비하고 있어요. 잠깐만 기다려 주세요.',
      );
      return;
    }
    if (
      save.storyBooks.length >= 100 &&
      (!save.forest || save.forest.chapter === 'complete')
    ) {
      setBackupStatus(
        '책장에 100권이 모였어요. 먼저 보호자와 백업 파일을 보관해 주세요. 기존 책을 자동으로 지우지 않아요.',
      );
      setSettings(true);
      return;
    }
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setActiveNote(null);
    setReplaying(false);
    const current = saveRef.current;
    if (!current.forest || current.forest.chapter === 'complete')
      commitSave((s) => ({
        ...s,
        forest: initialForestState(
          s.playDifficulty ??
            (age.startsWith('4')
              ? 'simple'
              : age.startsWith('10')
                ? 'challenge'
                : 'standard'),
        ),
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
    setResetAnswer('');
    setGuardianAnswer('');
    setGuardianChecked(false);
    chatAbort.current?.abort();
    chatAbort.current = null;
    setChatStatus('');
    setBusy(false);
  }
  async function exportBackup() {
    setBackupStatus('친구와 책을 백업에 담고 있어요…');
    try {
      await flush();
      const exportSave = structuredClone(saveRef.current);
      const before = readCompanionSave();
      if (before.status !== 'ready' && before.status !== 'empty')
        throw new Error(
          '저장 공간의 상태를 확인하지 못했어요. 기존 기록을 덮어쓰지 않았어요.',
        );
      const exportGeneration = before.snapshot.generation;
      const serialized = serializeCompanionBackup(exportSave);
      if (!serialized.ok) throw new Error(serialized.error);
      const assets = await listDrawingAssets();
      const required = [
        exportSave.appearance.drawingAssetId,
        ...exportSave.storyBooks.map(
          (item) => item.heroAppearance?.drawingAssetId,
        ),
      ].filter(Boolean);
      if (
        assets.length > 100 ||
        required.some((id) => !assets.some((asset) => asset.id === id))
      )
        throw new Error(
          '책에 필요한 친구 그림이 일부 없어요. 그림이 포함된 기존 백업을 먼저 가져와 주세요. 불완전한 백업을 만들지는 않았어요.',
        );
      for (const asset of assets)
        if (
          !validDrawingAsset(asset) ||
          (await artworkId(asset.png)) !== asset.id
        )
          throw new Error('손상된 친구 그림이 있어 백업을 멈췄어요.');
      const backup = JSON.stringify({
        format: 'drawing-friend-family-backup',
        version: 1,
        record: JSON.parse(serialized.json),
        assets,
      });
      if (new TextEncoder().encode(backup).length > 32 * 1024 * 1024)
        throw new Error(
          '보관한 그림이 많아 전체 백업이 32MB를 넘었어요. 각 친구 그림도 별도로 저장해 주세요.',
        );
      const after = readCompanionSave();
      if (
        (after.status !== 'ready' && after.status !== 'empty') ||
        after.snapshot.generation !== exportGeneration
      )
        throw new Error(
          '백업을 만드는 동안 다른 창에서 기록을 지웠어요. 현재 기록으로 다시 시도해 주세요.',
        );
      downloadLocalFile(
        `그림친구-우리집-백업-${new Date().toISOString().slice(0, 10)}.json`,
        backup,
      );
      setBackupStatus(
        '백업 파일에 친구 그림·설정·모든 책을 담았어요. 사진 원본과 대화는 들어가지 않아요.',
      );
    } catch (error) {
      setBackupStatus(
        error instanceof Error ? error.message : '백업을 만들지 못했어요.',
      );
    }
  }
  async function inspectBackup(file?: File) {
    if (!file) return;
    try {
      if (file.size > 32 * 1024 * 1024)
        throw new Error('32MB 이하의 그림친구 백업 파일을 골라 주세요.');
      const raw: unknown = JSON.parse(await file.text());
      const wrapper = raw as {
        format?: string;
        version?: number;
        record?: unknown;
        assets?: unknown[];
      };
      if (
        wrapper.format !== 'drawing-friend-family-backup' ||
        wrapper.version !== 1 ||
        !Array.isArray(wrapper.assets) ||
        wrapper.assets.length > 100
      )
        throw new Error('지원하는 그림친구 백업 파일이 아니에요.');
      const checked = parseCompanionBackup(JSON.stringify(wrapper.record));
      if (!checked.ok) throw new Error(checked.error);
      if (!wrapper.assets.every(validDrawingAsset))
        throw new Error('백업 속 친구 그림 정보를 확인하지 못했어요.');
      const assets = wrapper.assets as DrawingAsset[];
      const ids = new Set(assets.map((asset) => asset.id));
      const needed = [
        checked.save.appearance.drawingAssetId,
        ...checked.save.storyBooks.map(
          (item) => item.heroAppearance?.drawingAssetId,
        ),
      ].filter(Boolean);
      if (needed.some((id) => !ids.has(id as string)))
        throw new Error(
          '백업에서 필요한 친구 그림이 빠져 있어요. 원래 기기에서 다시 백업해 주세요.',
        );
      setPendingBackup({ save: checked.save, assets });
      setBackupStatus('아직 바꾸지 않았어요. 아래 내용을 확인하고 가져오세요.');
    } catch (error) {
      setPendingBackup(null);
      setBackupStatus(
        error instanceof Error ? error.message : '백업 파일을 읽지 못했어요.',
      );
    } finally {
      if (backupInput.current) backupInput.current.value = '';
    }
  }
  async function importBackup() {
    if (!pendingBackup || backupOperation.current || artworkBusy) return;
    backupOperation.current = true;
    setBackupBusy(true);
    const operation = ++artworkEpoch.current;
    try {
      const before = readCompanionSave();
      if (before.status !== 'ready' && before.status !== 'empty')
        throw new Error('먼저 기존 기록의 저장 문제를 확인해 주세요.');
      await putDrawingAssets(pendingBackup.assets, {
        expectedGeneration: before.snapshot.generation,
      });
      const after = readCompanionSave();
      if (
        operation !== artworkEpoch.current ||
        (after.status !== 'ready' && after.status !== 'empty') ||
        after.snapshot.generation !== before.snapshot.generation
      )
        throw new Error('다른 창에서 기록이 바뀌어 가져오기를 멈췄어요.');
      const result = await restoreSave(pendingBackup.save, {
        expectedGeneration: before.snapshot.generation,
      });
      if (!result.ok) throw new Error(result.error);
      setArtLibrary(await listDrawingAssets());
      setPendingBackup(null);
      setBackupStatus(
        '친구와 책을 가져왔어요. 같은 책은 중복해서 넣지 않았어요.',
      );
    } catch (error) {
      setBackupStatus(
        error instanceof Error ? error.message : '백업을 가져오지 못했어요.',
      );
    } finally {
      backupOperation.current = false;
      setBackupBusy(false);
    }
  }
  async function extractColors(url: string) {
    const request = ++colorRequest.current;
    setColorBusy(true);
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
      const colors = drawingPalette(data);
      if (!colors) {
        setNotice(
          '색이 적은 그림이네! 아래에서 친구에게 어울리는 색을 골라 줘.',
        );
        return;
      }
      updateAppearance({
        bodyColor: colors.bodyColor,
        accentColor: colors.accentColor,
      });
      setNotice(
        colors.colorsFound === 2
          ? '네 그림에서 두 가지 색을 찾았어! 털과 장식에 나눠 입었지.'
          : colors.colorsFound === 0
            ? '연필로 그렸구나! 포근한 크림색 털과 연필빛 장식을 입혀 봤어. 다른 색도 골라 줄 수 있어.'
            : '네 그림의 색을 찾았어! 나한테 어울리는 무늬도 골라 줄래?',
      );
      world.current?.react('wave');
    } catch {
      if (mounted.current && request === colorRequest.current)
        setNotice(
          '사진을 읽지 못했어요. JPG·PNG·WebP 그림을 다시 골라 주세요.',
        );
    } finally {
      if (mounted.current && request === colorRequest.current)
        setColorBusy(false);
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
          consent: true,
          history,
          age: chatAge,
          persona: {
            name: save.name,
            likes: '숲의 작은 발견과 이야기',
            traits: '다정하고 호기심이 많음',
            ability: '친구들과 달빛 숲을 밝히기',
            quirk: '기쁘면 귀가 살랑거림',
            ...save.persona,
          },
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error();
      const result = (await response.json()) as {
        text?: string;
        safety?: string;
        clearHistory?: boolean;
      };
      if (chatAbort.current !== controller || controller.signal.aborted) return;
      if (typeof result.text !== 'string' || !result.text.trim())
        throw new Error();
      if (result.clearHistory) {
        setMessages([]);
        setChatStatus(result.text);
        return;
      }
      setMessages((items) => [
        ...(result.safety === 'redirected' || result.safety === 'urgent'
          ? items.slice(0, -1)
          : items),
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
    setSettings(false);
    setChat(false);
    setBook(item);
  }
  function openChat() {
    setGuardianQuestion({
      a: 13 + Math.floor(Math.random() * 14),
      b: 4 + Math.floor(Math.random() * 7),
    });
    setGuardianAnswer('');
    setGuardianChecked(false);
    setChat(true);
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
          aria-label="보호자와 함께 보기"
          onClick={() => setSettings(true)}
        >
          <Settings2 size={20} />
        </button>
      </header>
      {saveError && (
        <div className="cw-alert" role="alert">
          {saveError} 이 창에서는 계속 놀 수 있지만, 창을 닫으면 이번 변경이
          사라질 수 있어요.
          <button onClick={() => setSettings(true)}>백업·복구 열기</button>
        </div>
      )}
      {(backupStatus || artworkBusy || art.error) && (
        <output className="cw-alert">
          {artworkBusy
            ? '완성한 친구를 안전하게 보관하고 있어요…'
            : art.error || backupStatus}
        </output>
      )}
      {mode === 'home' ? (
        <div className="cw-home-layout">
          <section className="cw-home-stage" aria-label="내 입체 친구">
            <div className="cw-home-heading">
              <span className="cw-eyebrow">
                {save.appearance.drawingAssetId
                  ? '네 그림 속 모습 그대로, 우리의 친구'
                  : '너의 색으로 태어난 작은 친구'}
              </span>
              <h1>
                만나서 반가워,
                <br />
                <em>{save.name}!</em>
              </h1>
              <p>
                {save.appearance.drawingAssetId
                  ? '네가 만든 얼굴, 나만 아는 이름.'
                  : '살랑이는 귀, 반짝이는 눈.'}
                <br />
                {save.completedAdventures
                  ? '우리가 만든 이야기를 기억해.'
                  : '너와 첫 모험을 기다리고 있어.'}
              </p>
            </div>
            {save.appearance.drawingAssetId && !art.png ? (
              <output className="cw-art-loading">
                {art.error || '보관한 친구가 오는 중…'}
              </output>
            ) : (
              <CompanionWorld
                ref={world}
                mode="home"
                appearance={liveAppearance}
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
            )}
            <output className="cw-bubble">{notice}</output>
            {save.storyBooks[0] && (
              <button
                className="cw-keepsake"
                onClick={() => openBook(save.storyBooks[0])}
              >
                <span aria-hidden="true">
                  {save.storyBooks[0].ending === 'sky' ? '✧' : '☾'}
                </span>
                <span>
                  <small>숲에서 가져온 추억</small>
                  <strong>
                    {save.storyBooks[0].ending === 'sky'
                      ? '우리 별의 이야기'
                      : '따뜻한 등불 이야기'}
                  </strong>
                </span>
                <BookOpen size={17} />
              </button>
            )}
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
            <button
              className="cw-primary cw-start-now"
              onClick={startAdventure}
              disabled={artworkBusy || art.loading || !!art.error}
            >
              <Leaf size={18} />{' '}
              {save.forest && save.forest.chapter !== 'complete'
                ? '친구와 모험 이어가기'
                : '이 친구와 모험 시작'}
            </button>
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
                {artLibrary.length > 0 && (
                  <div className="cw-art-library">
                    <span className="cw-label">내가 만든 그림친구</span>
                    <div>
                      {artLibrary.map((asset) => (
                        <button
                          key={asset.id}
                          aria-pressed={
                            save.appearance.drawingAssetId === asset.id
                          }
                          onClick={() => {
                            commitSave((current) => ({
                              ...current,
                              name: asset.name || current.name,
                              persona: asset.persona,
                              appearance: {
                                ...current.appearance,
                                drawingAssetId: asset.id,
                              },
                              updatedAt: Date.now(),
                            }));
                            setNotice('내가 만든 모습 그대로, 다시 만났네!');
                          }}
                        >
                          <img
                            src={asset.png}
                            alt={asset.name || '보관한 그림친구'}
                          />
                          <span>{asset.name || '그림친구'}</span>
                        </button>
                      ))}
                    </div>
                    <p className="cw-fine">
                      그림의 실루엣에 두께를 준 입체 그림인형이에요. 얼굴·무늬는
                      생성한 모습 그대로예요.
                    </p>
                  </div>
                )}
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
                    setNotice(
                      `나는 ${save.name.trim() || '몽글'}! 네가 지어 준 이름이 좋아.`,
                    );
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
                        aria-pressed={
                          !save.appearance.drawingAssetId &&
                          save.appearance.kind === kind.id
                        }
                        title={kind.description}
                        onClick={() =>
                          updateAppearance({
                            kind: kind.id,
                            drawingAssetId: undefined,
                          })
                        }
                      >
                        <span>{kind.icon}</span>
                        {kind.name}
                      </button>
                    ))}
                  </div>
                </fieldset>
                {save.appearance.drawingAssetId && (
                  <p className="cw-fine">
                    위 동물 버튼을 고르면 봉제 친구로 바뀌어요. 그림친구는
                    보관함에 그대로 남아요.
                  </p>
                )}
                {art.png && (
                  <a
                    className="cw-outline"
                    href={art.png}
                    download={`${save.name.replace(/[\\/:*?"<>|]/g, '')}-그림친구.png`}
                  >
                    친구 그림 따로 저장
                  </a>
                )}
                {!save.appearance.drawingAssetId && (
                  <>
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
                    <fieldset>
                      <legend>나만 알아볼 수 있는 무늬</legend>
                      <div className="cw-personality-options">
                        {(
                          [
                            ['plain', '보송보송'],
                            ['heart', '하트 한 조각'],
                            ['spots', '콩콩 물방울'],
                          ] as const
                        ).map(([pattern, label]) => (
                          <button
                            key={pattern}
                            aria-pressed={
                              (save.appearance.pattern ?? 'plain') === pattern
                            }
                            onClick={() => {
                              updateAppearance({ pattern });
                              world.current?.react('curious');
                            }}
                          >
                            <span aria-hidden="true">
                              {pattern === 'heart'
                                ? '♡'
                                : pattern === 'spots'
                                  ? '●'
                                  : '☁'}
                            </span>
                            {label}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <fieldset>
                      <legend>귀는 어떻게 할까?</legend>
                      <div className="cw-personality-options cw-ear-options">
                        {(
                          [
                            ['upright', '쫑긋, 궁금한 귀'],
                            ['floppy', '살랑, 포근한 귀'],
                          ] as const
                        ).map(([earStyle, label]) => (
                          <button
                            key={earStyle}
                            aria-pressed={
                              (save.appearance.earStyle ?? 'upright') ===
                              earStyle
                            }
                            onClick={() => {
                              updateAppearance({ earStyle });
                              setNotice(
                                earStyle === 'floppy'
                                  ? '내 귀, 바람이 불면 살랑살랑!'
                                  : '무슨 소리지? 귀를 쫑긋!',
                              );
                            }}
                          >
                            {label}
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
                      disabled={colorBusy}
                      onClick={() =>
                        sourceImage
                          ? void extractColors(sourceImage)
                          : upload.current?.click()
                      }
                    >
                      {colorBusy ? (
                        <LoaderCircle size={18} className="cw-spin" />
                      ) : (
                        <ImagePlus size={18} />
                      )}
                      {colorBusy
                        ? '그림에서 색을 찾는 중…'
                        : sourceImage
                          ? '내 그림의 색 가져오기'
                          : '사진·그림에서 색 가져오기'}
                      <ArrowRight size={16} />
                    </button>
                    <p className="cw-fine">
                      그림에서 찾은 색을 털과 장식에 입혀요. 무늬와 귀는 직접
                      골라요. 사진은 이 기기에서만 읽고 저장하거나 전송하지
                      않아요.
                    </p>
                    <div className="cw-accessories">
                      <span>작은 선물</span>
                      {(['star', 'flower', 'scarf'] as const).map(
                        (item, index) => (
                          <button
                            key={item}
                            disabled={!save.unlockedAccessories.includes(item)}
                            aria-pressed={save.equippedAccessory === item}
                            title={
                              save.unlockedAccessories.includes(item)
                                ? ['별 목걸이', '꽃 장식', '포근한 스카프'][
                                    index
                                  ]
                                : '달빛 숲을 마치면 받을 수 있어요'
                            }
                            onClick={() =>
                              commitSave((s) => ({
                                ...s,
                                equippedAccessory: item,
                                appearance: {
                                  ...s.appearance,
                                  accessory: item,
                                },
                                updatedAt: Date.now(),
                              }))
                            }
                          >
                            {['⭐', '🌸', '🧣'][index]}
                            {!save.unlockedAccessories.includes(item) && (
                              <small>모험 선물</small>
                            )}
                          </button>
                        ),
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="cw-bookshelf">
                <h2>우리가 만든 이야기</h2>
                <p>
                  선택이 달라지면 책 속 이야기도 달라져요. 최대 100권까지
                  보관하며 오래된 책을 자동으로 지우지 않아요.
                </p>
                <button
                  className="cw-outline"
                  onClick={() => void exportBackup()}
                >
                  친구와 책 전체 백업
                </button>
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
                <small>
                  {save.completedAdventures
                    ? '다른 길에는 어떤 이야기가 있을까?'
                    : '우리의 첫 번째 모험 · 약 5분'}
                </small>
                <strong>
                  {save.forest && save.forest.chapter !== 'complete'
                    ? '달빛 숲, 이어서 떠나기'
                    : '달빛 숲의 작은 약속'}
                </strong>
                <span>잠든 숲을 함께 깨워 줄래?</span>
              </span>
              <ArrowRight size={23} />
            </button>
            <fieldset className="cw-difficulty">
              <legend>우리에게 맞는 모험 속도</legend>
              <div>
                {(
                  [
                    {
                      id: 'simple',
                      label: '천천히 함께',
                      detail: '4–6세 추천 · 짧은 이야기',
                    },
                    {
                      id: 'standard',
                      label: '스스로 척척',
                      detail: '7–9세 추천 · 기본 모험',
                    },
                    {
                      id: 'challenge',
                      label: '단서를 찾아',
                      detail: '10–12세 추천 · 노래 추리',
                    },
                  ] as { id: ForestDifficulty; label: string; detail: string }[]
                ).map((option) => (
                  <button
                    key={option.id}
                    aria-pressed={
                      (save.playDifficulty ??
                        (age.startsWith('4')
                          ? 'simple'
                          : age.startsWith('10')
                            ? 'challenge'
                            : 'standard')) === option.id
                    }
                    onClick={() =>
                      commitSave((current) => ({
                        ...current,
                        playDifficulty: option.id,
                        updatedAt: Date.now(),
                      }))
                    }
                  >
                    <strong>{option.label}</strong>
                    <small>{option.detail}</small>
                  </button>
                ))}
              </div>
              <p>
                나이와 달라도 편한 것을 골라요. 이미 시작한 모험은 그대로, 다음
                모험부터 바뀌어요.
              </p>
            </fieldset>
            <div className="cw-secondary-actions">
              <button onClick={openChat}>
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
            {save.appearance.drawingAssetId && !art.png ? (
              <output className="cw-art-loading">
                {art.error || '친구 그림을 준비하는 중…'}
              </output>
            ) : (
              <CompanionWorld
                ref={world}
                mode="forest"
                appearance={liveAppearance}
                forest={forest}
                onInteract={(id) => dispatch({ type: 'interact', id })}
                onPet={() => {}}
                onStatus={setWalking}
                onUnavailable={() => setUnavailable(true)}
                onReady={() => setUnavailable(false)}
              />
            )}
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
                  {forest.owlChoice === 'invite'
                    ? '부엉이가 포근한 스카프를 선물했어.'
                    : '반딧불이 꽃 장식을 선물했어.'}
                  <br />
                  오늘 모습 그대로, 우리 책도 완성됐어!
                </p>
                {save.appearance.drawingAssetId ? (
                  <p className="cw-fine">
                    선물은 옷장에 보관했어요. 나중에 봉제 친구를 꾸밀 때 입힐 수
                    있어요.
                  </p>
                ) : (
                  <button
                    className="cw-gift"
                    onClick={() => {
                      const accessory =
                        forest.owlChoice === 'invite' ? 'scarf' : 'flower';
                      if (
                        !saveRef.current.unlockedAccessories.includes(accessory)
                      )
                        return;
                      commitSave((s) => ({
                        ...s,
                        equippedAccessory: accessory,
                        appearance: { ...s.appearance, accessory },
                        updatedAt: Date.now(),
                      }));
                      world.current?.react('celebrate');
                    }}
                  >
                    <span aria-hidden="true">
                      {forest.owlChoice === 'invite' ? '🧣' : '🌸'}
                    </span>
                    {save.equippedAccessory ===
                    (forest.owlChoice === 'invite' ? 'scarf' : 'flower')
                      ? '선물을 입었어요!'
                      : '선물 바로 입어 보기'}
                  </button>
                )}
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
                  오늘은 여기까지 · 친구의 집으로
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
        {!book && (
          <button
            className="cw-dialog-close cw-icon"
            aria-label="닫기"
            onClick={closeDialog}
          >
            <X size={22} />
          </button>
        )}
        {book && (
          <CompanionStorybook
            key={book.id}
            book={book}
            fallbackName={save.name}
            fallbackAppearance={save.appearance}
            onClose={closeDialog}
          />
        )}
        {chat && (
          <section className="cw-chat">
            <span className="cw-eyebrow">A LITTLE CONVERSATION</span>
            <h2>{save.name}와 도란도란</h2>
            {!consent ? (
              <div className="cw-chat-consent">
                <strong>잠깐, 보호자와 함께 확인해 주세요.</strong>
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
                <label className="cw-guardian-check">
                  <input
                    type="checkbox"
                    checked={guardianChecked}
                    onChange={(e) => setGuardianChecked(e.target.checked)}
                  />
                  보호자가 대화 전송 안내를 읽고 함께 사용하겠습니다.
                </label>
                <label>
                  보호자 확인: {guardianQuestion.a} + {guardianQuestion.b} = ?
                  <input
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={3}
                    value={guardianAnswer}
                    onChange={(e) =>
                      setGuardianAnswer(e.target.value.replace(/\D/g, ''))
                    }
                    aria-label="보호자 확인 답"
                    placeholder="답을 입력해 주세요"
                  />
                </label>
                <small>
                  아이가 바로 시작하지 않도록 둔 확인 절차예요. 신원이나 나이를
                  인증하지는 않습니다.
                </small>
                <button
                  className="cw-primary"
                  disabled={
                    !guardianChecked ||
                    Number(guardianAnswer) !==
                      guardianQuestion.a + guardianQuestion.b
                  }
                  onClick={() => {
                    if (
                      guardianChecked &&
                      Number(guardianAnswer) ===
                        guardianQuestion.a + guardianQuestion.b
                    )
                      setConsent(true);
                  }}
                >
                  안내에 동의하고 함께 이야기하기
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
            <div className="cw-parent-memory">
              <BookOpen size={22} />
              <h3>최근 이야기를 같이 들어 주세요</h3>
              {save.storyBooks[0] ? (
                <>
                  <p>
                    {save.storyBooks[0].choices?.route === 'garden'
                      ? '씨앗을 심고 물을 주어 꽃길을 열었어요.'
                      : save.storyBooks[0].choices?.route === 'river'
                        ? '나뭇가지를 모아 함께 건널 다리를 만들었어요.'
                        : '달빛 숲에서 한 편의 모험을 마쳤어요.'}{' '}
                    {save.storyBooks[0].choices && (
                      <>
                        {save.storyBooks[0].choices.owl === 'listen'
                          ? '부엉이의 노래에 귀를 기울였어요.'
                          : '부엉이를 초대해 함께 노래했어요.'}{' '}
                        {save.storyBooks[0].choices.ending === 'sky'
                          ? '마지막에는 빛을 하늘로 올려 보냈어요.'
                          : '마지막에는 친구들의 집으로 가는 길을 밝혔어요.'}{' '}
                      </>
                    )}
                    점수나 등수 대신, 아이가 고른 길이 책에 남아요.
                  </p>
                  <button
                    className="cw-outline"
                    onClick={() => openBook(save.storyBooks[0])}
                  >
                    완성한 책 함께 읽기
                    <ArrowRight size={16} />
                  </button>
                  <p className="cw-fine">
                    “어느 장면에 한 번 더 가 보고 싶어?”라고 물어봐 주세요. 책
                    끝에는 이번 선택에 맞는 질문도 준비했어요.
                  </p>
                </>
              ) : (
                <p>
                  아직 완성한 책이 없어요. 아이와 숲길을 고르고, 모험을 마친 뒤
                  어떤 장면이 좋았는지 들어 주세요.
                </p>
              )}
              <small>
                놀이는 언제든 멈춰도 괜찮아요. 이어지는 모험은 이 기기에
                남습니다. 학습 능력이나 마음 상태를 평가하지 않아요.
              </small>
            </div>
            <p>
              입체 친구와 숲 모험은 API 없이 기기에서 작동합니다. 친구의
              이름·색·모험 선택·완성한 동화는 이 브라우저에만 저장돼요. 다른
              기기에서는 자동으로 이어지지 않아요. 아래 백업 파일을 옮겨
              가져오면 친구와 책을 복원할 수 있어요.
            </p>
            <p>
              사진에서 색을 가져올 때 사진은 전송되지 않습니다. 별도의 ‘AI 그림
              변환’과 ‘친구와 이야기’는 안내 후 OpenAI를 사용해요.
            </p>
            <section className="cw-backup-panel" aria-label="작품 백업과 복구">
              <h3>우리 가족의 작은 보관함</h3>
              <p>
                완성해서 보관한 캐릭터 그림만 기기에 저장해요. 원본 사진·대화는
                백업하지 않아요. 파일에는 친구 이름과 이야기가 있으니 가족끼리
                안전하게 보관해 주세요.
              </p>
              <button
                className="cw-outline"
                onClick={() => void exportBackup()}
              >
                친구·그림·동화책 백업 저장
              </button>
              <button
                className="cw-outline"
                onClick={() => backupInput.current?.click()}
              >
                다른 기기의 백업 가져오기
              </button>
              <input
                hidden
                type="file"
                accept="application/json,.json"
                ref={backupInput}
                onChange={(event) =>
                  void inspectBackup(event.target.files?.[0])
                }
              />
              {backupStatus && <output>{backupStatus}</output>}
              {pendingBackup && (
                <div className="cw-reset-confirm">
                  <strong>
                    {pendingBackup.save.name} · 동화{' '}
                    {pendingBackup.save.storyBooks.length}권 · 그림{' '}
                    {pendingBackup.assets.length}개
                  </strong>
                  <p>
                    이 파일의 친구 설정을 적용하고 기존 책과 합쳐요. 파일 내용은
                    서버로 전송하지 않아요.
                  </p>
                  <button
                    className="cw-primary"
                    onClick={() => void importBackup()}
                  >
                    확인하고 가져오기
                  </button>
                  <button
                    className="cw-outline"
                    onClick={() => setPendingBackup(null)}
                  >
                    취소
                  </button>
                </div>
              )}
              {blocked && (
                <>
                  <p>
                    자동 저장을 멈춰 기존 기록을 보호하고 있어요. 현재 창의
                    변경을 먼저 백업한 뒤 다시 불러오세요.
                  </p>
                  <button
                    className="cw-outline"
                    onClick={() => {
                      try {
                        const original =
                          window.localStorage.getItem(COMPANION_SAVE_KEY);
                        if (!original) throw new Error();
                        downloadLocalFile(
                          '그림친구-복구용-원본기록.json',
                          original,
                        );
                        setBackupStatus(
                          '기기의 원본 기록을 복구용 파일로 보관했어요. 그림 파일은 포함되지 않으며, 손상된 형식이라면 자동 가져오기는 되지 않아요.',
                        );
                      } catch {
                        setBackupStatus(
                          '기기의 원본 기록을 읽지 못했어요. 브라우저 저장 공간 설정을 확인해 주세요.',
                        );
                      }
                    }}
                  >
                    기기의 원본 기록 파일 보관
                  </button>
                  <button
                    className="cw-outline"
                    onClick={() => void reloadLatest()}
                  >
                    현재 창 변경을 내려놓고 저장된 기록 다시 불러오기
                  </button>
                </>
              )}
            </section>
            {consent && (
              <button
                className="cw-outline"
                onClick={() => {
                  setConsent(false);
                  setGuardianChecked(false);
                  setGuardianAnswer('');
                  chatAbort.current?.abort();
                  chatAbort.current = null;
                  setBusy(false);
                  setMessages([]);
                  setInput('');
                }}
              >
                AI 대화 동의 해제하기
              </button>
            )}
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
                <label>
                  보호자가 확인한 뒤 ‘지우기’를 입력해 주세요.
                  <input
                    aria-label="기록 삭제 확인"
                    autoComplete="off"
                    value={resetAnswer}
                    onChange={(e) => setResetAnswer(e.target.value)}
                  />
                </label>
                <button
                  className="cw-danger"
                  disabled={
                    resetAnswer !== '지우기' || artworkBusy || backupBusy
                  }
                  onClick={async () => {
                    if (
                      resetAnswer !== '지우기' ||
                      artworkBusy ||
                      backupOperation.current
                    )
                      return;
                    backupOperation.current = true;
                    setBackupBusy(true);
                    artworkEpoch.current++;
                    const result = await reset();
                    if (!result.ok) {
                      setBackupStatus(result.error);
                      backupOperation.current = false;
                      setBackupBusy(false);
                      return;
                    }
                    setPendingBackup(null);
                    onArtworkAccepted?.();
                    acceptedArtwork.current = null;
                    try {
                      const cleared = readCompanionSave();
                      if (
                        cleared.status !== 'ready' &&
                        cleared.status !== 'empty'
                      )
                        throw new Error();
                      await clearDrawingAssets({
                        expectedGeneration: cleared.snapshot.generation,
                        preserveCurrentGeneration: true,
                      });
                      setArtLibrary(await listDrawingAssets());
                    } catch {
                      setBackupStatus(
                        '놀이 기록은 지웠지만 그림 보관함 삭제를 완료하지 못했어요. 다시 확인해 주세요.',
                      );
                    }
                    backupOperation.current = false;
                    setBackupBusy(false);
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
                  onClick={() => {
                    setResetPrompt(false);
                    setResetAnswer('');
                  }}
                >
                  그대로 둘래요
                </button>
              </div>
            ) : (
              <button
                className="cw-reset-link"
                onClick={() => {
                  setResetAnswer('');
                  setResetPrompt(true);
                }}
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
