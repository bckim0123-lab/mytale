'use client';
/* eslint-disable next/no-img-element */

import { useEffect, useRef, useState } from 'react';
import {
  adventureStories,
  traitMeta,
  type AdventureChoice,
  type AdventureDecision,
  type AdventureStory,
  type AdventureTrait,
} from './adventures';
import {
  clueGlyph,
  guideGlyph,
  questOrder,
  questPositionsForChoice,
  questTargetCount,
  sceneQuests,
} from './adventure-play';
import {
  ArrowLeft,
  BookOpen,
  Camera,
  Check,
  ChevronRight,
  Compass,
  Heart,
  ImagePlus,
  LoaderCircle,
  LockKeyhole,
  MessageCircle,
  Palette,
  Pause,
  Play,
  Printer,
  RefreshCw,
  RotateCcw,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  SwitchCamera,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  WandSparkles,
  X,
} from 'lucide-react';

type Step =
  | 'welcome'
  | 'guardian'
  | 'upload'
  | 'character'
  | 'chat'
  | 'adventure'
  | 'book'
  | 'parent';
type CharacterQuality = {
  checked: boolean;
  score?: number;
  passed?: boolean | null;
  polished: boolean;
  transparent?: boolean;
  transparentRatio?: number;
};
type AdventurePhase =
  | 'entering'
  | 'idle'
  | 'playing'
  | 'acting'
  | 'resolved'
  | 'exiting';
type StoryPage = {
  kind: 'cover' | 'intro' | 'scene' | 'ending';
  eyebrow: string;
  title: string;
  body: string;
  quote?: string;
  clue?: string;
  trait?: AdventureTrait;
  sceneIndex?: number;
};
type BookDirection = 'next' | 'previous';
type SavedStorybook = {
  id: string;
  pages: StoryPage[];
  trail: AdventureDecision[];
  image: string | null;
  theme: number;
  title: string;
};
const flow: { id: Step; label: string }[] = [
  { id: 'upload', label: '그림 올리기' },
  { id: 'character', label: '친구 만나기' },
  { id: 'chat', label: '친구와 대화' },
  { id: 'adventure', label: '함께 모험' },
  { id: 'book', label: '동화책' },
];
const characterStyleCount = 3;
const characterStyles = [
  {
    name: '동화 그림친구',
    detail: '내 선을 살린 색연필·과슈 2D',
    preview: '/style-storybook-v1.webp',
  },
  {
    name: '말랑 스티커친구',
    detail: '도톰하고 포근한 2.5D 스티커',
    preview: '/style-puffy-v1.webp',
  },
  {
    name: '보송 3D 친구',
    detail: '샘플 감성의 고급 플러시 3D',
    preview: '/style-plush-3d-v2.png',
  },
] as const;
const colorChoices = [
  {
    name: '원본 색 그대로',
    value: '원본 색을 가장 많이 유지',
    color: '#f5ead5',
  },
  { name: '복숭아', value: '따뜻한 복숭아색', color: '#f6aa91' },
  { name: '민트', value: '부드러운 민트색', color: '#a9d8c3' },
  { name: '하늘', value: '맑은 하늘색', color: '#9ecde4' },
  { name: '라일락', value: '포근한 라일락색', color: '#c7b5df' },
];
const focusChoices = ['삐뚤빼뚤한 선', '독특한 모양', '표정', '대표 색과 무늬'];
const ageChoices = ['4–6세', '7–9세', '10–12세'] as const;
const genderChoices = [
  '선택하지 않음',
  '여자아이',
  '남자아이',
  '아이의 자기표현 존중',
] as const;
const moodChoices = [
  { icon: '☁️', name: '포근하고 다정한' },
  { icon: '⚡', name: '활발하고 씩씩한' },
  { icon: '✨', name: '반짝이고 신비한' },
  { icon: '😄', name: '장난스럽고 유쾌한' },
] as const;
const worldChoices = [
  { icon: '🌿', name: '동물과 자연' },
  { icon: '🪄', name: '마법과 동화' },
  { icon: '🚀', name: '로봇과 우주' },
  { icon: '🏕️', name: '탐험과 모험' },
  { icon: '🎵', name: '음악과 춤' },
] as const;
const adventureReactions: Record<AdventureTrait, string> = {
  kindness: '마음이 몽글몽글해졌어!',
  curiosity: '숨은 비밀을 찾았어!',
  courage: '좋아, 내가 먼저 가 볼게!',
  creativity: '새로운 길이 떠올랐어!',
};
const adventureActionEffects: Record<AdventureTrait, string> = {
  kindness: '친구에게 다가가고 숲빛이 따뜻해져요',
  curiosity: '카메라가 가까워지고 숨은 장치가 보여요',
  courage: '무대를 가로질러 달리고 길이 활짝 열려요',
  creativity: '빛의 궤적을 그려 새로운 길을 만들어요',
};
const birthReactions = [
  '“안녕! 나를 톡 누르면 움직일 수 있어!”',
  '“간질간질! 네 손길이 느껴졌어.”',
  '“폴짝! 우리 모험을 시작해 볼까?”',
  '“빙글— 네 그림에서 태어난 게 정말 좋아!”',
] as const;

async function readJson<T>(response: Response): Promise<T | null> {
  if (!response.headers.get('content-type')?.includes('application/json'))
    return null;
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function apiErrorMessage(response: Response, fallback?: string) {
  if (fallback) return fallback;
  if (response.status === 429)
    return '친구들이 숨을 고르고 있어요. 잠시 쉬었다가 다시 만들어 주세요.';
  if (response.status >= 500)
    return 'AI 작업실 연결이 잠시 불안정해요. 잠시 뒤 다시 시도해 주세요.';
  return '캐릭터 변환을 완료하지 못했어요. 그림을 확인하고 다시 시도해 주세요.';
}
const defaultPersona = {
  name: '별콩이',
  likes: '반짝이는 별',
  ability: '따뜻한 별빛 만들기',
  traits: '용감하고 다정함',
  quirk: '놀라면 비눗방울이 나옴',
};
function Logo() {
  return (
    <span className="logo">
      <Star fill="currentColor" />
      그림친구
    </span>
  );
}
function Friend({
  image,
  variant = '',
}: {
  image?: string | null;
  variant?: string;
}) {
  return image ? (
    <img
      className={`friend-image ${variant}`}
      src={image}
      alt="내 그림으로 만든 캐릭터"
    />
  ) : (
    <div className={`friend ${variant}`} aria-label="별콩이 캐릭터">
      <i>★</i>
      <i>★</i>
      <b>• ᴗ •</b>
      <small>●　●</small>
    </div>
  );
}
function StorySpread({
  storyPage,
  adventure,
  image,
  pageNumber,
  totalPages,
  direction,
}: {
  storyPage: StoryPage;
  adventure: AdventureStory;
  image?: string | null;
  pageNumber: number;
  totalPages: number;
  direction?: BookDirection;
}) {
  const sceneIndex = storyPage.sceneIndex ?? 0;
  const trait = storyPage.trait || 'kindness';
  return (
    <article
      className={`storybook-spread page-${storyPage.kind} trait-${trait} ${
        direction ? `turn-${direction}` : ''
      }`}
      aria-label={`${storyPage.eyebrow}: ${storyPage.title}`}
    >
      <div className="story-illustration">
        <div
          className={`story-world stage-${sceneIndex}`}
          style={
            adventure.id === 'moon'
              ? {
                  backgroundImage: `url(/moon-forest-scene-${sceneIndex + 1}.webp)`,
                }
              : undefined
          }
          aria-hidden="true"
        />
        <span className="story-emblem" aria-hidden="true">
          {adventure.icon}
        </span>
        <i className="storybook-spark spark-a" aria-hidden="true">
          ✦
        </i>
        <i className="storybook-spark spark-b" aria-hidden="true">
          ·
        </i>
        <div className="story-character">
          <Friend image={image} />
        </div>
        {storyPage.clue && (
          <span className="clue-sticker">
            <i>{traitMeta[trait].icon}</i>
            <b>{storyPage.clue}</b>
          </span>
        )}
      </div>
      <div className="story-copy">
        {storyPage.kind === 'cover' && (
          <span className="cover-label">우리 가족 창작 동화</span>
        )}
        <small>{storyPage.eyebrow}</small>
        <h3>{storyPage.title}</h3>
        <p>{storyPage.body}</p>
        {storyPage.quote && <blockquote>“{storyPage.quote}”</blockquote>}
        <footer>
          <span>그림친구 동화책</span>
          <b>
            {pageNumber} / {totalPages}
          </b>
        </footer>
      </div>
    </article>
  );
}
function Button({
  children,
  onClick,
  secondary = false,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      className={secondary ? 'button secondary' : 'button'}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export default function Home() {
  const [step, setStep] = useState<Step>('welcome');
  const [image, setImage] = useState<string | null>(null);
  const [generated, setGenerated] = useState<string[]>([]);
  const [generatedQuality, setGeneratedQuality] = useState<
    Array<CharacterQuality | null>
  >([]);
  const [generating, setGenerating] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [generationNote, setGenerationNote] = useState('');
  const [favoriteColor, setFavoriteColor] = useState(colorChoices[0].value);
  const [preserveFocus, setPreserveFocus] = useState(focusChoices[0]);
  const [characterWish, setCharacterWish] = useState('');
  const [childGender, setChildGender] = useState<
    (typeof genderChoices)[number]
  >(genderChoices[0]);
  const [characterMood, setCharacterMood] = useState<
    (typeof moodChoices)[number]['name']
  >(moodChoices[0].name);
  const [favoriteWorld, setFavoriteWorld] = useState<
    (typeof worldChoices)[number]['name']
  >(worldChoices[0].name);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>(
    'environment',
  );
  const [pick, setPick] = useState(0);
  const [scene, setScene] = useState(0);
  const [theme, setTheme] = useState(0);
  const [page, setPage] = useState(0);
  const duration = '8–12분';
  const [age, setAge] = useState<(typeof ageChoices)[number]>('7–9세');
  const [photoConsent, setPhotoConsent] = useState(false);
  const [guardianVerified, setGuardianVerified] = useState(false);
  const [previousStep, setPreviousStep] = useState<Step>('welcome');
  const [adventureTrail, setAdventureTrail] = useState<AdventureDecision[]>([]);
  const [choiceResult, setChoiceResult] = useState<AdventureDecision | null>(
    null,
  );
  const [adventurePhase, setAdventurePhase] =
    useState<AdventurePhase>('entering');
  const [pendingChoice, setPendingChoice] = useState<AdventureChoice | null>(
    null,
  );
  const [previewTrait, setPreviewTrait] = useState<AdventureTrait | null>(null);
  const [questHits, setQuestHits] = useState<number[]>([]);
  const [questWarmth, setQuestWarmth] = useState(0);
  const [questHintTarget, setQuestHintTarget] = useState<number | null>(null);
  const [questMessage, setQuestMessage] = useState('');
  const [showAllYoungChoices, setShowAllYoungChoices] = useState(false);
  const [actorGesture, setActorGesture] = useState(0);
  const [actorPetted, setActorPetted] = useState(false);
  const [birthReaction, setBirthReaction] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const [storybook, setStorybook] = useState<StoryPage[] | null>(null);
  const [storybookImage, setStorybookImage] = useState<string | null>(null);
  const [storybookTheme, setStorybookTheme] = useState(0);
  const [bookDirection, setBookDirection] = useState<BookDirection>('next');
  const [readingAloud, setReadingAloud] = useState(false);
  const [adventureSpeaking, setAdventureSpeaking] = useState(false);
  const [savedStorybooks, setSavedStorybooks] = useState<SavedStorybook[]>([]);
  const [persona, setPersona] = useState(defaultPersona);
  const [messages, setMessages] = useState<
    Array<{ role: 'user' | 'assistant'; content: string }>
  >([
    {
      role: 'assistant',
      content:
        '안녕! 나는 네 그림에서 태어난 AI 이야기 친구 별콩이야. 오늘 어떤 상상을 함께 만들어 볼까?',
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatting, setChatting] = useState(false);
  const [chatError, setChatError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const cameraStream = useRef<MediaStream | null>(null);
  const cameraRequest = useRef(0);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const generationRequest = useRef<AbortController | null>(null);
  const chatRequest = useRef<AbortController | null>(null);
  const stageNode = useRef<HTMLDivElement>(null);
  const birthStageNode = useRef<HTMLElement>(null);
  const parallaxFrame = useRef<number | null>(null);
  const actionFallbackTimer = useRef<number | null>(null);
  const questCommitTimer = useRef<number | null>(null);
  const questHintTimer = useRef<number | null>(null);
  const questFinishing = useRef(false);
  const petTimer = useRef<number | null>(null);
  const transitionTimer = useRef<number | null>(null);
  const transitionPending = useRef(false);
  const flowIndex = flow.findIndex((x) => x.id === step);
  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, chatting]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (step !== 'book' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      queueMicrotask(() => setReadingAloud(false));
    }
    if (step !== 'adventure') queueMicrotask(() => setAdventureSpeaking(false));
  }, [step]);
  useEffect(() => {
    if (cameraOpen && video.current && cameraStream.current) {
      video.current.srcObject = cameraStream.current;
      void video.current.play().catch(() => undefined);
    }
  }, [cameraOpen, facingMode]);
  useEffect(() => {
    if (step !== 'upload' && cameraStream.current) {
      cameraRequest.current += 1;
      cameraStream.current.getTracks().forEach((track) => track.stop());
      cameraStream.current = null;
      queueMicrotask(() => setCameraOpen(false));
    } else if (step !== 'upload') {
      cameraRequest.current += 1;
      queueMicrotask(() => setCameraOpen(false));
    }
  }, [step]);
  useEffect(
    () => () => {
      cameraStream.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );
  useEffect(() => {
    if (step !== 'adventure' || scene < 0 || adventurePhase !== 'entering')
      return;
    const timer = window.setTimeout(() => setAdventurePhase('idle'), 900);
    return () => window.clearTimeout(timer);
  }, [adventurePhase, scene, step]);
  useEffect(() => {
    if (step !== 'adventure' || scene < 0) return;
    queueMicrotask(() => {
      setPendingChoice(null);
      setPreviewTrait(null);
      setQuestHits([]);
      setQuestWarmth(0);
      setQuestHintTarget(null);
      setQuestMessage('');
      setShowAllYoungChoices(false);
    });
  }, [scene, step, theme]);
  useEffect(() => {
    if (step !== 'adventure' || scene < 0 || adventurePhase === 'exiting')
      return;
    const interval = window.setInterval(
      () => setActorGesture((current) => (current + 1) % 3),
      4600,
    );
    return () => window.clearInterval(interval);
  }, [adventurePhase, scene, step]);
  useEffect(() => {
    if (adventurePhase !== 'acting') return;
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    actionFallbackTimer.current = window.setTimeout(
      () => setAdventurePhase('resolved'),
      reducedMotion ? 220 : 2050,
    );
    return () => {
      if (actionFallbackTimer.current)
        window.clearTimeout(actionFallbackTimer.current);
    };
  }, [adventurePhase]);
  useEffect(
    () => () => {
      if (parallaxFrame.current) cancelAnimationFrame(parallaxFrame.current);
      if (actionFallbackTimer.current)
        window.clearTimeout(actionFallbackTimer.current);
      if (questCommitTimer.current)
        window.clearTimeout(questCommitTimer.current);
      if (questHintTimer.current) window.clearTimeout(questHintTimer.current);
      if (petTimer.current) window.clearTimeout(petTimer.current);
      if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
    },
    [],
  );
  const load = (file?: File) => {
    if (!file) return;
    generationRequest.current?.abort();
    chatRequest.current?.abort();
    const reader = new FileReader();
    reader.onload = () => {
      const source = new Image();
      source.onload = () => {
        const maxSide = 1600;
        const scale = Math.min(
          1,
          maxSide / Math.max(source.width, source.height),
        );
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(source.width * scale));
        canvas.height = Math.max(1, Math.round(source.height * scale));
        const context = canvas.getContext('2d');
        if (!context) return;
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
        // Re-encoding keeps uploads light and strips camera metadata before transmission.
        setImage(canvas.toDataURL('image/jpeg', 0.88));
        setGenerated([]);
        setGeneratedQuality([]);
        setGenerationNote('');
        setPick(0);
        setScene(0);
        setTheme(0);
        setPage(0);
        setAdventureTrail([]);
        setChoiceResult(null);
        setAdventurePhase('entering');
        setStorybook(null);
        setStorybookImage(null);
        setStorybookTheme(0);
        setBookDirection('next');
        setReadingAloud(false);
        setAdventureSpeaking(false);
        setSavedStorybooks([]);
        setPersona(defaultPersona);
        setMessages([
          {
            role: 'assistant',
            content:
              '안녕! 나는 네 그림에서 태어날 AI 이야기 친구야. 오늘 어떤 상상을 함께 만들어 볼까?',
          },
        ]);
        setChatInput('');
        setChatError('');
      };
      if (typeof reader.result !== 'string') return;
      source.src = reader.result;
    };
    reader.readAsDataURL(file);
  };
  const closeCamera = () => {
    cameraRequest.current += 1;
    cameraStream.current?.getTracks().forEach((track) => track.stop());
    cameraStream.current = null;
    if (video.current) video.current.srcObject = null;
    setCameraOpen(false);
  };
  const openCamera = async (mode: 'environment' | 'user' = facingMode) => {
    setCameraError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraInput.current?.click();
      return;
    }
    const requestId = cameraRequest.current + 1;
    cameraRequest.current = requestId;
    cameraStream.current?.getTracks().forEach((track) => track.stop());
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 1280 },
        },
      });
      if (requestId !== cameraRequest.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      cameraStream.current = stream;
      setFacingMode(mode);
      setCameraOpen(true);
    } catch {
      if (requestId !== cameraRequest.current) return;
      setCameraOpen(false);
      setCameraError(
        '카메라를 열 수 없어요. 권한을 허용하거나 사진 파일을 골라 주세요.',
      );
    }
  };
  const flipCamera = async () => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    await openCamera(next);
  };
  const captureCamera = () => {
    if (!video.current?.videoWidth || !video.current.videoHeight) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.current.videoWidth;
    canvas.height = video.current.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(video.current, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        load(new File([blob], 'camera-drawing.jpg', { type: 'image/jpeg' }));
        closeCamera();
      },
      'image/jpeg',
      0.9,
    );
  };
  const chosenImage = generated[pick] || image;
  const activeAdventure = adventureStories[theme] || adventureStories[0];
  const activeScenes = activeAdventure.scenes;
  const requestVariant = async (
    blob: Blob,
    index: number,
    signal?: AbortSignal,
    highQuality = false,
  ) => {
    const form = new FormData();
    form.append('drawing', blob, 'drawing.jpg');
    form.append('styleIndex', String(index));
    form.append('favoriteColor', favoriteColor);
    form.append('preserveFocus', preserveFocus);
    form.append('characterWish', characterWish.trim());
    form.append('age', age);
    form.append('childGender', childGender);
    form.append('characterMood', characterMood);
    form.append('favoriteWorld', favoriteWorld);
    if (highQuality) form.append('qualityTier', 'high');
    if (index === 2) {
      const referenceResponse = await fetch('/style-plush-3d-v2.png');
      if (referenceResponse.ok) {
        const reference = await referenceResponse.blob();
        form.append('styleReference', reference, 'cute-3d-style-reference.png');
      }
    }
    const response = await fetch('/api/character', {
      method: 'POST',
      body: form,
      signal,
    });
    const data = await readJson<{
      image?: string;
      error?: string;
      quality?: CharacterQuality;
    }>(response);
    if (!response.ok || !data?.image)
      throw new Error(apiErrorMessage(response, data?.error));
    return { index, image: data.image, quality: data.quality || null };
  };
  const generateCharacter = async () => {
    if (!image || generating) return;
    generationRequest.current?.abort();
    generationRequest.current = new AbortController();
    setGenerating(true);
    setGenerationNote('그림의 색과 특별한 모양을 살펴보고 있어요…');
    try {
      const blob = await fetch(image).then((r) => r.blob());
      setGenerated(Array.from({ length: characterStyleCount }, () => ''));
      setGeneratedQuality(
        Array.from<CharacterQuality | null>({
          length: characterStyleCount,
        }).fill(null),
      );
      let revealedFirst = false;
      const variants = Array.from({ length: characterStyleCount }, (_, index) =>
        requestVariant(blob, index, generationRequest.current?.signal).then(
          (result) => {
            setGenerated((previous) => {
              const next = [...previous];
              next[result.index] = result.image;
              return next;
            });
            setGeneratedQuality((previous) => {
              const next = [...previous];
              next[result.index] = result.quality;
              return next;
            });
            if (!revealedFirst) {
              revealedFirst = true;
              setPick(result.index);
              setGenerationNote(
                '첫 친구가 도착했어요! 다른 모습도 품질 검사를 마치는 대로 옆에 나타나요.',
              );
              setStep((current) =>
                current === 'upload' ? 'character' : current,
              );
            }
            return result;
          },
        ),
      );
      const settled = await Promise.allSettled(variants);
      const images = Array.from<string>({ length: characterStyleCount }).fill(
        '',
      );
      const qualities = Array.from<CharacterQuality | null>({
        length: characterStyleCount,
      }).fill(null);
      for (const result of settled)
        if (result.status === 'fulfilled') {
          images[result.value.index] = result.value.image;
          qualities[result.value.index] = result.value.quality;
        }
      const successCount = images.filter(Boolean).length;
      if (!successCount) {
        const firstFailure = settled.find(
          (result): result is PromiseRejectedResult =>
            result.status === 'rejected',
        );
        throw firstFailure?.reason instanceof Error
          ? firstFailure.reason
          : new Error('캐릭터 변환을 완료하지 못했어요. 다시 시도해 주세요.');
      }
      setGenerated(images);
      setGeneratedQuality(qualities);
      setGenerationNote(
        successCount === characterStyleCount
          ? '그림의 특징을 살리고 귀여움 검수까지 마친 세 친구가 태어났어요!'
          : `${successCount}개의 모습을 먼저 완성했어요. 마음에 드는 친구를 골라 주세요.`,
      );
      setStep((current) => (current === 'upload' ? 'character' : current));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setGenerationNote(
        error instanceof Error
          ? error.message
          : '캐릭터 변환에 실패했어요. 다시 시도해 주세요.',
      );
    } finally {
      setGenerating(false);
    }
  };
  const regenerateSelected = async () => {
    if (!image || regenerating || generating) return;
    generationRequest.current?.abort();
    generationRequest.current = new AbortController();
    setRegenerating(true);
    setGenerationNote(
      `${characterStyles[pick].name}을 더 귀엽게 다시 만들고 있어요…`,
    );
    try {
      const blob = await fetch(image).then((response) => response.blob());
      const result = await requestVariant(
        blob,
        pick,
        generationRequest.current.signal,
        true,
      );
      setGenerated((previous) =>
        previous.map((item, index) =>
          index === result.index ? result.image : item,
        ),
      );
      setGeneratedQuality((previous) => {
        const next = [...previous];
        next[result.index] = result.quality;
        return next;
      });
      setGenerationNote(
        `${characterStyles[pick].name}을 취향에 맞춰 새로 완성했어요!`,
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setGenerationNote(
        error instanceof Error
          ? error.message
          : '이 모습을 다시 만들지 못했어요. 잠시 뒤 시도해 주세요.',
      );
    } finally {
      setRegenerating(false);
    }
  };
  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatting) return;
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setChatInput('');
    setChatting(true);
    setChatError('');
    chatRequest.current?.abort();
    chatRequest.current = new AbortController();
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages,
          persona,
          age,
        }),
        signal: chatRequest.current.signal,
      });
      const data = await readJson<{ text?: string }>(response);
      if (!response.ok || !data) throw new Error('답장을 가져오지 못했어요.');
      setMessages([
        ...next,
        {
          role: 'assistant',
          content: data.text || '잠시 생각을 고르고 있어. 다시 말해 줄래?',
        },
      ]);
    } catch {
      setChatError('답장을 가져오지 못했어요. 잠시 후 다시 보내 주세요.');
    } finally {
      setChatting(false);
    }
  };
  const getDominantTrait = (trail: AdventureDecision[]): AdventureTrait => {
    const score: Record<AdventureTrait, number> = {
      kindness: 0,
      curiosity: 0,
      courage: 0,
      creativity: 0,
    };
    trail.forEach((decision) => {
      score[decision.trait] += 1;
    });
    return (Object.keys(score) as AdventureTrait[]).reduce((winner, item) =>
      score[item] >= score[winner] ? item : winner,
    );
  };
  const buildStoryPages = (trail: AdventureDecision[]): StoryPage[] => {
    const dominantTrait = getDominantTrait(trail);
    const finalDecision = trail[activeScenes.length - 1];
    const endingTrait = finalDecision?.trait || dominantTrait;
    const clues = trail.map((decision) => decision.clue).join(' · ');
    return [
      {
        kind: 'cover',
        eyebrow: '표지',
        title: `${persona.name}와 ${activeAdventure.title}`,
        body: `${age} 모험가의 다섯 번의 선택으로 완성된, 세상에 단 하나뿐인 이야기`,
        quote: `${persona.name}와 함께라면 어디든 이야기의 문이 열려요!`,
        trait: dominantTrait,
        sceneIndex: 0,
      },
      {
        kind: 'intro',
        eyebrow: '등장인물',
        title: `안녕, 나는 ${persona.name}야!`,
        body: `${persona.name}는 ${persona.traits} 친구예요. ${persona.ability} 능력을 가졌고, ${persona.quirk}. 어느 날, 우리 앞으로 아주 특별한 초대장이 날아왔어요.`,
        quote: `오늘의 길은 네가 골라 줘. 나는 네 곁에서 함께 갈게!`,
        trait: trail[0]?.trait || dominantTrait,
        sceneIndex: 0,
      },
      ...activeScenes.map((item, index) => {
        const decision = trail[index];
        const previous = index > 0 ? trail[index - 1] : null;
        const echo = previous ? item.echoes?.[previous.trait] : null;
        const bridge = echo ? `그때, ${echo}` : '';
        return {
          kind: 'scene' as const,
          eyebrow: item.chapter,
          title: item.title,
          body: decision
            ? `${item.body} ${bridge} 우리는 잠시 눈을 마주보고 ‘${decision.label}’ 방법을 골랐어요. ${decision.result}`
            : `${item.body} ${bridge}`,
          quote: decision
            ? `${adventureReactions[decision.trait]} 이제 ${decision.clue}도 우리 편이야.`
            : `${persona.name}와 함께 다음 길을 찾아볼까요?`,
          clue: decision?.clue,
          trait: decision?.trait || previous?.trait || dominantTrait,
          sceneIndex: index,
        };
      }),
      {
        kind: 'ending',
        eyebrow: '그리고 오래오래 행복하게',
        title: `${traitMeta[endingTrait].icon} 마지막 선택이 만든 진짜 결말`,
        body: `${finalDecision ? `마지막 순간 우리는 ‘${finalDecision.label}’ 방법을 골랐어요. ${finalDecision.result}` : ''} ${activeAdventure.endings[endingTrait]} 그동안 모은 ${clues || '반짝이는 마음'}이 모두 이어지자, 먼저 만난 친구와 단서들도 마지막 장면으로 달려왔어요. ${persona.name}와 나는 ‘${activeAdventure.reward}’을 품에 안고 웃으며 집으로 돌아왔답니다.`,
        quote: `이 이야기는 끝이 아니야. 다음 모험도 우리 선택으로 만들어 보자!`,
        clue: activeAdventure.reward,
        trait: endingTrait,
        sceneIndex: activeScenes.length - 1,
      },
    ];
  };
  const resetAdventureGame = () => {
    if (actionFallbackTimer.current)
      window.clearTimeout(actionFallbackTimer.current);
    if (questCommitTimer.current) window.clearTimeout(questCommitTimer.current);
    if (questHintTimer.current) window.clearTimeout(questHintTimer.current);
    if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
    transitionPending.current = false;
    questFinishing.current = false;
    setPendingChoice(null);
    setPreviewTrait(null);
    setQuestHits([]);
    setQuestWarmth(0);
    setQuestHintTarget(null);
    setQuestMessage('');
    setShowAllYoungChoices(false);
    setAdventurePhase('entering');
  };
  const playAdventureChime = (trait: AdventureTrait) => {
    if (!soundOn) return;
    try {
      const AudioContextClass =
        window.AudioContext ||
        (
          window as typeof window & {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;
      if (!AudioContextClass) return;
      const audioContext = new AudioContextClass();
      const start = audioContext.currentTime;
      const baseFrequency: Record<AdventureTrait, number> = {
        kindness: 523.25,
        curiosity: 659.25,
        courage: 440,
        creativity: 783.99,
      };
      [1, 1.26, 1.5].forEach((ratio, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = index === 2 ? 'sine' : 'triangle';
        oscillator.frequency.value = baseFrequency[trait] * ratio;
        gain.gain.setValueAtTime(0.0001, start + index * 0.06);
        gain.gain.exponentialRampToValueAtTime(
          0.075,
          start + index * 0.06 + 0.018,
        );
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          start + index * 0.06 + 0.24,
        );
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start(start + index * 0.06);
        oscillator.stop(start + index * 0.06 + 0.25);
      });
      window.setTimeout(() => void audioContext.close(), 520);
    } catch {
      // Some mobile browsers only allow audio after additional interaction.
    }
  };
  const playQuestTone = (stepIndex: number, complete = false) => {
    if (!soundOn) return;
    try {
      const AudioContextClass =
        window.AudioContext ||
        (
          window as typeof window & {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;
      if (!AudioContextClass) return;
      const audioContext = new AudioContextClass();
      const start = audioContext.currentTime;
      const frequencies = complete
        ? [523.25, 659.25, 783.99]
        : [329.63 + stepIndex * 42];
      frequencies.forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = complete ? 'sine' : 'triangle';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start + index * 0.075);
        gain.gain.exponentialRampToValueAtTime(
          complete ? 0.065 : 0.045,
          start + index * 0.075 + 0.012,
        );
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          start + index * 0.075 + 0.22,
        );
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start(start + index * 0.075);
        oscillator.stop(start + index * 0.075 + 0.24);
      });
      window.setTimeout(() => void audioContext.close(), 620);
    } catch {
      // Audio is a duplicate reward; the visual game remains fully usable.
    }
  };
  const updateStageParallax = (event: React.PointerEvent<HTMLDivElement>) => {
    if (
      adventurePhase === 'acting' ||
      adventurePhase === 'exiting' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    const node = stageNode.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const x = Math.max(
      -1,
      Math.min(1, ((event.clientX - rect.left) / rect.width - 0.5) * 2),
    );
    const y = Math.max(
      -1,
      Math.min(1, ((event.clientY - rect.top) / rect.height - 0.5) * 2),
    );
    if (parallaxFrame.current) cancelAnimationFrame(parallaxFrame.current);
    parallaxFrame.current = requestAnimationFrame(() => {
      node.style.setProperty('--far-x', `${x * -5}px`);
      node.style.setProperty('--mid-x', `${x * -11}px`);
      node.style.setProperty('--near-x', `${x * -18}px`);
      node.style.setProperty('--parallax-y', `${y * -6}px`);
      node.style.setProperty('--inverse-parallax-y', `${y * 6}px`);
      node.style.setProperty('--look-x', `${x * 8}px`);
      node.style.setProperty('--look-y', `${y * 3}px`);
      node.style.setProperty('--look-rotate', `${x * 2.4}deg`);
      node.style.setProperty('--spot-x', `${(x + 1) * 50}%`);
      node.style.setProperty('--spot-y', `${(y + 1) * 34 + 12}%`);
    });
  };
  const resetStageParallax = () => {
    const node = stageNode.current;
    if (!node) return;
    node.style.setProperty('--far-x', '0px');
    node.style.setProperty('--mid-x', '0px');
    node.style.setProperty('--near-x', '0px');
    node.style.setProperty('--parallax-y', '0px');
    node.style.setProperty('--inverse-parallax-y', '0px');
    node.style.setProperty('--look-x', '0px');
    node.style.setProperty('--look-y', '0px');
    node.style.setProperty('--look-rotate', '0deg');
    node.style.setProperty('--spot-x', '62%');
    node.style.setProperty('--spot-y', '45%');
  };
  const touchBirthCharacter = () => {
    setBirthReaction((current) => current + 1);
    navigator.vibrate?.(20);
    playQuestTone(birthReaction % 4, birthReaction % 4 === 3);
  };
  const petAdventureCharacter = () => {
    if (adventurePhase === 'acting' || adventurePhase === 'exiting') return;
    if (petTimer.current) window.clearTimeout(petTimer.current);
    setActorPetted(false);
    requestAnimationFrame(() => setActorPetted(true));
    navigator.vibrate?.(18);
    playQuestTone(1);
    petTimer.current = window.setTimeout(() => setActorPetted(false), 900);
  };
  const commitAdventureAction = (choice: AdventureChoice) => {
    const decision: AdventureDecision = {
      ...choice,
      chapter: activeScenes[scene].chapter,
      sceneTitle: activeScenes[scene].title,
    };
    const next = [...adventureTrail];
    next[scene] = decision;
    setAdventureTrail(next);
    setChoiceResult(decision);
    setPendingChoice(null);
    setPreviewTrait(null);
    setAdventurePhase('acting');
    playAdventureChime(choice.trait);
    navigator.vibrate?.(choice.trait === 'courage' ? [35, 25, 45] : 28);
  };
  const beginAdventureChoice = (choice: AdventureChoice) => {
    if (adventurePhase !== 'idle') return;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setAdventureSpeaking(false);
    questFinishing.current = false;
    setPendingChoice(choice);
    setPreviewTrait(choice.trait);
    setQuestHits([]);
    setQuestWarmth(0);
    setQuestHintTarget(null);
    setQuestMessage(`“${choice.label}” 방법을 직접 움직여 완성해 볼까요?`);
    setAdventurePhase('playing');
    playQuestTone(0);
    navigator.vibrate?.(14);
  };
  const finishSceneQuest = (choice: AdventureChoice) => {
    if (questFinishing.current) return;
    questFinishing.current = true;
    setQuestMessage(sceneQuests[scene % sceneQuests.length].success);
    playQuestTone(4, true);
    navigator.vibrate?.([22, 35, 22]);
    questCommitTimer.current = window.setTimeout(
      () => commitAdventureAction(choice),
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 120 : 620,
    );
  };
  const touchQuestTarget = (targetIndex: number) => {
    if (
      !pendingChoice ||
      adventurePhase !== 'playing' ||
      questFinishing.current
    )
      return;
    const quest = sceneQuests[scene % sceneQuests.length];
    const count = questTargetCount(age);
    if (questHits.includes(targetIndex)) return;
    const order = questOrder(scene, count, pendingChoice.trait);
    const ordered = quest.ordered && age !== '4–6세';
    const expected = order[questHits.length];
    if (ordered && targetIndex !== expected) {
      setQuestHintTarget(expected);
      setQuestMessage('거의 맞았어요! 더 환하게 두근거리는 빛부터 눌러 봐요.');
      playQuestTone(0);
      navigator.vibrate?.(10);
      if (questHintTimer.current) window.clearTimeout(questHintTimer.current);
      questHintTimer.current = window.setTimeout(
        () => setQuestHintTarget(null),
        1100,
      );
      return;
    }
    const nextHits = [...questHits, targetIndex];
    setQuestHits(nextHits);
    setQuestHintTarget(null);
    setQuestMessage(
      nextHits.length >= count
        ? quest.success
        : `${nextHits.length}개를 깨웠어요. 친구가 빛을 따라 움직여요!`,
    );
    playQuestTone(nextHits.length);
    navigator.vibrate?.(14);
    if (nextHits.length >= count) finishSceneQuest(pendingChoice);
  };
  const warmSceneHeart = (value: number) => {
    if (
      !pendingChoice ||
      adventurePhase !== 'playing' ||
      questFinishing.current
    )
      return;
    const warmth = Math.max(0, Math.min(100, value));
    setQuestWarmth(warmth);
    setQuestMessage(
      warmth >= 96
        ? sceneQuests[3].success
        : `따뜻한 빛이 ${warmth}%만큼 퍼졌어요. 천천히 더 보내 주세요.`,
    );
    if (warmth >= 96) {
      setQuestWarmth(100);
      finishSceneQuest(pendingChoice);
    }
  };
  const completeQuestWithFriend = () => {
    if (
      !pendingChoice ||
      adventurePhase !== 'playing' ||
      questFinishing.current
    )
      return;
    const count = questTargetCount(age);
    if (scene % sceneQuests.length === 3) setQuestWarmth(100);
    else setQuestHits(questOrder(scene, count, pendingChoice.trait));
    setQuestMessage(
      '함께하니 해냈어요! 이제 친구가 선택을 행동으로 보여 줘요.',
    );
    finishSceneQuest(pendingChoice);
  };
  const cancelPendingChoice = () => {
    if (questCommitTimer.current) window.clearTimeout(questCommitTimer.current);
    questFinishing.current = false;
    setPendingChoice(null);
    setPreviewTrait(null);
    setQuestHits([]);
    setQuestWarmth(0);
    setQuestHintTarget(null);
    setQuestMessage('');
    setAdventurePhase('idle');
  };
  const completeActorAction = (event: React.AnimationEvent<HTMLDivElement>) => {
    if (
      adventurePhase !== 'acting' ||
      event.target !== event.currentTarget ||
      !event.animationName.includes('actor-')
    )
      return;
    if (actionFallbackTimer.current)
      window.clearTimeout(actionFallbackTimer.current);
    setAdventurePhase('resolved');
  };
  const finishAdventureTransition = () => {
    if (!transitionPending.current) return;
    transitionPending.current = false;
    if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
    if (scene < activeScenes.length - 1) {
      setScene((current) => current + 1);
      setChoiceResult(null);
      setAdventurePhase('entering');
      return;
    }
    const completedPages = buildStoryPages(adventureTrail);
    const completedBook: SavedStorybook = {
      id: `${Date.now()}-${theme}`,
      pages: completedPages,
      trail: [...adventureTrail],
      image: chosenImage,
      theme,
      title: completedPages[0]?.title || activeAdventure.title,
    };
    setSavedStorybooks((current) => [...current, completedBook].slice(-4));
    setStorybook(completedPages);
    setStorybookImage(chosenImage);
    setStorybookTheme(theme);
    setPage(0);
    setBookDirection('next');
    setReadingAloud(false);
    setAdventureSpeaking(false);
    setChoiceResult(null);
    setAdventurePhase('entering');
    setStep('book');
  };
  const continueAdventure = () => {
    if (!choiceResult || adventurePhase !== 'resolved') return;
    transitionPending.current = true;
    setAdventurePhase('exiting');
    transitionTimer.current = window.setTimeout(finishAdventureTransition, 820);
  };
  const storyPages = storybook || buildStoryPages(adventureTrail);
  const bookAdventure =
    adventureStories[storybook ? storybookTheme : theme] || adventureStories[0];
  const currentStoryPage =
    storyPages[Math.min(page, Math.max(0, storyPages.length - 1))];
  const moveBookPage = (nextPage: number) => {
    const safePage = Math.max(0, Math.min(nextPage, storyPages.length - 1));
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setReadingAloud(false);
    setBookDirection(safePage >= page ? 'next' : 'previous');
    setPage(safePage);
  };
  const toggleReadAloud = () => {
    if (!currentStoryPage || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    if (readingAloud) {
      setReadingAloud(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(
      `${currentStoryPage.title}. ${currentStoryPage.body}. ${
        currentStoryPage.quote || ''
      }`,
    );
    utterance.lang = 'ko-KR';
    utterance.rate = age === '4–6세' ? 0.78 : age === '7–9세' ? 0.86 : 0.94;
    const koreanVoice = window.speechSynthesis
      .getVoices()
      .find((voice) => voice.lang.toLowerCase().startsWith('ko'));
    if (koreanVoice) utterance.voice = koreanVoice;
    utterance.onend = () => setReadingAloud(false);
    utterance.onerror = () => setReadingAloud(false);
    setReadingAloud(true);
    window.speechSynthesis.speak(utterance);
  };
  const currentScene = activeScenes[Math.max(0, scene)];
  const previousDecision = scene > 0 ? adventureTrail[scene - 1] : null;
  const currentEcho = previousDecision
    ? currentScene.echoes?.[previousDecision.trait]
    : null;
  const playableSceneIndex = Math.max(0, scene);
  const currentQuest = sceneQuests[playableSceneIndex % sceneQuests.length];
  const currentQuestTargetCount = questTargetCount(age);
  const currentQuestOrder = questOrder(
    playableSceneIndex,
    currentQuestTargetCount,
    pendingChoice?.trait,
  );
  const currentQuestPositions = questPositionsForChoice(
    playableSceneIndex,
    pendingChoice?.trait,
  );
  const currentQuestInstruction =
    age === '4–6세' ? currentQuest.juniorInstruction : currentQuest.instruction;
  const questProgress =
    currentQuest.kind === 'comfort'
      ? questWarmth / 100
      : questHits.length / currentQuestTargetCount;
  const liveTrait =
    choiceResult?.trait || pendingChoice?.trait || previewTrait || null;
  const activeReactionTrait =
    choiceResult?.trait || pendingChoice?.trait || previousDecision?.trait;
  const visibleChoices =
    age === '4–6세' && !showAllYoungChoices
      ? currentScene.choices.slice(0, 2)
      : currentScene.choices;
  const collectedClues = adventureTrail.filter(Boolean);
  const currentStageClue =
    choiceResult?.clue || pendingChoice?.label || previousDecision?.clue;
  const memoryClasses = collectedClues
    .map((decision) => `memory-${decision.trait}`)
    .join(' ');
  const actorJourneyLeft = `${42 + Math.min(1, questProgress) * 14}%`;
  const birthReactionCopy =
    birthReactions[birthReaction % birthReactions.length];
  const sceneBody =
    age === '4–6세'
      ? `${currentScene.body.split(/[.!?]/)[0]}!`
      : currentScene.body;
  const speakAdventureGuide = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    if (adventureSpeaking) {
      setAdventureSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    utterance.rate = age === '4–6세' ? 0.76 : age === '7–9세' ? 0.86 : 0.94;
    const koreanVoice = window.speechSynthesis
      .getVoices()
      .find((voice) => voice.lang.toLowerCase().startsWith('ko'));
    if (koreanVoice) utterance.voice = koreanVoice;
    utterance.onend = () => setAdventureSpeaking(false);
    utterance.onerror = () => setAdventureSpeaking(false);
    setAdventureSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };
  const sceneGuideText = `${currentScene.title}. ${sceneBody}. ${visibleChoices
    .map((choice, index) => `${index + 1}번, ${choice.label}`)
    .join('. ')}`;
  const recommendedAdventureId =
    favoriteWorld === '로봇과 우주'
      ? 'space'
      : favoriteWorld === '동물과 자연'
        ? 'garden'
        : favoriteWorld === '음악과 춤'
          ? 'ocean'
          : favoriteWorld === '마법과 동화'
            ? 'candy'
            : 'dino';
  const reset = () => {
    generationRequest.current?.abort();
    chatRequest.current?.abort();
    closeCamera();
    setImage(null);
    setGenerated([]);
    setGeneratedQuality([]);
    setGenerating(false);
    setRegenerating(false);
    setGenerationNote('');
    setFavoriteColor(colorChoices[0].value);
    setPreserveFocus(focusChoices[0]);
    setCharacterWish('');
    setChildGender(genderChoices[0]);
    setCharacterMood(moodChoices[0].name);
    setFavoriteWorld(worldChoices[0].name);
    setCameraError('');
    setFacingMode('environment');
    setPick(0);
    setScene(0);
    setTheme(0);
    setPage(0);
    setAdventureTrail([]);
    setChoiceResult(null);
    resetAdventureGame();
    setStorybook(null);
    setStorybookImage(null);
    setStorybookTheme(0);
    setBookDirection('next');
    setReadingAloud(false);
    setAdventureSpeaking(false);
    setSavedStorybooks([]);
    setChatError('');
    setChatInput('');
    setMessages([
      {
        role: 'assistant',
        content:
          '안녕! 나는 네 그림에서 태어날 AI 이야기 친구야. 오늘 어떤 상상을 함께 만들어 볼까?',
      },
    ]);
    setPersona(defaultPersona);
    setAge('7–9세');
    setPhotoConsent(false);
    setGuardianVerified(false);
    setPreviousStep('welcome');
    setStep('welcome');
  };

  return (
    <main className="app">
      <header>
        <button className="logo-button" onClick={() => setStep('welcome')}>
          <Logo />
        </button>
        {flowIndex >= 0 && (
          <>
            <div
              className="progress"
              aria-label={`진행 단계 ${flowIndex + 1}/${flow.length}`}
            >
              <div>
                {flow.map((x, i) => (
                  <span
                    aria-current={i === flowIndex ? 'step' : undefined}
                    className={i <= flowIndex ? 'on' : ''}
                    key={x.id}
                  >
                    {x.label}
                  </span>
                ))}
              </div>
              <progress
                aria-label="전체 만들기 진행률"
                max={flow.length}
                value={flowIndex + 1}
              />
            </div>
            <div className="mobile-progress">
              <b>{flow[flowIndex].label}</b>
              <span>
                {flowIndex + 1}/{flow.length}
              </span>
            </div>
          </>
        )}
        <button
          className="parent"
          onClick={() => {
            if (!guardianVerified) setStep('guardian');
            else {
              setPreviousStep(step);
              setStep('parent');
            }
          }}
        >
          <LockKeyhole size={15} /> 보호자
        </button>
      </header>

      {step === 'welcome' && (
        <section className="welcome">
          <div className="welcome-copy">
            <span className="badge">
              <Sparkles size={15} /> 아이의 그림이 살아나는 시간
            </span>
            <h1>
              내가 그린 그림이
              <br />
              <span>
                <em>AI 이야기 친구</em>가 돼요
              </span>
            </h1>
            <p>
              사진·그림·카메라로 보여 주고 취향을 고르면, <br />
              내 그림을 닮은 2D·스티커·보송 3D 친구가 태어나요.
            </p>
            <div className="welcome-action">
              <Button onClick={() => setStep('guardian')}>
                <WandSparkles size={21} /> 그림친구 만들기 <ChevronRight />
              </Button>
              <span>
                <ShieldCheck size={18} /> 보호자와 함께 시작해요
              </span>
            </div>
            <div className="magic-steps" aria-label="그림친구 만들기 과정">
              <span>
                <b>1</b>그림 올리기
              </span>
              <span>
                <b>2</b>친구 탄생
              </span>
              <span>
                <b>3</b>대화와 모험
              </span>
              <span>
                <b>4</b>동화책 완성
              </span>
            </div>
          </div>
          <div className="stage">
            <div className="hero-art">
              <img
                src="/hero-story-v2.webp"
                alt="아이의 색연필 그림이 귀여운 별귀 캐릭터가 되어 모험 세계로 걸어가는 모습"
              />
              <span>
                낙서의 모양과 색을 간직한 채<br />
                <b>AI 이야기 친구로 변신해요</b>
              </span>
            </div>
          </div>
        </section>
      )}

      {step === 'guardian' && (
        <section className="center narrow guardian-view">
          <button className="back" onClick={() => setStep('welcome')}>
            <ArrowLeft size={18} /> 처음으로
          </button>
          <span className="badge">
            <ShieldCheck size={17} /> 보호자 동반 체험 설정
          </span>
          <h2>
            안전한 창작 시간을
            <br />
            준비해 주세요
          </h2>
          <p>
            그림은 캐릭터 변환 중 OpenAI API로 전송되며, 이 서비스에는 저장하지
            않습니다.
          </p>
          <div className="guardian-card">
            <div className="child-profile-fields">
              <label>
                <span>
                  아이 연령대
                  <small>표현의 단순함과 이야기 말투를 맞춰요</small>
                </span>
                <select
                  value={age}
                  onChange={(event) =>
                    setAge(event.target.value as (typeof ageChoices)[number])
                  }
                >
                  {ageChoices.map((choice) => (
                    <option key={choice}>{choice}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>
                  성별 참고 <i>선택</i>
                  <small>직접 고른 취향보다 우선하지 않아요</small>
                </span>
                <select
                  value={childGender}
                  onChange={(event) =>
                    setChildGender(
                      event.target.value as (typeof genderChoices)[number],
                    )
                  }
                >
                  {genderChoices.map((choice) => (
                    <option key={choice}>{choice}</option>
                  ))}
                </select>
              </label>
            </div>
            <p className="profile-principle">
              성별로 색·성격을 단정하지 않고, 아이가 직접 고른 취향을 가장 먼저
              반영해요.
            </p>
            <div className="session-length">
              <span>
                <b>모험 시간</b>
                <small>5개 장면 · 보통 8–12분</small>
              </span>
              <Compass />
            </div>
            <label className="consent">
              <Camera />
              <span>
                <b>그림 변환에 동의</b>
                <small>캐릭터를 만드는 동안만 API로 전송</small>
              </span>
              <input
                type="checkbox"
                checked={photoConsent}
                onChange={(e) => setPhotoConsent(e.target.checked)}
              />
            </label>
            <aside>
              <LockKeyhole />
              <span>
                <b>우리의 약속</b>
                <br />
                위치 정보는 요청하지 않고, 연령·성별 참고·취향·원본 그림과
                대화는 이 서비스의 데이터베이스에 저장하지 않아요.
              </span>
            </aside>
          </div>
          <Button
            disabled={!photoConsent}
            onClick={() => {
              setGuardianVerified(true);
              setStep('upload');
            }}
          >
            동의하고 시작하기 <ChevronRight />
          </Button>
        </section>
      )}

      {step === 'upload' && (
        <section className="center upload">
          <span className="badge">첫 번째 마법</span>
          <h2>내 그림을 보여 주세요!</h2>
          <p>파일로 올리거나 카메라를 열어 화면을 보며 찍을 수 있어요.</p>
          <input
            ref={input}
            hidden
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => load(e.target.files?.[0])}
          />
          <input
            ref={cameraInput}
            hidden
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => load(e.target.files?.[0])}
          />
          {cameraOpen ? (
            <div className="camera-live">
              <div className="camera-frame">
                <video
                  ref={video}
                  autoPlay
                  muted
                  playsInline
                  aria-label="실시간 카메라 미리보기"
                />
                <span className="camera-guide" aria-hidden="true" />
                <button
                  type="button"
                  className="camera-close"
                  onClick={closeCamera}
                  aria-label="카메라 닫기"
                >
                  <X />
                </button>
              </div>
              <div className="camera-controls">
                <button type="button" onClick={() => void flipCamera()}>
                  <SwitchCamera /> 전환
                </button>
                <button
                  type="button"
                  className="camera-shutter"
                  onClick={captureCamera}
                  aria-label="그림 사진 촬영"
                >
                  <span />
                </button>
                <button type="button" onClick={closeCamera}>
                  닫기
                </button>
              </div>
              <small>
                <LockKeyhole /> 미리보기 영상은 기기 밖으로 전송되지 않아요.
              </small>
            </div>
          ) : (
            <button
              type="button"
              aria-label="그림 파일 선택"
              className={`drop ${image ? 'filled' : ''}`}
              onClick={() => input.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') input.current?.click();
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                load(e.dataTransfer.files[0]);
              }}
            >
              {image ? (
                <img src={image} alt="업로드한 아이의 그림" />
              ) : (
                <>
                  <span>
                    <ImagePlus />
                  </span>
                  <b>여기에 그림을 놓아 주세요</b>
                  <small>사진, 그림 파일 JPG·PNG·WEBP</small>
                </>
              )}
            </button>
          )}
          <div className="upload-buttons">
            <Button secondary onClick={() => input.current?.click()}>
              <Upload size={19} />{' '}
              {image ? '다른 그림 고르기' : '그림 파일 고르기'}
            </Button>
            <Button secondary onClick={() => void openCamera()}>
              <Camera size={19} /> 카메라 열기
            </Button>
          </div>
          {cameraError && (
            <div className="camera-error" role="alert">
              {cameraError}
            </div>
          )}
          {image && (
            <>
              <strong className="quality">
                <Check /> 그림을 불러왔어요. 잘리지 않았는지 확인해 주세요.
              </strong>
              <section className="character-direction">
                <div className="direction-heading">
                  <span>
                    <Heart />
                  </span>
                  <div>
                    <h3>어떤 친구가 태어나면 좋을까요?</h3>
                    <p>작은 취향을 알려 주면 세 가지 모습에 함께 반영해요.</p>
                  </div>
                </div>
                <div className="profile-context">
                  <span>
                    <b>{age}</b> 맞춤
                  </span>
                  {childGender !== genderChoices[0] && (
                    <span>{childGender} 참고</span>
                  )}
                  <button type="button" onClick={() => setStep('guardian')}>
                    <Settings /> 프로필 수정
                  </button>
                </div>
                <div
                  className="style-preview-grid"
                  aria-label="생성 스타일 3종"
                >
                  {characterStyles.map((style) => (
                    <article key={style.name}>
                      <img src={style.preview} alt={`${style.name} 예시`} />
                      <span>
                        <b>{style.name}</b>
                        <small>{style.detail}</small>
                      </span>
                    </article>
                  ))}
                </div>
                <div className="direction-fields">
                  <label>
                    <span>꼭 살리고 싶은 부분</span>
                    <select
                      value={preserveFocus}
                      onChange={(event) => setPreserveFocus(event.target.value)}
                    >
                      {focusChoices.map((choice) => (
                        <option key={choice}>{choice}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>내가 바라는 친구</span>
                    <input
                      maxLength={120}
                      value={characterWish}
                      onChange={(event) => setCharacterWish(event.target.value)}
                      placeholder="예: 별 모양 귀를 가진 포근한 친구"
                    />
                  </label>
                </div>
                <div className="taste-pickers">
                  <fieldset>
                    <legend>친구의 분위기</legend>
                    <div>
                      {moodChoices.map((choice) => (
                        <button
                          type="button"
                          key={choice.name}
                          aria-pressed={characterMood === choice.name}
                          onClick={() => setCharacterMood(choice.name)}
                        >
                          <i>{choice.icon}</i> {choice.name}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend>좋아하는 세계</legend>
                    <div>
                      {worldChoices.map((choice) => (
                        <button
                          type="button"
                          key={choice.name}
                          aria-pressed={favoriteWorld === choice.name}
                          onClick={() => setFavoriteWorld(choice.name)}
                        >
                          <i>{choice.icon}</i> {choice.name}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                </div>
                <fieldset className="color-picker">
                  <legend>
                    <Palette /> 좋아하는 색
                  </legend>
                  <div>
                    {colorChoices.map((choice) => (
                      <button
                        type="button"
                        key={choice.name}
                        aria-pressed={favoriteColor === choice.value}
                        onClick={() => setFavoriteColor(choice.value)}
                      >
                        <i style={{ backgroundColor: choice.color }} />
                        {choice.name}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </section>
            </>
          )}
          <Button
            disabled={!image || generating || regenerating}
            onClick={generateCharacter}
          >
            {generating ? (
              <LoaderCircle className="spin" size={19} />
            ) : (
              <Sparkles size={19} />
            )}{' '}
            {generating ? '친구가 태어나는 중…' : 'AI 캐릭터로 탄생시키기'}
          </Button>
          {generating && (
            <output className="magic-progress" aria-live="polite">
              <i />
              <span>{generationNote}</span>
              <small>
                고화질 세 모습을 동시에 만들어요. 최대 3분 걸릴 수 있어요.
              </small>
            </output>
          )}
          {!generating && generationNote && (
            <div className="generation-error" role="alert">
              {generationNote}
            </div>
          )}
          <small className="privacy">
            <LockKeyhole size={14} /> 사진 메타데이터는 기기에서 제거한 뒤
            전송해요.
          </small>
        </section>
      )}

      {step === 'character' && (
        <section className="center characters">
          <span className="badge">짜잔! 그림친구가 태어났어요</span>
          <h2>원본과 나란히 보며 골라요</h2>
          <p>{generationNote}</p>
          <div className="transform-proof">
            <article className="source-drawing">
              <small>아이의 원본 그림</small>
              {image && <img src={image} alt="변환 전 원본 그림" />}
            </article>
            <span>
              <WandSparkles /> AI 변환
            </span>
            <article className="birth-stage" ref={birthStageNode}>
              <small>
                <Sparkles /> 배경에서 완전히 꺼낸 살아 있는 친구
              </small>
              <div className="birth-glow" aria-hidden="true" />
              <div className="birth-shadow" aria-hidden="true" />
              <button
                type="button"
                className="birth-character-touch"
                aria-label={`${persona.name}에게 인사하기`}
                onClick={touchBirthCharacter}
              >
                <span
                  key={birthReaction}
                  className={`birth-gesture gesture-${birthReaction % 4}`}
                >
                  <span className="birth-idle">
                    <Friend image={generated[pick]} variant="birth-sprite" />
                  </span>
                </span>
              </button>
              {birthReaction > 0 && (
                <span className="birth-heart-burst" aria-hidden="true">
                  <i>♥</i>
                  <i>✦</i>
                  <i>♥</i>
                </span>
              )}
              <output>{birthReactionCopy}</output>
              <span className="birth-touch-hint">
                <Heart /> 친구를 톡 눌러 인사해 보세요
              </span>
            </article>
          </div>
          <div className="preference-summary" aria-label="반영한 캐릭터 취향">
            <span>{age} 맞춤</span>
            {childGender !== genderChoices[0] && (
              <span>{childGender} 참고</span>
            )}
            <span>
              <Star /> {characterMood}
            </span>
            <span>
              <Compass /> {favoriteWorld}
            </span>
            <span>
              <Palette /> {favoriteColor}
            </span>
            <span>
              <Heart /> {preserveFocus} 살리기
            </span>
            {characterWish && <span>“{characterWish}”</span>}
          </div>
          <h3 className="choose-title">가장 마음에 드는 모습을 골라 주세요</h3>
          <div className="candidates">
            {characterStyles.map((style, i) => (
              <button
                disabled={!generated[i]}
                className={pick === i ? 'selected' : ''}
                key={style.name}
                onClick={() => setPick(i)}
              >
                {pick === i && (
                  <i className="check">
                    <Check />
                  </i>
                )}
                <span>
                  {generated[i] ? (
                    <Friend image={generated[i]} variant={`v${i}`} />
                  ) : (
                    <small>
                      {generating ? '친구가' : '이번에는'}
                      <br />
                      {generating ? '오는 중…' : '완성하지 못했어요'}
                    </small>
                  )}
                </span>
                <b>{style.name}</b>
                <small>{style.detail}</small>
                {generatedQuality[i]?.transparent && (
                  <strong className="alpha-pass">
                    <Check /> 진짜 투명 배경 검증
                  </strong>
                )}
                {generatedQuality[i]?.checked &&
                  generatedQuality[i]?.passed && (
                    <strong className="cute-pass">
                      <Heart fill="currentColor" /> 귀여움 검수{' '}
                      {generatedQuality[i]?.score ?? '완료'}점
                      {generatedQuality[i]?.polished && <em>자동 보정</em>}
                    </strong>
                  )}
              </button>
            ))}
          </div>
          <div className="regenerate-row">
            <Button
              secondary
              disabled={regenerating || generating || !generated[pick]}
              onClick={() => void regenerateSelected()}
            >
              {regenerating ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <RefreshCw size={18} />
              )}{' '}
              {regenerating
                ? '더 귀엽게 다듬는 중…'
                : `${characterStyles[pick].name} 고화질로 다시 만들기`}
            </Button>
            <button
              type="button"
              onClick={() => {
                setGenerationNote('');
                setStep('upload');
              }}
            >
              <Settings /> 취향 바꾸기
            </button>
            <small>
              선택한 모습만 새로 만들고 다른 두 모습은 그대로 남겨요.
            </small>
          </div>
          <div className="persona-card">
            <h3>
              <MessageCircle /> 친구의 마음을 만들어 주세요
            </h3>
            <p>
              짧게 적어도 괜찮아요. 이 설정은 대화와 동화책에 함께 나타나요.
            </p>
            <div>
              <label>
                이름
                <input
                  maxLength={20}
                  value={persona.name}
                  onChange={(e) =>
                    setPersona({ ...persona, name: e.target.value })
                  }
                />
              </label>
              <label>
                좋아하는 것
                <input
                  maxLength={40}
                  value={persona.likes}
                  onChange={(e) =>
                    setPersona({ ...persona, likes: e.target.value })
                  }
                />
              </label>
              <label>
                특별한 능력
                <input
                  maxLength={60}
                  value={persona.ability}
                  onChange={(e) =>
                    setPersona({ ...persona, ability: e.target.value })
                  }
                />
              </label>
              <label>
                성격 두 가지
                <input
                  maxLength={40}
                  value={persona.traits}
                  onChange={(e) =>
                    setPersona({ ...persona, traits: e.target.value })
                  }
                />
              </label>
              <label>
                우스운 버릇
                <input
                  maxLength={60}
                  value={persona.quirk}
                  onChange={(e) =>
                    setPersona({ ...persona, quirk: e.target.value })
                  }
                />
              </label>
            </div>
          </div>
          <Button
            onClick={() => {
              setMessages([
                {
                  role: 'assistant',
                  content: `안녕! 나는 네 그림에서 태어난 AI 이야기 친구 ${persona.name}야. 오늘 어떤 상상을 함께 만들어 볼까?`,
                },
              ]);
              setStep('chat');
            }}
          >
            <MessageCircle /> {persona.name}와 대화 시작하기 <ChevronRight />
          </Button>
        </section>
      )}

      {step === 'chat' && (
        <section className="chat-view">
          <aside className="chat-persona">
            <Friend image={chosenImage} />
            <span className="online">
              <i /> 이야기할 준비 완료
            </span>
            <h2>{persona.name}</h2>
            <p>{persona.traits}</p>
            <dl>
              <div>
                <dt>좋아하는 것</dt>
                <dd>{persona.likes}</dd>
              </div>
              <div>
                <dt>특별한 능력</dt>
                <dd>{persona.ability}</dd>
              </div>
              <div>
                <dt>우스운 버릇</dt>
                <dd>{persona.quirk}</dd>
              </div>
            </dl>
            <small>
              <ShieldCheck /> 아동 안전 규칙을 적용하며 보호자와 함께 사용하는
              AI 친구예요.
            </small>
          </aside>
          <div className="chat-main">
            <header>
              <div>
                <MessageCircle />
                <span>
                  <b>{persona.name}와 이야기</b>
                  <small>{age} 맞춤 · 아동 안전 규칙 적용</small>
                </span>
              </div>
              <Button
                secondary
                onClick={() => {
                  setScene(-1);
                  setAdventureTrail([]);
                  setChoiceResult(null);
                  resetAdventureGame();
                  setStep('adventure');
                }}
              >
                <Compass /> 모험 고르기
              </Button>
            </header>
            <div
              className="messages"
              role="log"
              aria-live="polite"
              aria-label={`${persona.name}와의 대화`}
            >
              {messages.map((m, i) => (
                <div key={i} className={`message ${m.role}`}>
                  <span>
                    {m.role === 'assistant' ? (
                      <Friend image={chosenImage} />
                    ) : (
                      '나'
                    )}
                  </span>
                  <p>{m.content}</p>
                </div>
              ))}
              {chatting && (
                <div className="message assistant">
                  <span>
                    <Friend image={chosenImage} />
                  </span>
                  <p className="typing" aria-label="답장을 생각하는 중">
                    <i />
                    <i />
                    <i />
                  </p>
                </div>
              )}
              <div ref={messagesEnd} />
            </div>
            {chatError && (
              <div className="chat-error" role="alert">
                {chatError}
              </div>
            )}
            <div className="quick-prompts">
              {[
                '오늘 기분이 어때?',
                '구름 위 숨은 놀이터를 만들자',
                '재미있는 능력을 보여 줘',
              ].map((x) => (
                <button key={x} onClick={() => setChatInput(x)}>
                  {x}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendChat();
              }}
            >
              <input
                aria-label="그림친구에게 할 말"
                placeholder={`${persona.name}에게 하고 싶은 말을 적어 보세요`}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                maxLength={400}
              />
              <button
                disabled={!chatInput.trim() || chatting}
                aria-label="메시지 보내기"
              >
                <Send />
              </button>
            </form>
          </div>
        </section>
      )}

      {step === 'adventure' &&
        (scene < 0 ? (
          <section className="center adventure-picker">
            <span className="badge">
              <Compass /> 오늘의 모험을 골라요
            </span>
            <h2>오늘은 어떤 이야기의 주인공이 될까요?</h2>
            <p>
              8개의 세계에서 고른 행동이 다음 장면과 마지막 결말을 바꿔요.
              친구가 뛰고 돌며 반응하고 배경도 바뀌어요. 단서를 모아 우리만의
              동화책을 완성해 보세요.
            </p>
            <img
              className="adventure-worlds"
              src="/adventure-worlds-v4.webp"
              alt="달빛 숲, 산호 마을, 구름섬, 별 우체국, 공룡 도서관, 디저트 왕국, 북극광 열차, 엄지 정원 도시가 이어진 동화 지도"
            />
            <div className="adventure-filter-note">
              <Sparkles /> {age} · {favoriteWorld} 취향을 바탕으로 추천했어요
            </div>
            <div className="theme-grid">
              {adventureStories.map((item, i) => (
                <button
                  key={item.id}
                  className={`${item.color} ${
                    item.id === recommendedAdventureId ? 'recommended' : ''
                  }`}
                  onClick={() => {
                    setTheme(i);
                    setScene(0);
                    setAdventureTrail([]);
                    setChoiceResult(null);
                    resetAdventureGame();
                    setStorybook(null);
                  }}
                >
                  <i>{item.icon}</i>
                  <span>
                    <b>
                      {item.title}
                      {item.id === recommendedAdventureId && (
                        <em>내 취향 추천</em>
                      )}
                    </b>
                    <small>{item.desc}</small>
                  </span>
                  <ChevronRight />
                </button>
              ))}
            </div>
            <button className="back-to-chat" onClick={() => setStep('chat')}>
              <MessageCircle /> 대화를 조금 더 할래요
            </button>
          </section>
        ) : (
          <section className="adventure adventure-live">
            <div className="adventure-meta">
              <div>
                <b>{activeAdventure.title}</b>
                <span>
                  {scene + 1} / {activeScenes.length} 장면 · {age} 맞춤 · 약{' '}
                  {duration}
                </span>
              </div>
              <button
                onClick={() => {
                  setScene(-1);
                  setAdventureTrail([]);
                  setChoiceResult(null);
                  resetAdventureGame();
                }}
              >
                <Compass /> 다른 모험
              </button>
            </div>
            <div className="game-hud" aria-label="모험에서 실제로 모은 것">
              <span>
                <Sparkles /> 찾은 단서
                <b>
                  {collectedClues.length} / {activeScenes.length}
                </b>
              </span>
              <span>
                <Heart fill="currentColor" /> 길잡이
                <b>{collectedClues[0]?.clue || '첫 친구를 기다려요'}</b>
              </span>
              <button
                type="button"
                aria-pressed={soundOn}
                aria-label={soundOn ? '효과음 끄기' : '효과음 켜기'}
                onClick={() => setSoundOn((current) => !current)}
              >
                {soundOn ? <Volume2 /> : <VolumeX />}
                {soundOn ? '효과음 켜짐' : '효과음 꺼짐'}
              </button>
            </div>
            <div className="adventure-trail" aria-label="모험 단서 모음">
              {activeScenes.map((item, index) => {
                const decision = adventureTrail[index];
                return (
                  <span
                    key={item.chapter}
                    className={`${index === scene ? 'current' : ''} ${
                      decision ? 'collected' : ''
                    }`}
                  >
                    <i>
                      {decision ? traitMeta[decision.trait].icon : index + 1}
                    </i>
                    {decision ? decision.clue : `${index + 1}장`}
                  </span>
                );
              })}
            </div>
            <div
              className={`cinematic-stage theme-${activeAdventure.color} stage-${scene} phase-${adventurePhase} action-${
                choiceResult?.trait || pendingChoice?.trait || 'idle'
              } preview-${previewTrait || 'none'} path-${
                choiceResult?.trait ||
                pendingChoice?.trait ||
                previousDecision?.trait ||
                'start'
              } ${memoryClasses} ${actorPetted ? 'is-petted' : ''} ${
                activeAdventure.id === 'moon' ? 'moon-world' : ''
              }`}
              ref={stageNode}
              onPointerMove={updateStageParallax}
              onPointerLeave={resetStageParallax}
              style={
                {
                  '--actor-left': actorJourneyLeft,
                } as React.CSSProperties
              }
            >
              <div className="camera-rig" aria-hidden="true">
                <div className="camera-scene">
                  <div
                    className="world-backdrop"
                    style={
                      activeAdventure.id === 'moon'
                        ? {
                            backgroundImage: `url(/moon-forest-scene-${scene + 1}.webp)`,
                          }
                        : undefined
                    }
                  />
                  <div className="world-grade" />
                  <div className="world-change" />
                </div>
              </div>
              <div className="depth-light depth-far" aria-hidden="true" />
              <div className="depth-light depth-mid" aria-hidden="true" />
              <div className="stage-light" aria-hidden="true" />
              <div className="stage-motes" aria-hidden="true">
                <i>✦</i>
                <i>·</i>
                <i>✧</i>
                <i>·</i>
                <i>✦</i>
              </div>
              {pendingChoice &&
                adventurePhase === 'playing' &&
                currentQuest.kind !== 'comfort' && (
                  <div
                    className={`scene-quest-targets quest-${currentQuest.kind}`}
                    aria-label={currentQuest.title}
                  >
                    {Array.from(
                      { length: currentQuestTargetCount },
                      (_, targetIndex) => {
                        const position = currentQuestPositions[targetIndex];
                        const collected = questHits.includes(targetIndex);
                        const isNext =
                          currentQuest.ordered &&
                          age !== '4–6세' &&
                          currentQuestOrder[questHits.length] === targetIndex;
                        return (
                          <button
                            type="button"
                            key={`${currentQuest.id}-${targetIndex}`}
                            className={`${collected ? 'is-collected' : ''} ${
                              isNext ? 'is-next' : ''
                            } ${
                              questHintTarget === targetIndex ? 'is-hint' : ''
                            }`}
                            style={
                              {
                                '--target-x': `${position.x}%`,
                                '--target-y': `${position.y}%`,
                                '--target-rotate': `${position.rotate}deg`,
                                '--target-delay': `${targetIndex * -0.34}s`,
                              } as React.CSSProperties
                            }
                            disabled={collected}
                            aria-label={`${targetIndex + 1}번째 ${currentQuest.eyebrow} 빛`}
                            onClick={() => touchQuestTarget(targetIndex)}
                          >
                            <span>{currentQuest.symbols[targetIndex]}</span>
                            <i>{collected ? '찾았어!' : targetIndex + 1}</i>
                          </button>
                        );
                      },
                    )}
                    {currentQuest.kind === 'bridge' && (
                      <svg
                        className="quest-bridge-line"
                        viewBox="0 0 100 60"
                        preserveAspectRatio="none"
                        aria-hidden="true"
                      >
                        <path d="M 48 23 C 61 10, 72 18, 79 30 S 88 41, 91 50" />
                      </svg>
                    )}
                  </div>
                )}
              {pendingChoice &&
                adventurePhase === 'playing' &&
                currentQuest.kind === 'comfort' && (
                  <div
                    className="comfort-aura"
                    style={
                      {
                        '--warmth-scale': `${0.74 + questWarmth / 360}`,
                        '--warmth-glow': `${24 + questWarmth / 2}px`,
                        '--warmth-opacity': `${0.4 + questWarmth / 170}`,
                      } as React.CSSProperties
                    }
                    aria-hidden="true"
                  >
                    <span>♥</span>
                    <i />
                  </div>
                )}
              <article className="stage-story">
                <span>{currentScene.chapter}</span>
                <h2>{currentScene.title}</h2>
                <p>{sceneBody}</p>
                {currentEcho && !choiceResult && (
                  <strong
                    className={`choice-echo path-${previousDecision?.trait}`}
                  >
                    <Sparkles /> 지난 선택이 진짜 이어졌어요: {currentEcho}
                  </strong>
                )}
              </article>

              <div
                className={`actor-rig idle-gesture-${actorGesture} ${
                  actorPetted ? 'is-petted' : ''
                }`}
              >
                {(actorPetted || activeReactionTrait) && (
                  <output className="reaction-bubble">
                    {actorPetted
                      ? '네 손길이 느껴져! 같이 가자!'
                      : pendingChoice
                        ? `“${pendingChoice.label}” 방법, 같이 해 보자!`
                        : activeReactionTrait
                          ? adventureReactions[activeReactionTrait]
                          : '안녕! 나를 톡 눌러 줬구나!'}
                  </output>
                )}
                <div className="actor-shadow" aria-hidden="true" />
                <div
                  key={`${theme}-${scene}-${choiceResult?.trait || pendingChoice?.trait || 'enter'}`}
                  className="actor-action"
                  onAnimationEnd={completeActorAction}
                >
                  <div className="actor-look">
                    <div className="actor-gesture">
                      <button
                        type="button"
                        className="actor-touch"
                        aria-label={`${persona.name}에게 인사하기`}
                        onClick={petAdventureCharacter}
                      >
                        <span className="actor-idle">
                          <Friend image={chosenImage} variant="actor-sprite" />
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
                {choiceResult && <i className="reaction-burst">✦</i>}
                {actorPetted && (
                  <span className="actor-heart-burst" aria-hidden="true">
                    <i>♥</i>
                    <i>✦</i>
                    <i>♥</i>
                  </span>
                )}
              </div>

              {collectedClues.length > 0 && (
                <div className="stage-memories" aria-label="함께 이어지는 단서">
                  {collectedClues.slice(0, 4).map((decision, index) => (
                    <span
                      key={`${decision.chapter}-${decision.clue}`}
                      className={`path-${decision.trait}`}
                      title={decision.clue}
                    >
                      <i>{clueGlyph(decision)}</i>
                      <b>{decision.clue}</b>
                      {index === 0 && <em>{guideGlyph[decision.trait]}</em>}
                    </span>
                  ))}
                </div>
              )}

              <div className="stage-object" aria-hidden="true">
                <i>
                  {liveTrait ? traitMeta[liveTrait].icon : activeAdventure.icon}
                </i>
                <span>{currentStageClue || '이번 장면의 비밀'}</span>
              </div>
              <div
                className={`world-mutation mutation-${liveTrait || 'idle'} ${
                  choiceResult ? 'is-real' : pendingChoice ? 'is-building' : ''
                }`}
                aria-hidden="true"
              >
                <i>{liveTrait ? traitMeta[liveTrait].icon : '✦'}</i>
                <span />
              </div>
              {adventurePhase === 'acting' && choiceResult && (
                <div className="reward-flight" aria-hidden="true">
                  <i>{clueGlyph(choiceResult)}</i>
                  <span>{choiceResult.clue}</span>
                </div>
              )}
              <div className="stage-foreground" aria-hidden="true" />

              {adventurePhase === 'acting' && choiceResult && (
                <output className="action-caption">
                  <Sparkles /> {adventureActionEffects[choiceResult.trait]}
                </output>
              )}

              {!choiceResult && !pendingChoice ? (
                <div className="stage-choice-dock">
                  <div className="says">
                    <Volume2 /> “
                    {scene === activeScenes.length - 1
                      ? '마지막 선택이 결말을 바로 바꿔. 네 방법을 골라 줘!'
                      : '골라 줘! 내가 직접 움직여서 세상을 바꿔 볼게!'}
                    ”
                  </div>
                  <button
                    type="button"
                    className="adventure-read-button"
                    aria-pressed={adventureSpeaking}
                    onClick={() => speakAdventureGuide(sceneGuideText)}
                  >
                    {adventureSpeaking ? <VolumeX /> : <Volume2 />}
                    {adventureSpeaking
                      ? '안내 멈추기'
                      : '장면과 선택 읽어 주기'}
                  </button>
                  <div
                    className={`choices choice-count-${visibleChoices.length}`}
                  >
                    {visibleChoices.map((choice, index) => (
                      <button
                        key={choice.label}
                        className={`path-${choice.trait} ${
                          previewTrait === choice.trait ? 'is-previewed' : ''
                        }`}
                        onPointerEnter={(event) => {
                          if (event.pointerType === 'mouse')
                            setPreviewTrait(choice.trait);
                        }}
                        onPointerLeave={() => setPreviewTrait(null)}
                        onFocus={() => setPreviewTrait(choice.trait)}
                        onBlur={() => setPreviewTrait(null)}
                        onClick={() => beginAdventureChoice(choice)}
                      >
                        <i>{index + 1}</i>
                        <span>{choice.label}</span>
                        <small>{adventureActionEffects[choice.trait]}</small>
                        <ChevronRight />
                      </button>
                    ))}
                  </div>
                  {age === '4–6세' &&
                    currentScene.choices.length > 2 &&
                    !showAllYoungChoices && (
                      <button
                        type="button"
                        className="more-young-choices"
                        onClick={() => setShowAllYoungChoices(true)}
                      >
                        <Sparkles /> 다른 멋진 방법도 보기
                      </button>
                    )}
                  <small className="story-event">
                    <Sparkles /> 선택하면 직접 만지고 움직이는 짧은 놀이가
                    시작돼요 · 다음 장면과 결말까지 기억해요
                  </small>
                </div>
              ) : !choiceResult && pendingChoice ? (
                <div className={`stage-quest-dock quest-${currentQuest.kind}`}>
                  <div className="quest-head">
                    <span>{currentQuest.eyebrow}</span>
                    <b>{currentQuest.title}</b>
                    <small>“{pendingChoice.label}” 방법을 만드는 중</small>
                  </div>
                  <div className="quest-main">
                    <p>{questMessage || currentQuestInstruction}</p>
                    {currentQuest.kind === 'comfort' ? (
                      <label className="warmth-control">
                        <span>
                          마음의 빛 <b>{questWarmth}%</b>
                        </span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="2"
                          value={questWarmth}
                          aria-label="따뜻한 마음의 빛 보내기"
                          onChange={(event) =>
                            warmSceneHeart(Number(event.target.value))
                          }
                        />
                        <button
                          type="button"
                          onClick={() => warmSceneHeart(questWarmth + 20)}
                        >
                          <Heart fill="currentColor" /> 빛 한 줌 보내기
                        </button>
                      </label>
                    ) : (
                      <div className="quest-progress" aria-label="놀이 진행률">
                        <progress
                          max={currentQuestTargetCount}
                          value={questHits.length}
                        />
                        <span>
                          {Array.from(
                            { length: currentQuestTargetCount },
                            (_, index) => (
                              <i
                                key={index}
                                className={
                                  index < questHits.length ? 'is-filled' : ''
                                }
                              />
                            ),
                          )}
                        </span>
                        <b>
                          {questHits.length} / {currentQuestTargetCount}
                        </b>
                      </div>
                    )}
                  </div>
                  <div className="quest-actions">
                    <button
                      type="button"
                      className="quest-read-button"
                      aria-pressed={adventureSpeaking}
                      onClick={() =>
                        speakAdventureGuide(
                          `${currentQuest.title}. ${currentQuestInstruction}`,
                        )
                      }
                    >
                      {adventureSpeaking ? <VolumeX /> : <Volume2 />}
                      {adventureSpeaking ? '멈추기' : '놀이 읽어 주기'}
                    </button>
                    <button type="button" onClick={cancelPendingChoice}>
                      <ArrowLeft /> 다른 방법 고르기
                    </button>
                    <button type="button" onClick={completeQuestWithFriend}>
                      <Heart /> 친구와 함께 완성하기
                    </button>
                  </div>
                </div>
              ) : choiceResult ? (
                <div className={`stage-outcome path-${choiceResult.trait}`}>
                  <div className="result-icon">
                    {traitMeta[choiceResult.trait].icon}
                  </div>
                  <span>{choiceResult.label} 선택으로 세상이 달라졌어요</span>
                  <h3>{choiceResult.result}</h3>
                  <p className="clue-earned">
                    <Star fill="currentColor" /> 새 단서{' '}
                    <b>{choiceResult.clue}</b>가 주머니로 쏙!
                  </p>
                  {previousDecision && (
                    <p className="carry-forward">
                      <Heart fill="currentColor" /> {previousDecision.clue}도
                      이번 일을 함께 도왔어요.
                    </p>
                  )}
                  <Button
                    disabled={adventurePhase !== 'resolved'}
                    onClick={continueAdventure}
                  >
                    {adventurePhase !== 'resolved' ? (
                      <>
                        <LoaderCircle className="spin" /> 캐릭터가 행동하는 중…
                      </>
                    ) : scene === activeScenes.length - 1 ? (
                      <>
                        <BookOpen /> 이 선택으로 완성된 결말 읽기{' '}
                        <ChevronRight />
                      </>
                    ) : (
                      <>
                        새로 바뀐 다음 장면으로 <ChevronRight />
                      </>
                    )}
                  </Button>
                </div>
              ) : null}
              <output className="stage-live-status" aria-live="polite">
                {pendingChoice
                  ? questMessage || currentQuestInstruction
                  : choiceResult
                    ? choiceResult.result
                    : '행동을 고르면 캐릭터와 세계가 함께 반응해요.'}
              </output>
              <div
                className="scene-wipe"
                aria-hidden="true"
                onAnimationEnd={(event) => {
                  if (
                    adventurePhase === 'exiting' &&
                    event.target === event.currentTarget &&
                    event.animationName === 'scene-cover'
                  )
                    finishAdventureTransition();
                }}
              />
            </div>
          </section>
        ))}

      {step === 'book' && (
        <section className="book">
          <div className="book-title">
            <span className="badge">
              <BookOpen /> 세상에 한 권뿐인 동화
            </span>
            <h2>우리의 선택이 진짜 동화책이 됐어요</h2>
            <p>
              장면마다 고른 행동과 모은 단서가 그대로 이어지는 우리만의
              이야기예요.
            </p>
            <div className="book-achievement" aria-label="완성한 모험 기록">
              <span>
                <Sparkles />
                <b>{adventureTrail.length}</b>개 단서
              </span>
              <span>
                <Heart fill="currentColor" />
                <b>{adventureTrail[0]?.clue || '나만의 친구'}</b>
              </span>
              <span>
                <BookOpen />
                <b>{bookAdventure.reward}</b>
              </span>
            </div>
          </div>
          <div className="book-toolbar" aria-label="동화책 도구">
            <button
              type="button"
              className={readingAloud ? 'reading' : ''}
              aria-pressed={readingAloud}
              onClick={toggleReadAloud}
            >
              {readingAloud ? <Pause /> : <Play />}
              {readingAloud ? '낭독 멈추기' : '이 페이지 읽어 주기'}
            </button>
            <button type="button" onClick={() => window.print()}>
              <Printer /> 인쇄·PDF로 간직하기
            </button>
          </div>
          <div className={`storybook-stage theme-${bookAdventure.color}`}>
            <div className="storybook-shell">
              <button
                className="page-arrow previous"
                aria-label="이전 페이지"
                disabled={page === 0}
                onClick={() => moveBookPage(page - 1)}
              >
                <ArrowLeft />
              </button>
              <StorySpread
                key={`${page}-${bookDirection}`}
                storyPage={currentStoryPage}
                adventure={bookAdventure}
                image={storybookImage || chosenImage}
                pageNumber={page + 1}
                totalPages={storyPages.length}
                direction={bookDirection}
              />
              <button
                className="page-arrow next"
                aria-label="다음 페이지"
                disabled={page === storyPages.length - 1}
                onClick={() => moveBookPage(page + 1)}
              >
                <ChevronRight />
              </button>
            </div>
          </div>
          <div className="page-caption" aria-live="polite">
            <span>{currentStoryPage.eyebrow}</span>
            <b>{currentStoryPage.title}</b>
          </div>
          <div className="dots">
            {storyPages.map((storyPage, i) => (
              <button
                aria-label={`${i + 1}페이지 ${storyPage.title}로 이동`}
                aria-current={i === page ? 'page' : undefined}
                className={i === page ? 'on' : ''}
                key={`${storyPage.kind}-${i}`}
                onClick={() => moveBookPage(i)}
              />
            ))}
          </div>
          {savedStorybooks.length > 0 && (
            <section className="storybook-library" aria-label="내 동화 보관함">
              <span>
                <BookOpen /> 내 동화 보관함
              </span>
              <div>
                {savedStorybooks.map((savedBook, index) => (
                  <button
                    type="button"
                    key={savedBook.id}
                    aria-current={
                      storybook === savedBook.pages ? 'true' : undefined
                    }
                    onClick={() => {
                      setStorybook(savedBook.pages);
                      setStorybookImage(savedBook.image);
                      setStorybookTheme(savedBook.theme);
                      setAdventureTrail(savedBook.trail);
                      setPage(0);
                      setBookDirection('previous');
                    }}
                  >
                    <b>{index + 1}번째 모험</b>
                    <small>{savedBook.title}</small>
                  </button>
                ))}
              </div>
            </section>
          )}
          <div className="book-buttons">
            <Button secondary onClick={() => moveBookPage(0)}>
              <RotateCcw /> 처음부터 읽기
            </Button>
            <button
              className="button secondary"
              onClick={() => {
                setScene(0);
                setAdventureTrail([]);
                setChoiceResult(null);
                resetAdventureGame();
                setStep('adventure');
              }}
            >
              <Compass /> 같은 세계 다시 모험하기
            </button>
            <Button
              onClick={() => {
                setPreviousStep('book');
                setStep('parent');
              }}
            >
              <ShieldCheck /> 보호자에게 보여주기
            </Button>
          </div>
          <div
            className={`print-book theme-${bookAdventure.color}`}
            aria-hidden="true"
          >
            {storyPages.map((storyPage, index) => (
              <StorySpread
                key={`print-${storyPage.kind}-${index}`}
                storyPage={storyPage}
                adventure={bookAdventure}
                image={storybookImage || chosenImage}
                pageNumber={index + 1}
                totalPages={storyPages.length}
              />
            ))}
          </div>
        </section>
      )}

      {step === 'parent' && (
        <section className="center parent-view">
          <span className="badge">
            <Settings /> 보호자 공간 · 현재 세션
          </span>
          <h2>아이의 창작 여정을 확인해요</h2>
          <p>
            이 화면은 현재 열린 세션의 결과만 보여 줍니다. 브라우저를 닫으면
            보관되지 않아요.
          </p>
          <div className="parent-list">
            {generated.length > 0 && (
              <article>
                <i>★</i>
                <span>
                  <b>{persona.name}</b>
                  <small>선택한 캐릭터 1개 · 오늘 생성</small>
                </span>
                <button onClick={() => setStep('character')}>보기</button>
              </article>
            )}
            {adventureTrail.length >= activeScenes.length && (
              <article>
                <i>▤</i>
                <span>
                  <b>{storyPages[0].title}</b>
                  <small>동화책 1권 · {storyPages.length}페이지</small>
                </span>
                <button onClick={() => setStep('book')}>읽기</button>
              </article>
            )}
            <article>
              <i>✓</i>
              <span>
                <b>개인정보 보호 상태</b>
                <small>원본 음성 없음 · 위치 정보 없음 · 서버 저장 없음</small>
              </span>
            </article>
            {!image && (
              <div className="empty-parent">
                아직 만든 캐릭터가 없어요. 그림 한 장으로 시작해 보세요.
              </div>
            )}
          </div>
          <div className="summary">
            <b>현재 세션</b>
            <span>
              완료한 장면<strong>{Math.max(0, adventureTrail.length)}</strong>
            </span>
            <span>
              이야기 선택<strong>{adventureTrail.length}</strong>
            </span>
            <span>
              모험 길이<strong>{duration}</strong>
            </span>
          </div>
          <div className="parent-actions">
            <Button
              secondary
              onClick={() =>
                setStep(previousStep === 'parent' ? 'welcome' : previousStep)
              }
            >
              <Sparkles /> 아이 화면으로 돌아가기
            </Button>
            <button className="danger" onClick={reset}>
              <Trash2 /> 현재 세션 모두 지우기
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
