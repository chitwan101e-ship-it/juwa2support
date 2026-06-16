import crypto from 'crypto'

export type GameJwtClaims = {
  iss?: string
  aud?: string | string[]
  sub?: string
  email?: string
  username?: string
  first_name?: string
  last_name?: string
  phone?: string
  iat?: number
  exp?: number
  jti?: string
  typ?: 'server' | 'player'
}

export type VerifyGameJwtResult =
  | { ok: true; claims: GameJwtClaims }
  | { ok: false; error: string }

function base64UrlToBuffer(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4))
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad
  return Buffer.from(b64, 'base64')
}

function bufferToBase64Url(buf: Buffer): string {
  return buf.toString('base64url')
}

function timingSafeEqualString(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

function readJwtSecret(): string | null {
  const secret = process.env.GAME_SSO_JWT_SECRET?.trim()
  return secret || null
}

export function getGameJwtIssuer(): string {
  return process.env.GAME_SSO_JWT_ISSUER?.trim() || 'juwa2-game'
}

export function getGameJwtAudience(): string {
  return process.env.GAME_SSO_JWT_AUDIENCE?.trim() || 'juwa2-relay'
}

export function isGameSsoConfigured(): boolean {
  return Boolean(readJwtSecret())
}

/** Verify HS256 JWT from the Juwa game backend. */
export function verifyGameJwt(token: string): VerifyGameJwtResult {
  const secret = readJwtSecret()
  if (!secret) {
    return { ok: false, error: 'Game SSO is not configured on this server.' }
  }

  const parts = token.split('.')
  if (parts.length !== 3) {
    return { ok: false, error: 'Invalid token format.' }
  }

  const [headerB64, payloadB64, signatureB64] = parts

  let header: { alg?: string; typ?: string }
  let payload: GameJwtClaims
  try {
    header = JSON.parse(base64UrlToBuffer(headerB64).toString('utf8')) as { alg?: string; typ?: string }
    payload = JSON.parse(base64UrlToBuffer(payloadB64).toString('utf8')) as GameJwtClaims
  } catch {
    return { ok: false, error: 'Invalid token payload.' }
  }

  if (header.alg !== 'HS256') {
    return { ok: false, error: 'Unsupported token algorithm.' }
  }

  const expectedSig = bufferToBase64Url(
    crypto.createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest()
  )
  if (!timingSafeEqualString(signatureB64, expectedSig)) {
    return { ok: false, error: 'Invalid token signature.' }
  }

  const now = Math.floor(Date.now() / 1000)
  if (typeof payload.exp === 'number' && payload.exp < now) {
    return { ok: false, error: 'Token expired.' }
  }
  if (typeof payload.iat === 'number' && payload.iat > now + 60) {
    return { ok: false, error: 'Token not yet valid.' }
  }

  const expectedIss = getGameJwtIssuer()
  if (payload.iss && payload.iss !== expectedIss) {
    return { ok: false, error: 'Invalid token issuer.' }
  }

  const expectedAud = getGameJwtAudience()
  const aud = payload.aud
  const audOk = Array.isArray(aud) ? aud.includes(expectedAud) : aud === expectedAud
  if (aud && !audOk) {
    return { ok: false, error: 'Invalid token audience.' }
  }

  return { ok: true, claims: payload }
}

/** Server-to-server token used on provision API (sub = game-server). */
export function verifyGameServerJwt(token: string): VerifyGameJwtResult {
  const result = verifyGameJwt(token)
  if (!result.ok) return result

  const sub = result.claims.sub?.trim()
  if (sub !== 'game-server') {
    return { ok: false, error: 'Not a server token.' }
  }

  const now = Math.floor(Date.now() / 1000)
  const iat = result.claims.iat ?? now
  const exp = result.claims.exp ?? now
  if (exp - iat > 600) {
    return { ok: false, error: 'Server token TTL too long (max 10 minutes).' }
  }

  return result
}

/** Player SSO token for WebView (sub = gameUserId, requires jti). */
export function verifyGamePlayerJwt(token: string): VerifyGameJwtResult {
  const result = verifyGameJwt(token)
  if (!result.ok) return result

  const sub = result.claims.sub?.trim()
  if (!sub || sub === 'game-server') {
    return { ok: false, error: 'Invalid player token subject.' }
  }

  const jti = result.claims.jti?.trim()
  if (!jti) {
    return { ok: false, error: 'Missing jti (single-use nonce).' }
  }

  const now = Math.floor(Date.now() / 1000)
  const iat = result.claims.iat ?? now
  const exp = result.claims.exp ?? now
  if (exp - iat > 120) {
    return { ok: false, error: 'Player token TTL too long (max 120 seconds).' }
  }

  if (!result.claims.email?.trim()) {
    return { ok: false, error: 'Missing email claim.' }
  }

  return result
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim())
  return m?.[1]?.trim() || null
}
