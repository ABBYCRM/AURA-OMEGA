/**
 * Retry engine — exponential backoff + max-attempts policy.
 */

export interface RetryDecision {
  shouldRetry: boolean;
  delaySeconds: number;
  attempt: number;
  reason: string;
}

export function decideRetry(
  stepIndex: number,
  currentAttempt: number,
  maxAttempts: number,
  baseBackoffSeconds: number,
  errorMessage: string,
): RetryDecision {
  if (currentAttempt >= maxAttempts) {
    return { shouldRetry: false, delaySeconds: 0, attempt: currentAttempt, reason: `max attempts reached (${maxAttempts})` };
  }
  const delay = baseBackoffSeconds * Math.pow(5, currentAttempt - 1);
  return {
    shouldRetry: true,
    delaySeconds: delay,
    attempt: currentAttempt + 1,
    reason: `attempt ${currentAttempt} failed: ${errorMessage.slice(0, 200)} — retry in ${delay}s`,
  };
}