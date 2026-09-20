/** Local, deterministic screening. This is a precaution, not comprehensive PII detection. */
export type ChatSafety = 'urgent' | 'redirected' | 'relationship' | null;

// NFKC also folds full-width/circled digits. Remove invisible separators before
// checking, but never send this lossy comparison representation to the provider.
function comparisonText(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[\p{Cf}\p{Cc}]/gu, '')
    .toLowerCase();
}

export function screenChatText(value: string): ChatSafety {
  const normalized = comparisonText(value);
  const compact = normalized.replace(/[\s\p{P}\p{S}]+/gu, '');
  if (
    /(죽고싶|죽을래|자해|해치고싶|때렸|맞았|학대|납치|성폭력|무서운어른|위험해|살려줘)/u.test(
      compact,
    ) ||
    /(?:무서|위험|아파|다쳤).{0,30}도와줘|도와줘.{0,30}(?:무서|위험|아파|다쳤)/u.test(
      compact,
    )
  )
    return 'urgent';

  if (
    /(주소|학교|학원|전화번호|연락처|휴대폰|핸드폰|이메일|사는곳|살고있|집이어디|계좌|카드번호|비밀번호|실제이름|실명|현재위치|주민등록|우리집은|내집은)/u.test(
      compact,
    ) ||
    /(?:내|제|나의|저의)이름(?:은|이)/u.test(compact) ||
    /[가-힣]{2,}(?:로|길)\d+(?:번길|번지|동|호)?/u.test(compact) ||
    /(?:phone|email|password|address|myrealname|iliveat)/u.test(compact)
  )
    return 'redirected';

  // Numeric runs include Korean digit-by-digit spelling. Err cautiously.
  const digits: Record<string, string> = {
    공: '0',
    영: '0',
    일: '1',
    이: '2',
    삼: '3',
    사: '4',
    오: '5',
    육: '6',
    칠: '7',
    팔: '8',
    구: '9',
  };
  const numeric = compact.replace(
    /[공영일이삼사오육칠팔구]/gu,
    (part) => digits[part],
  );
  if (/\d{7,}/u.test(numeric)) return 'redirected';

  // Common child-entered e-mail spellings: name @ site . com, [at]/[dot],
  // and 골뱅이/점. Do not reconstruct or store the submitted address.
  const email = normalized
    .replace(/\s+/gu, '')
    .replace(/\[at\]|\(at\)|골뱅이/gu, '@')
    .replace(/\[dot\]|\(dot\)|점/gu, '.');
  if (/[\p{L}\p{N}_.+-]+@[\p{L}\p{N}_.-]+\.[a-z]{2,}/iu.test(email))
    return 'redirected';

  if (
    /(나만있으면|부모님.{0,30}말하지마|비밀로해|앱을닫지마|매일만나|진짜살아있)/u.test(
      compact,
    )
  )
    return 'relationship';
  return null;
}

export function cleanChatText(value: string, max: number) {
  return value
    .normalize('NFKC')
    .replace(/[\p{Cf}\p{Cc}]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, max);
}

export const urgentChatReply =
  '많이 힘들거나 무서운 일이 있는 것 같아. 자세히 말하지 않아도 괜찮아. 지금 바로 가까이에 있는 믿을 만한 어른에게 알려 줘. 보호자가 안전하지 않다면 선생님, 상담 선생님, 경찰처럼 다른 믿을 만한 어른에게 바로 도움을 요청해.';

export const privateChatReply =
  '실제 이름이나 주소, 학교 같은 개인정보는 말하지 않아도 돼. 이 내용은 AI에게 보내지 않았어. 대신 우리 상상 나라의 장소 이름을 같이 지어 볼까?';
