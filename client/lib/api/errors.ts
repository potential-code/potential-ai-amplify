/**
 * Turn a failed API response into a sentence a learner can act on.
 *
 * The server's error envelope is `{ success: false, error: { message, code } }`.
 * Server-side failures (5xx) and unrecognised shapes never surface their raw
 * text or a status code — those read as "Request failed: 500" on screen.
 */
export function friendlyApiError(status: number, body: unknown): string {
  const b = body as { error?: { message?: unknown } | string; message?: unknown } | null | undefined
  const raw =
    (typeof b?.error === 'object' && b.error && typeof b.error.message === 'string' && b.error.message) ||
    (typeof b?.message === 'string' && b.message) ||
    ''

  if (status === 401) return 'Your session has expired. Please log in again.'
  if (status === 413) return 'That file is too large to upload.'
  if (status === 429) return 'Too many requests. Please wait a moment and try again.'
  if (status >= 500 || status === 0) return 'Something went wrong on our side. Please try again in a moment.'
  return raw && !/^(internal server error|request failed)/i.test(raw)
    ? raw
    : 'We couldn’t complete that request. Please try again.'
}

/** Error thrown by the feature API clients; `message` is always user-safe. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Read a failed `fetch` Response into an ApiError with a user-safe message. */
export async function apiErrorFrom(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => null)
  const code =
    body && typeof body === 'object' && typeof (body as { error?: { code?: unknown } }).error?.code === 'string'
      ? ((body as { error: { code: string } }).error.code)
      : undefined
  return new ApiError(friendlyApiError(res.status, body), res.status, code)
}
