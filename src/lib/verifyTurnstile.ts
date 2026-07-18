/**
 * Cloudflare Turnstile server-side verification.
 * Set TURNSTILE_SECRET_KEY in production. When unset, verification is skipped.
 */

import { shouldVerifyTurnstile } from '@/lib/turnstileConfig'

type TurnstileVerifyResponse = {
  success?: boolean
  'error-codes'?: string[]
}

export async function verifyTurnstileToken(
  token: string | undefined,
  _remoteip?: string | null
): Promise<{ ok: boolean; error?: string }> {
  if (!shouldVerifyTurnstile()) return { ok: true }

  const secret = process.env.TURNSTILE_SECRET_KEY!.trim()

  if (!token?.trim()) {
    return { ok: false, error: 'Complete the security verification below.' }
  }

  const body = new URLSearchParams()
  body.set('secret', secret)
  body.set('response', token.trim())
  // Do not send remoteip — behind Vercel/CDN the forwarded IP often differs from
  // the IP Turnstile bound the token to, which causes siteverify to fail.

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  const data = (await res.json()) as TurnstileVerifyResponse
  if (data.success === true) return { ok: true }

  const codes = data['error-codes'] ?? []
  if (codes.length) {
    console.error('[turnstile] siteverify failed:', codes.join(', '))
  }

  if (codes.includes('invalid-input-secret')) {
    return {
      ok: false,
      error: 'Security check misconfigured. Contact support.',
    }
  }

  return { ok: false, error: 'Security check failed. Refresh and try again.' }
}
