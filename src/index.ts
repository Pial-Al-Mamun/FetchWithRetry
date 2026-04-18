/**
 * Configuration options for retry behavior.
 */
export type RetryConfig = {
  /**
   * Maximum number of retry attempts before giving up.
   * @default 3
   */
  maxRetries?: number;

  /**
   * Base delay in milliseconds before the first retry.
   * @default 100
   */
  delay?: number;

  /**
   * Multiplier for exponential backoff. Each subsequent retry delay
   * is multiplied by this factor.
   * @default 2
   * @example
   * // With delay=100 and backoff=2, delays will be:
   * // Attempt 1: 100ms
   * // Attempt 2: 200ms
   * // Attempt 3: 400ms
   */
  backoff?: number;

  /**
   * Whether to add random jitter to retry delays. This helps prevent
   * "thundering herd" problems where many clients retry simultaneously.
   * When true, the delay becomes a random value between 0 and the calculated delay.
   * @default true
   */
  jitter?: boolean;

  /**
   * Custom function to determine if a request should be retried.
   * Called after each failed attempt with the error (if any) and response (if any).
   * @param error - The error that occurred, if any
   * @param response - The response object, if a response was received
   * @returns `true` if the request should be retried, `false` otherwise
   * @default
   * // Network errors always retry, HTTP errors retry on 5xx and 429
   * (error, response) => {
   *   if (error) return true;
   *   return response.status >= 500 || response.status === 429;
   * }
   */
  shouldRetry?: (error: Error, response?: Response) => boolean;
};

/**
 * Internal sleep utility that returns a promise resolving after specified milliseconds.
 * @private
 * @param ms - Milliseconds to sleep
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Default retry strategy: retry on network errors and server errors (5xx) or rate limiting (429).
 * @private
 * @param error - The error that occurred, if any
 * @param response - The response object, if a response was received
 * @returns `true` if the request should be retried
 */
const defaultShouldRetry = (error: Error, response?: Response): boolean => {
  if (error) return true; // Network errors always retry
  return response!.status >= 500 || response!.status === 429;
};

/**
 * Calculates the delay for the next retry attempt using exponential backoff.
 * @private
 * @param attempt - Current attempt number (0-indexed)
 * @param delay - Base delay in milliseconds
 * @param backoff - Exponential backoff multiplier
 * @param jitter - Whether to add random jitter
 * @returns Delay in milliseconds
 */
const calculateDelay = (
  attempt: number,
  delay: number,
  backoff: number,
  jitter: boolean,
): number => {
  const base = delay * Math.pow(backoff, attempt);
  return jitter ? Math.random() * base : base;
};

/**
 * A wrapper around the native `fetch` API that automatically retries failed requests
 * with exponential backoff and optional jitter.
 *
 * This function is a drop-in replacement for `fetch` that adds configurable retry
 * behavior. It will retry requests that fail due to network errors, server errors (5xx),
 * or rate limiting (429) by default.
 *
 * @param input - The resource that you wish to fetch. Can be a URL string, URL object, or Request object.
 * @param init - An object containing any custom settings that you want to apply to the request.
 *               Extends the standard RequestInit with an optional `retry` property.
 * @param init.retry - Retry configuration. Can be either:
 *                     - A `number` to specify only maxRetries (uses defaults for other options)
 *                     - A {@link RetryConfig} object for full control over retry behavior
 * @returns A Promise that resolves to the {@link https://developer.mozilla.org/en-US/docs/Web/API/Response | Response} object.
 * @throws {Error} Throws the last error encountered if all retry attempts fail or if a non-retriable error occurs.
 *
 * @example
 * // Basic usage - retry up to 3 times with default settings
 * const response = await fetchWithRetry('https://api.example.com/users');
 *
 * @example
 * // Simple retry count
 * const response = await fetchWithRetry('https://api.example.com/users', {
 *   retry: 5  // Retry up to 5 times
 * });
 *
 * @example
 * // Full configuration
 * const response = await fetchWithRetry('https://api.example.com/users', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ name: 'John' }),
 *   retry: {
 *     maxRetries: 4,
 *     delay: 200,
 *     backoff: 1.5,
 *     jitter: true,
 *     shouldRetry: (error, response) => {
 *       if (error) return true;
 *       // Only retry on 503 Service Unavailable
 *       return response?.status === 503;
 *     }
 *   }
 * });
 *
 * @example
 * // Using with async/await and error handling
 * try {
 *   const response = await fetchWithRetry('https://api.example.com/data', {
 *     retry: { maxRetries: 3 }
 *   });
 *
 *   if (!response.ok) {
 *     console.error(`HTTP error: ${response.status}`);
 *     return;
 *   }
 *
 *   const data = await response.json();
 *   console.log(data);
 * } catch (error) {
 *   console.error('Request failed after all retries:', error);
 * }
 *
 * @example
 * // Using with timeout (via AbortSignal)
 * const controller = new AbortController();
 * const timeoutId = setTimeout(() => controller.abort(), 5000);
 *
 * try {
 *   const response = await fetchWithRetry('https://api.example.com/data', {
 *     signal: controller.signal,
 *     retry: 3
 *   });
 *   clearTimeout(timeoutId);
 *   const data = await response.json();
 * } catch (error) {
 *   if (error.name === 'AbortError') {
 *     console.error('Request timed out');
 *   }
 * }
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit & { retry?: RetryConfig | number },
): Promise<Response> {
  // Parse retry config
  const retry = init?.retry;
  const config: Required<RetryConfig> =
    typeof retry === "number"
      ? {
          maxRetries: retry,
          delay: 100,
          backoff: 2,
          jitter: true,
          shouldRetry: defaultShouldRetry,
        }
      : {
          maxRetries: 3,
          delay: 100,
          backoff: 2,
          jitter: true,
          shouldRetry: defaultShouldRetry,
          ...retry,
        };

  const { retry: _, ...fetchInit } = init || {};
  let attempt = 0;
  let lastError: Error | undefined;

  while (attempt <= config.maxRetries) {
    try {
      const response = await fetch(input, fetchInit);
      // Don't retry if we shouldn't or we're out of attempts or the response is successful
      if (
        !config.shouldRetry({} as Error, response) ||
        attempt === config.maxRetries ||
        response.ok
      ) {
        return response;
      }

      // Will retry
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error as Error;

      if (!config.shouldRetry(lastError) || attempt === config.maxRetries) {
        throw lastError;
      }
    }

    const waitTime = calculateDelay(
      attempt,
      config.delay,
      config.backoff,
      config.jitter,
    );
    await sleep(waitTime);
    attempt++;
  }

  throw lastError!;
}
/**
 * A convenience wrapper around `fetchWithRetry` that automatically parses the response as JSON.
 * @param input - The resource that you wish to fetch. Can be a URL string, URL object, or Request object.
 * @param init - An object containing any custom settings that you want to apply to the request.
 *               Extends the standard RequestInit with an optional `retry` property.
 * @param init.retry - Retry configuration. Can be either:
 *                    - A `number` to specify only maxRetries (uses defaults for other options)
 *                   - A {@link RetryConfig} object for full control over retry behavior
 * @return A Promise that resolves to the parsed JSON object of type T.
 * @throws {Error} Throws the last error encountered if all retry attempts fail or if a non-retriable error occurs.
 * @example
 */
export async function fetchJSON<T extends Record<string, unknown>>(
  input: RequestInfo | URL,
  init?: RequestInit & { retry?: RetryConfig | number },
): Promise<T> {
  return (await fetchWithRetry(input, init).then((r) =>
    r.json(),
  )) as Promise<T>;
}
