/** Server-owned quality criteria. Model-provided `passed` is never authoritative. */
export const CHARACTER_QUALITY_THRESHOLDS = {
  score: 82,
  sourceFidelity: 72,
  fullBody: 88,
  anatomy: 85,
  styleMatch: 80,
  materialQuality: 80,
  naturalPose: 85,
} as const;

export type CutenessReview = Record<
  keyof typeof CHARACTER_QUALITY_THRESHOLDS,
  number
> & {
  singleCharacter: boolean;
  scaryOrUncanny: boolean;
  backgroundArtifact: boolean;
  passed: boolean;
  issue: string;
};

export function passesCharacterQuality(review: CutenessReview): boolean {
  return (
    Object.entries(CHARACTER_QUALITY_THRESHOLDS).every(([key, minimum]) => {
      const value = review[key as keyof typeof CHARACTER_QUALITY_THRESHOLDS];
      return Number.isFinite(value) && value >= minimum && value <= 100;
    }) &&
    review.singleCharacter === true &&
    review.scaryOrUncanny === false &&
    review.backgroundArtifact === false
  );
}

export function parseCharacterReview(value: unknown): CutenessReview | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  for (const key of Object.keys(CHARACTER_QUALITY_THRESHOLDS)) {
    if (
      typeof input[key] !== 'number' ||
      !Number.isFinite(input[key]) ||
      input[key] < 0 ||
      input[key] > 100
    )
      return null;
  }
  for (const key of [
    'singleCharacter',
    'scaryOrUncanny',
    'backgroundArtifact',
  ]) {
    if (typeof input[key] !== 'boolean') return null;
  }
  const review = {
    ...Object.fromEntries(
      Object.keys(CHARACTER_QUALITY_THRESHOLDS).map((key) => [key, input[key]]),
    ),
    singleCharacter: input.singleCharacter,
    scaryOrUncanny: input.scaryOrUncanny,
    backgroundArtifact: input.backgroundArtifact,
    passed: false,
    issue:
      typeof input.issue === 'string'
        ? input.issue.replace(/\s+/g, ' ').trim().slice(0, 180)
        : '',
  } as CutenessReview;
  review.passed = passesCharacterQuality(review);
  return review;
}

export function isHardQualityFailure(review: CutenessReview) {
  return (
    !review.singleCharacter ||
    review.scaryOrUncanny ||
    review.anatomy < 40 ||
    review.fullBody < 45
  );
}

export const REVIEW_TICKET_TTL_MS = 5 * 60_000;
// Leave room below Vercel's 4.5 MB request/response ceiling, including multipart framing.
export const MAX_CHARACTER_BODY_BYTES = 4_000_000;
export const MAX_CANDIDATE_BYTES = 2_800_000;
export const MAX_REVIEW_TICKET_BYTES = MAX_CANDIDATE_BYTES + 2048;
const ticketContext = new TextEncoder().encode(
  'drawing-friend/character-review-ticket/v1',
);

export type ReviewTicketMetadata = {
  sourceHash: string;
  styleIndex: number;
  age: '4–6세' | '7–9세' | '10–12세';
  highQuality: boolean;
  corrected: boolean;
  expiresAt: number;
};

export function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

export async function sourceDigest(bytes: Uint8Array) {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes)),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

async function ticketKey(serverSecret: string) {
  if (!serverSecret) throw new Error('Ticket secret unavailable');
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(serverSecret),
    'HKDF',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: ticketContext, info: ticketContext },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Candidate pixels are encrypted, never an unreviewed image URL. No server storage required. */
export async function sealReviewTicket(
  candidate: Uint8Array,
  metadata: ReviewTicketMetadata,
  serverSecret: string,
) {
  if (candidate.length > MAX_CANDIDATE_BYTES)
    throw new Error('Candidate too large');
  const encoded = new TextEncoder().encode(JSON.stringify(metadata));
  if (encoded.length > 1024) throw new Error('Ticket metadata too large');
  const plaintext = new Uint8Array(4 + encoded.length + candidate.length);
  new DataView(plaintext.buffer).setUint32(0, encoded.length);
  plaintext.set(encoded, 4);
  plaintext.set(candidate, 4 + encoded.length);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: ticketContext },
      await ticketKey(serverSecret),
      plaintext,
    ),
  );
  const ticket = new Uint8Array(1 + iv.length + encrypted.length);
  ticket[0] = 1;
  ticket.set(iv, 1);
  ticket.set(encrypted, 13);
  return ticket;
}

export async function openReviewTicket(
  ticket: Uint8Array,
  serverSecret: string,
  now = Date.now(),
): Promise<{
  candidate: Uint8Array;
  metadata: ReviewTicketMetadata;
} | null> {
  if (
    ticket.length < 33 ||
    ticket.length > MAX_REVIEW_TICKET_BYTES ||
    ticket[0] !== 1
  )
    return null;
  try {
    const plaintext = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: Uint8Array.from(ticket.subarray(1, 13)),
          additionalData: ticketContext,
        },
        await ticketKey(serverSecret),
        Uint8Array.from(ticket.subarray(13)),
      ),
    );
    const length = new DataView(plaintext.buffer).getUint32(0);
    if (!length || length > 1024 || length + 4 >= plaintext.length) return null;
    const meta = JSON.parse(
      new TextDecoder().decode(plaintext.subarray(4, length + 4)),
    ) as ReviewTicketMetadata;
    if (
      !/^[a-f0-9]{64}$/.test(meta.sourceHash) ||
      ![0, 1, 2].includes(meta.styleIndex) ||
      !['4–6세', '7–9세', '10–12세'].includes(meta.age) ||
      typeof meta.highQuality !== 'boolean' ||
      typeof meta.corrected !== 'boolean' ||
      !Number.isSafeInteger(meta.expiresAt) ||
      meta.expiresAt <= now ||
      meta.expiresAt > now + REVIEW_TICKET_TTL_MS + 10_000
    )
      return null;
    const candidate = plaintext.slice(length + 4);
    if (candidate.length > MAX_CANDIDATE_BYTES) return null;
    return { candidate, metadata: meta };
  } catch {
    return null;
  }
}
