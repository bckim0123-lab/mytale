export type CharacterRecovery =
  | 'review'
  | 'retry'
  | 'recreate'
  | 'change-source'
  | 'unavailable';

/** A failed candidate is not an unsafe source. Only an explicit new request may replace it. */
export function characterRecoveryMode({
  code,
  retryable,
  hasReviewTicket = false,
}: {
  code?: string;
  retryable: boolean;
  hasReviewTicket?: boolean;
}): CharacterRecovery {
  if (hasReviewTicket && retryable) return 'review';
  if (
    [
      'quality_failed',
      'alpha_failed',
      'result_too_large',
      'quality_review_payload_too_large',
      'review_retry_exhausted',
      'review_ticket_invalid',
    ].includes(code ?? '')
  )
    return 'recreate';
  if (retryable) return 'retry';
  if (code === 'service_unconfigured' || code === 'provider_unavailable')
    return 'unavailable';
  return 'change-source';
}
