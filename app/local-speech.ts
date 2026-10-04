export const LOCAL_SPEECH_UNAVAILABLE =
  '기기에 설치된 한국어 음성이 필요해요. 지금은 글로 함께 읽어 주세요.';

/** Never let a default or remote voice receive a child's story. */
export function localKoreanVoice(): SpeechSynthesisVoice | null {
  if (
    typeof window === 'undefined' ||
    !('speechSynthesis' in window) ||
    !('SpeechSynthesisUtterance' in window)
  )
    return null;
  try {
    return (
      window.speechSynthesis
        .getVoices()
        .find(
          (voice) =>
            voice.localService === true && /^ko(?:[-_]|$)/i.test(voice.lang),
        ) ?? null
    );
  } catch {
    return null;
  }
}

export function cancelLocalSpeech(speech: {
  current: SpeechSynthesisUtterance | null;
}) {
  const current = speech.current;
  speech.current = null;
  if (!current) return;
  current.onend = null;
  current.onerror = null;
  try {
    window.speechSynthesis?.cancel();
  } catch {
    // A missing or shutting-down device must not block page navigation.
  }
}
