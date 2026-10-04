/** Bound the whole response body, not only the initial HTTP headers.
 * A broken connection must not leave a child waiting forever. No automatic retry.
 */
export async function withCharacterDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  callerSignal?: AbortSignal,
  timeoutMs = 330_000,
): Promise<T> {
  callerSignal?.throwIfAborted();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  let cancel: () => void = () => {};
  const stop = new Promise<never>((_, reject) => {
    cancel = () => {
      const reason =
        callerSignal?.reason ?? new DOMException('Aborted', 'AbortError');
      reject(reason);
      controller.abort(reason);
    };
    callerSignal?.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(() => {
      const reason = new DOMException(
        'Character response deadline exceeded',
        'TimeoutError',
      );
      reject(reason);
      controller.abort(reason);
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation(controller.signal), stop]);
  } finally {
    clearTimeout(timer!);
    callerSignal?.removeEventListener('abort', cancel);
  }
}
