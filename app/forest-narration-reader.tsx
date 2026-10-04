'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Square, Volume2 } from 'lucide-react';
import {
  cancelLocalSpeech,
  localKoreanVoice,
  LOCAL_SPEECH_UNAVAILABLE,
} from './local-speech';
import './forest-narration-reader.css';

type ForestNarration = {
  dialogue: string;
  objective: string;
  choices: readonly { label: string }[];
};

export type ForestNarrationReaderProps = ForestNarration & {
  /** Changes even when two successive actions happen to display the same text. */
  revisionKey: string | number;
  suspended: boolean;
  suspendedReason?: string;
};

export type ForestNarrationReaderHandle = { stop: () => void };

/** Read only the current, already age-adjusted copy and visible choice labels. */
export function forestNarrationText({
  dialogue,
  objective,
  choices,
}: ForestNarration): string {
  const lines: string[] = [];
  const story = dialogue.trim();
  const task = objective.trim();
  if (story) lines.push(story);
  if (task && task !== story) lines.push(`지금 할 일. ${task}`);
  const labels = choices.map((choice) => choice.label.trim()).filter(Boolean);
  if (labels.length) lines.push(`고를 수 있어요. ${labels.join('\n또는, ')}`);
  return lines.join('\n');
}

export const ForestNarrationReader = forwardRef<
  ForestNarrationReaderHandle,
  ForestNarrationReaderProps
>(function ForestNarrationReader(
  { dialogue, objective, choices, revisionKey, suspended, suspendedReason },
  ref,
) {
  const text = forestNarrationText({ dialogue, objective, choices });
  const speech = useRef<SpeechSynthesisUtterance | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [available, setAvailable] = useState(false);
  const [error, setError] = useState('');
  const hintId = useId();
  const stop = useCallback(() => {
    cancelLocalSpeech(speech);
    setSpeaking(false);
  }, []);

  useImperativeHandle(ref, () => ({ stop }), [stop]);

  useEffect(() => {
    const updateVoices = () => {
      const voice = localKoreanVoice();
      setAvailable(Boolean(voice));
      if (voice) setError('');
      const selected = speech.current?.voice;
      // A removed/replaced local voice must never fall back to a device default.
      if (
        selected &&
        (!voice ||
          voice.voiceURI !== selected.voiceURI ||
          voice.name !== selected.name ||
          voice.lang !== selected.lang)
      )
        stop();
    };
    const stopWhenHidden = () => {
      if (document.hidden) stop();
    };
    updateVoices();
    const synthesis = window.speechSynthesis;
    synthesis?.addEventListener('voiceschanged', updateVoices);
    document.addEventListener('visibilitychange', stopWhenHidden);
    return () => {
      synthesis?.removeEventListener('voiceschanged', updateVoices);
      document.removeEventListener('visibilitychange', stopWhenHidden);
      cancelLocalSpeech(speech);
    };
  }, [stop]);

  // Tear down the previous reading before a new text/context can own the button.
  useEffect(() => stop, [text, revisionKey, suspended, stop]);

  function readStory() {
    // The ref changes synchronously, unlike state during rapid repeated clicks.
    if (speech.current) {
      stop();
      return;
    }
    if (suspended || document.hidden || !text) return;
    const voice = localKoreanVoice();
    if (!voice) {
      setAvailable(false);
      setError(LOCAL_SPEECH_UNAVAILABLE);
      return;
    }
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voice;
      utterance.lang = 'ko-KR';
      utterance.rate = 0.86;
      utterance.pitch = 1.04;
      utterance.onend = () => {
        if (speech.current !== utterance) return;
        speech.current = null;
        utterance.onend = null;
        utterance.onerror = null;
        setSpeaking(false);
      };
      utterance.onerror = (event) => {
        if (speech.current !== utterance) return;
        speech.current = null;
        utterance.onend = null;
        utterance.onerror = null;
        setSpeaking(false);
        if (event.error !== 'canceled' && event.error !== 'interrupted')
          setError(
            '이 기기에서 읽어 주기를 시작하지 못했어요. 글로 함께 읽어 주세요.',
          );
      };
      speech.current = utterance;
      setAvailable(true);
      setError('');
      setSpeaking(true);
      window.speechSynthesis.speak(utterance);
    } catch {
      stop();
      setError(
        '이 기기에서 읽어 주기를 시작하지 못했어요. 글로 함께 읽어 주세요.',
      );
    }
  }

  const hint = suspended
    ? suspendedReason || '지금 화면의 활동을 마친 뒤 이야기를 읽어 주세요.'
    : !available
      ? LOCAL_SPEECH_UNAVAILABLE
      : !text
        ? '지금 읽을 이야기가 없어요.'
        : error || '기기에 설치된 한국어 음성으로만 읽어요.';

  return (
    <div className="fnr-reader">
      <button
        type="button"
        className="fnr-button"
        onClick={readStory}
        disabled={suspended || (!available && !speaking) || !text}
        aria-pressed={speaking}
        aria-describedby={hintId}
      >
        {speaking ? (
          <Square size={18} aria-hidden="true" />
        ) : (
          <Volume2 size={20} aria-hidden="true" />
        )}
        <span>{speaking ? '그만 읽기' : '이야기 읽어 주기'}</span>
      </button>
      <output id={hintId} className="fnr-hint">
        {hint}
      </output>
    </div>
  );
});
