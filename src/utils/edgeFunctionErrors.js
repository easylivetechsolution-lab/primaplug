const STATUS_MESSAGES = {
  400: 'Please check your details and try again.',
  401: 'Your session may have expired. Sign in again and retry.',
  403: 'You don’t have permission to do that.',
  404: 'This service is unavailable right now.',
  429: 'Too many requests. Please wait a moment and try again.',
}

/** Return a useful, non-technical message for a Supabase Edge Function error. */
export async function edgeFunctionErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  const context = error?.context
  const status = Number(context?.status || error?.status)

  if (context && typeof context.clone === 'function') {
    try {
      const body = await context.clone().json()
      const serverMessage = body?.error || body?.message
      if (status < 500 && typeof serverMessage === 'string' && serverMessage.trim()
        && !/edge function returned a non-2xx status code/i.test(serverMessage)) {
        return serverMessage.trim()
      }
    } catch {
      // The response may not contain JSON; use the safe status fallback below.
    }
  }

  if (STATUS_MESSAGES[status]) return STATUS_MESSAGES[status]
  if (status >= 500) return 'The service is temporarily unavailable. Please try again shortly.'

  const message = String(error?.message || '')
  if (/edge function returned a non-2xx|functionshttp|functionsfetch|functionsrelay/i.test(message)) {
    return fallback
  }
  return message || fallback
}
