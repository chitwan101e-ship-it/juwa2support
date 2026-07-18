#!/usr/bin/env node
/**
 * Dev helper: mint sample JWTs for testing provision-game-user and game-sso.
 *
 * Usage:
 *   GAME_SSO_JWT_SECRET=yoursecret node scripts/game-sso-token.mjs server
 *   GAME_SSO_JWT_SECRET=yoursecret node scripts/game-sso-token.mjs player \
 *     --gameUserId=123 --email=player@test.com --username=playerlogin
 */
import crypto from 'crypto'

const secret = process.env.GAME_SSO_JWT_SECRET?.trim()
if (!secret) {
  console.error('Set GAME_SSO_JWT_SECRET')
  process.exit(1)
}

const iss = process.env.GAME_SSO_JWT_ISSUER?.trim() || 'juwa2-game'
const aud = process.env.GAME_SSO_JWT_AUDIENCE?.trim() || 'juwa2-relay'

function b64url(buf) {
  return Buffer.from(buf).toString('base64url')
}

function sign(payload) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const data = `${header}.${body}`
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url')
  return `${data}.${sig}`
}

const mode = process.argv[2] || 'player'
const now = Math.floor(Date.now() / 1000)

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.split('=').slice(1).join('=') : fallback
}

if (mode === 'server') {
  const token = sign({
    iss,
    aud,
    sub: 'game-server',
    iat: now,
    exp: now + 300,
  })
  console.log(token)
} else if (mode === 'player') {
  const token = sign({
    iss,
    aud,
    sub: arg('gameUserId', 'test-game-user-1'),
    email: arg('email', 'player@example.com'),
    username: arg('username', 'playerlogin'),
    first_name: arg('firstName', 'Test'),
    last_name: arg('lastName', 'Player'),
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + 60,
  })
  console.log(token)
  console.error('\nWebView URL (local):')
  console.error(
    `http://localhost:3000/api/auth/game-sso?token=${encodeURIComponent(token)}&redirect=${encodeURIComponent('/feed?openChat=1')}`
  )
} else {
  console.error('Usage: node scripts/game-sso-token.mjs [server|player]')
  process.exit(1)
}
