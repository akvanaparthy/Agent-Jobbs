import { DELAYS } from '../config/constants';

/**
 * Sleep for a specified duration
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get a random delay within a range
 */
export function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Sleep for a random duration within a range
 */
export async function randomSleep(min: number, max: number): Promise<void> {
  const delay = randomDelay(min, max);
  return sleep(delay);
}

/**
 * Delay for typing a single character (human-like)
 */
export function typingDelay(): number {
  return randomDelay(DELAYS.TYPING_MIN, DELAYS.TYPING_MAX);
}

/**
 * Delay between form fields
 */
export async function betweenFieldsDelay(): Promise<void> {
  return randomSleep(DELAYS.BETWEEN_FIELDS_MIN, DELAYS.BETWEEN_FIELDS_MAX);
}

/**
 * Delay after clicking
 */
export async function afterClickDelay(): Promise<void> {
  return randomSleep(DELAYS.AFTER_CLICK_MIN, DELAYS.AFTER_CLICK_MAX);
}

/**
 * Delay for page load
 */
export async function pageLoadDelay(): Promise<void> {
  return randomSleep(DELAYS.PAGE_LOAD_MIN, DELAYS.PAGE_LOAD_MAX);
}

/**
 * Delay after scrolling
 */
export async function scrollDelay(): Promise<void> {
  return randomSleep(DELAYS.SCROLL_MIN, DELAYS.SCROLL_MAX);
}

/**
 * Exponential backoff for retries
 */
export function exponentialBackoff(
  attempt: number,
  initialDelay: number = 1000,
  maxDelay: number = 10000,
  multiplier: number = 2
): number {
  const delay = Math.min(initialDelay * Math.pow(multiplier, attempt), maxDelay);
  // Add jitter (±25%)
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  return Math.floor(delay + jitter);
}

/**
 * Wait with timeout
 */
export async function waitWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}
