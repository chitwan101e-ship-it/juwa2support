/** Cloudflare Turnstile site key (public). Empty = widget hidden. */
export const turnstileSiteKey = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '').trim()

/** Show widget when site key is set (requires hostname in Cloudflare: juwa2.com, www.juwa2.com, localhost). */
export const showTurnstileWidget = Boolean(turnstileSiteKey)

/** Server-side: verify token when secret key is set. */
export function shouldVerifyTurnstile(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY?.trim())
}
