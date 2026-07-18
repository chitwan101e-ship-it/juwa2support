import { NextRequest, NextResponse } from 'next/server'
import { getClientIp } from '@/lib/clientIp'
import {
  extractBearerToken,
  isGameSsoConfigured,
  verifyGameServerJwt,
} from '@/lib/gameSsoJwt'
import { provisionGameUser } from '@/lib/provisionGameUser'
import { createServiceClient } from '@/lib/supabase/server'

type ProvisionBody = {
  gameUserId?: unknown
  email?: unknown
  username?: unknown
  firstName?: unknown
  lastName?: unknown
  phone?: unknown
}

/**
 * Server-to-server: link a Juwa game account to a Relay support profile.
 * Authorization: Bearer <server JWT with sub=game-server>
 * No game password required.
 */
export async function POST(req: NextRequest) {
  if (!isGameSsoConfigured()) {
    return NextResponse.json({ error: 'Game SSO is not configured.' }, { status: 503 })
  }

  const bearer = extractBearerToken(req.headers.get('authorization'))
  if (!bearer) {
    return NextResponse.json({ error: 'Missing Authorization bearer token.' }, { status: 401 })
  }

  const verified = verifyGameServerJwt(bearer)
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: 401 })
  }

  let body: ProvisionBody
  try {
    body = (await req.json()) as ProvisionBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const gameUserId = typeof body.gameUserId === 'string' ? body.gameUserId : ''
  const email = typeof body.email === 'string' ? body.email : ''
  const username = typeof body.username === 'string' ? body.username : ''
  const firstName = typeof body.firstName === 'string' ? body.firstName : null
  const lastName = typeof body.lastName === 'string' ? body.lastName : null
  const phone = typeof body.phone === 'string' ? body.phone : null

  try {
    const admin = createServiceClient()
    const result = await provisionGameUser(admin, {
      gameUserId,
      email,
      username,
      firstName,
      lastName,
      phone,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({
      success: true,
      relayUserId: result.relayUserId,
      gameUserId: result.gameUserId,
      email: result.email,
      username: result.username,
      provisioned: result.provisioned,
    })
  } catch (err: unknown) {
    console.error('[provision-game-user]', err)
    return NextResponse.json({ error: 'Provisioning failed.' }, { status: 500 })
  }
}

// Reject browser CORS preflight from untrusted origins — server-to-server only.
export async function OPTIONS() {
  return new NextResponse(null, { status: 405 })
}
