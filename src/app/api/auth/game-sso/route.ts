import { NextRequest, NextResponse } from 'next/server'
import { attachRelaySessionCookies, safeGameSsoRedirect } from '@/lib/createRelaySessionFromEmail'
import { getClientIp } from '@/lib/clientIp'
import { isGameSsoConfigured, verifyGamePlayerJwt } from '@/lib/gameSsoJwt'
import { consumeGameSsoJti, provisionGameUser } from '@/lib/provisionGameUser'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * WebView entry: validate player JWT, provision if needed, set session cookies, redirect to chat.
 *
 * GET /api/auth/game-sso?token=<player-jwt>&redirect=/feed?openChat=1
 */
export async function GET(req: NextRequest) {
  if (!isGameSsoConfigured()) {
    return NextResponse.json({ error: 'Game SSO is not configured.' }, { status: 503 })
  }

  const token = req.nextUrl.searchParams.get('token')?.trim()
  if (!token) {
    return NextResponse.json({ error: 'Missing token.' }, { status: 400 })
  }

  const verified = verifyGamePlayerJwt(token)
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: 401 })
  }

  const claims = verified.claims
  const gameUserId = claims.sub!.trim()
  const email = claims.email!.trim().toLowerCase()
  const username =
    (claims.username?.trim() || email.split('@')[0] || `player${gameUserId.slice(0, 8)}`).replace(
      /^@+/,
      ''
    )
  const jti = claims.jti!.trim()
  const exp = claims.exp ?? Math.floor(Date.now() / 1000) + 60
  const expiresAtIso = new Date(exp * 1000).toISOString()

  const redirectPath = safeGameSsoRedirect(req.nextUrl.searchParams.get('redirect'))
  const origin = req.nextUrl.origin
  const redirectTo = `${origin}${redirectPath}`

  try {
    const admin = createServiceClient()

    const jtiResult = await consumeGameSsoJti(admin, jti, gameUserId, expiresAtIso)
    if (!jtiResult.ok) {
      return NextResponse.json({ error: jtiResult.error }, { status: 401 })
    }

    const provisioned = await provisionGameUser(admin, {
      gameUserId,
      email,
      username,
      firstName: claims.first_name ?? null,
      lastName: claims.last_name ?? null,
      phone: claims.phone ?? null,
    })

    if (!provisioned.ok) {
      return NextResponse.json({ error: provisioned.error }, { status: provisioned.status })
    }

    const response = NextResponse.redirect(redirectTo)

    const session = await attachRelaySessionCookies(
      admin,
      provisioned.email,
      req,
      response,
      redirectTo
    )
    if (!session.ok) {
      console.error('[game-sso] session', session.error, { ip: getClientIp(req), gameUserId })
      return NextResponse.json({ error: session.error }, { status: 500 })
    }

    return response
  } catch (err: unknown) {
    console.error('[game-sso]', err)
    return NextResponse.json({ error: 'SSO failed.' }, { status: 500 })
  }
}
