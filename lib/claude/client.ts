import Anthropic from '@anthropic-ai/sdk'

export const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface ClaudeErrorInfo {
  kind: 'auth' | 'credits' | 'rate' | 'overloaded' | 'unknown'
  status: number
  userMessage: string
}

/**
 * Classify an Anthropic SDK error into a user-facing message + HTTP status.
 * Routes should catch Claude failures and return { error, ai_unavailable: true }
 * so the client can surface it and fall back to manual entry.
 */
export function classifyClaudeError(err: unknown): ClaudeErrorInfo {
  const e = err as { status?: number; error?: { error?: { message?: string } }; message?: string }
  const status = e?.status
  const msg = (e?.error?.error?.message ?? e?.message ?? '').toLowerCase()

  if (status === 401 || msg.includes('authentication') || msg.includes('invalid x-api-key') || msg.includes('x-api-key')) {
    return { kind: 'auth', status: 503, userMessage: 'AI unavailable — API key problem. Enter carbs manually for now.' }
  }
  if (status === 402 || msg.includes('credit balance') || msg.includes('billing') || msg.includes('quota')) {
    return { kind: 'credits', status: 503, userMessage: 'AI unavailable — out of API credits. Enter carbs manually for now.' }
  }
  if (status === 429 || msg.includes('rate limit')) {
    return { kind: 'rate', status: 503, userMessage: 'AI is rate-limited right now. Try again in a moment, or enter carbs manually.' }
  }
  if (status === 529 || msg.includes('overloaded')) {
    return { kind: 'overloaded', status: 503, userMessage: 'AI is temporarily overloaded. Try again shortly, or enter carbs manually.' }
  }
  return { kind: 'unknown', status: 503, userMessage: 'AI is unavailable right now. Enter carbs manually.' }
}
