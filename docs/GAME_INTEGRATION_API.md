# Relay × Juwa 2.0 — Game Integration API Reference

**Version:** 1.0  
**Last updated:** June 2026  
**Audience:** Juwa 2.0 backend & mobile developers  
**Auth model:** JWT (HS256) — **no game passwords sent to Relay**

---

## Table of contents

1. [Overview](#1-overview)
2. [Base URLs](#2-base-urls)
3. [Shared configuration](#3-shared-configuration)
4. [Authentication model](#4-authentication-model)
5. [JWT specification](#5-jwt-specification)
6. [API: Provision game user](#6-api-provision-game-user)
7. [API: Game SSO (WebView)](#7-api-game-sso-webview)
8. [Integration flows](#8-integration-flows)
9. [Code examples](#9-code-examples)
10. [Error reference](#10-error-reference)
11. [Testing](#11-testing)
12. [Security requirements](#12-security-requirements)
13. [FAQ](#13-faq)

---

## 1. Overview

Relay is the official customer support platform for Juwa 2 Pay. The mobile app integrates via **two HTTP endpoints**:

| API | Method | Called by | Purpose |
|-----|--------|-----------|---------|
| **Provision game user** | `POST` | Game **backend** server | Create or link a Relay support profile when a Juwa account is created |
| **Game SSO** | `GET` | Mobile app **WebView** | Open support chat without a login screen (headset icon popup) |

**Important:**
- Game **passwords are never sent** to Relay.
- JWT signing secret lives on the **game backend only** (never in the mobile APK/IPA).
- Chat UI is Relay’s existing web chat loaded inside a **WebView** — you do not build a chat backend.

---

## 2. Base URLs

| Environment | Base URL |
|-------------|----------|
| Production | `https://juwa2.com` *(confirm with Relay team)* |
| Staging | *Provided by Relay team* |
| Local dev | `http://localhost:3000` |

| Endpoint | Full path |
|----------|-----------|
| Provision | `{BASE_URL}/api/auth/provision-game-user` |
| SSO / WebView | `{BASE_URL}/api/auth/game-sso` |
| Health check | `{BASE_URL}/api/health` |

---

## 3. Shared configuration

Relay team provides these values **securely** to your **backend lead only**:

| Variable | Example | Description |
|----------|---------|-------------|
| `GAME_SSO_JWT_SECRET` | `EBF0VQbQ7hgH-...` | Shared HMAC secret for signing JWTs |
| `GAME_SSO_JWT_ISSUER` | `juwa2-game` | `iss` claim — who minted the token |
| `GAME_SSO_JWT_AUDIENCE` | `juwa2-relay` | `aud` claim — intended recipient |

**Both sides must use identical values.** If Relay rotates the secret, both sides update at the same time.

---

## 4. Authentication model

Two JWT types:

### A. Server token (provision API)

- **Who signs:** Game backend
- **`sub` claim:** Must be exactly `game-server`
- **TTL:** Max **10 minutes** (`exp - iat ≤ 600`)
- **Transport:** `Authorization: Bearer <token>` header
- **Use:** `POST /api/auth/provision-game-user` only

### B. Player token (SSO / WebView)

- **Who signs:** Game backend
- **`sub` claim:** Player’s stable `gameUserId` from your database
- **`jti` claim:** Required — unique UUID per request (single-use)
- **TTL:** Max **120 seconds** (recommended: **60 seconds**)
- **Transport:** Query parameter `?token=...` on WebView URL
- **Use:** `GET /api/auth/game-sso`

### Algorithm

- **HS256** only (`HMAC-SHA256`)
- Header: `{ "alg": "HS256", "typ": "JWT" }`

---

## 5. JWT specification

### 5.1 Server token payload

```json
{
  "iss": "juwa2-game",
  "aud": "juwa2-relay",
  "sub": "game-server",
  "iat": 1718000000,
  "exp": 1718000300
}
```

| Claim | Required | Rules |
|-------|----------|-------|
| `iss` | Recommended | Must match `GAME_SSO_JWT_ISSUER` if present |
| `aud` | Recommended | Must match `GAME_SSO_JWT_AUDIENCE` if present |
| `sub` | **Yes** | Must be `game-server` |
| `iat` | **Yes** | Unix seconds (UTC) |
| `exp` | **Yes** | Unix seconds; max 10 min after `iat` |

---

### 5.2 Player token payload

```json
{
  "iss": "juwa2-game",
  "aud": "juwa2-relay",
  "sub": "game-user-id-12345",
  "email": "player@example.com",
  "username": "playerlogin",
  "first_name": "John",
  "last_name": "Doe",
  "phone": "+15551234567",
  "jti": "550e8400-e29b-41d4-a716-446655440000",
  "iat": 1718000000,
  "exp": 1718000060
}
```

| Claim | Required | Rules |
|-------|----------|-------|
| `iss` | Recommended | Must match `GAME_SSO_JWT_ISSUER` if present |
| `aud` | Recommended | Must match `GAME_SSO_JWT_AUDIENCE` if present |
| `sub` | **Yes** | Stable game user ID (max 128 chars) |
| `email` | **Yes** | Player email (lowercase recommended) |
| `username` | Recommended | Juwa login name (without `@`); fallback derived from email if omitted |
| `first_name` | Optional | Used when provisioning new profile |
| `last_name` | Optional | Used when provisioning new profile |
| `phone` | Optional | E.164 or similar |
| `jti` | **Yes** | Unique UUID v4 per SSO attempt — **single use** |
| `iat` | **Yes** | Unix seconds (UTC) |
| `exp` | **Yes** | Unix seconds; max 120 sec after `iat` (use 60 sec) |

---

### 5.3 Signing (pseudocode)

```
header  = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))
payload = base64url(JSON.stringify(claims))
data    = header + "." + payload
sig     = base64url(HMAC_SHA256(data, GAME_SSO_JWT_SECRET))
token   = data + "." + sig
```

---

## 6. API: Provision game user

Creates or updates a Relay support profile for a Juwa player. **No password.**

### Request

```
POST /api/auth/provision-game-user
Host: juwa2.com
Content-Type: application/json
Authorization: Bearer <server-jwt>
```

### Body

```json
{
  "gameUserId": "game-user-id-12345",
  "email": "player@example.com",
  "username": "playerlogin",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+15551234567"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `gameUserId` | string | **Yes** | Stable unique ID from Juwa game database |
| `email` | string | **Yes** | Player email |
| `username` | string | **Yes** | Juwa account / login name (maps to `@username` in Relay) |
| `firstName` | string | No | Defaults to `username` or `Player` if omitted |
| `lastName` | string | No | Defaults to `User` if omitted |
| `phone` | string | No | Optional phone number |

### Juwa signup field mapping

| Juwa 2 signup screen | API field |
|----------------------|-----------|
| Account (login name) | `username` |
| Email | `email` |
| Internal player ID | `gameUserId` |
| Name / phone | `firstName`, `lastName`, `phone` |

### Success response `200`

```json
{
  "success": true,
  "relayUserId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "gameUserId": "game-user-id-12345",
  "email": "player@example.com",
  "username": "playerlogin",
  "provisioned": true
}
```

| Field | Meaning |
|-------|---------|
| `relayUserId` | UUID of player in Relay / Supabase |
| `provisioned` | `true` = new account created; `false` = existing account updated/linked |

### What Relay does internally

1. Validates server JWT
2. Finds profile by `gameUserId` or `email`
3. If new: creates auth user (random internal password — player never sees it), profile, follow to JUWA2 support, chat thread, optional welcome message
4. If existing: updates name/username/phone and ensures chat thread exists

### When to call

| Event | Call provision? |
|-------|-----------------|
| New Juwa account created | **Yes** — immediately after signup |
| Existing player first headset tap | Optional — SSO endpoint also provisions lazily |
| Every headset tap | **No** — use SSO only |

---

## 7. API: Game SSO (WebView)

Opens Relay support chat inside the app WebView. Player is logged in automatically.

### Request

```
GET /api/auth/game-sso?token=<player-jwt>&redirect=/feed?openChat=1
Host: juwa2.com
```

| Query param | Required | Description |
|-------------|----------|-------------|
| `token` | **Yes** | Player JWT (URL-encoded) |
| `redirect` | No | Path after login. Default: `/feed?openChat=1`. Must start with `/` |

### Success response `302`

Redirects to chat page with session cookies set on the WebView.

Example final URL after redirect:

```
https://juwa2.com/feed?openChat=1
```

Chat panel opens automatically. Player can message support staff.

### Error response `4xx` / `5xx`

JSON body (WebView may show raw JSON on error — handle in app if needed):

```json
{ "error": "Token expired." }
```

### What Relay does internally

1. Validates player JWT (signature, expiry, `jti`, claims)
2. Rejects reused `jti` (replay protection)
3. Provisions profile if missing (same as provision API)
4. Creates Supabase session cookies in WebView
5. Redirects to `redirect` path

### Mobile app implementation

```
1. Player taps headset icon (must be logged into Juwa)
2. App → GET https://YOUR-GAME-API/support/sso-url
   (your backend mints player JWT — never mint on device)
3. Your API returns:
   { "ssoUrl": "https://juwa2.com/api/auth/game-sso?token=...&redirect=%2Ffeed%3FopenChat%3D1" }
4. App opens WebView modal loading ssoUrl
5. Player chats; closes WebView to return to lobby
```

**Recommended WebView URL (production):**

```
https://juwa2.com/api/auth/game-sso?token={PLAYER_JWT}&redirect=%2Ffeed%3FopenChat%3D1
```

---

## 8. Integration flows

### Flow A — New player signup

```
Juwa signup completes
    → Game backend: POST /api/auth/provision-game-user
    → Relay creates support profile + chat thread
    → (optional) Player can open support later via headset
```

### Flow B — Headset icon (main in-app support)

```
Player taps headset
    → App calls game backend (authenticated game session)
    → Game backend mints player JWT (60s, new jti)
    → App opens WebView with game-sso URL
    → Chat opens — no login screen
```

### Flow C — Legacy players (~1 year existing users)

```
Player taps headset (no Relay account yet)
    → Same as Flow B
    → game-sso provisions account automatically on first use
    → No separate migration required
```

### Flow D — Contact Customer Support (signup screen)

Same as Flow B if player is logged in. If not registered, prompt to create account first.

---

## 9. Code examples

### 9.1 Node.js — sign JWT

```javascript
const crypto = require('crypto')

const SECRET = process.env.GAME_SSO_JWT_SECRET
const ISS = 'juwa2-game'
const AUD = 'juwa2-relay'

function signJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const data = `${header}.${body}`
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url')
  return `${data}.${sig}`
}

// Server token (provision API)
function mintServerToken() {
  const now = Math.floor(Date.now() / 1000)
  return signJwt({
    iss: ISS,
    aud: AUD,
    sub: 'game-server',
    iat: now,
    exp: now + 300,
  })
}

// Player token (WebView SSO)
function mintPlayerToken(player) {
  const now = Math.floor(Date.now() / 1000)
  return signJwt({
    iss: ISS,
    aud: AUD,
    sub: player.gameUserId,
    email: player.email,
    username: player.username,
    first_name: player.firstName,
    last_name: player.lastName,
    phone: player.phone,
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + 60,
  })
}
```

### 9.2 Node.js — provision on signup

```javascript
async function provisionRelaySupport(player) {
  const token = mintServerToken()
  const res = await fetch('https://juwa2.com/api/auth/provision-game-user', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      gameUserId: player.gameUserId,
      email: player.email,
      username: player.username,
      firstName: player.firstName,
      lastName: player.lastName,
      phone: player.phone,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Provision failed')
  return data
}
```

### 9.3 Node.js — SSO URL for mobile app

```javascript
// GET /support/sso-url — called by mobile app when player taps headset
async function getSupportSsoUrl(authenticatedPlayer) {
  const token = mintPlayerToken(authenticatedPlayer)
  const redirect = encodeURIComponent('/feed?openChat=1')
  return {
    ssoUrl: `https://juwa2.com/api/auth/game-sso?token=${encodeURIComponent(token)}&redirect=${redirect}`,
    expiresIn: 60,
  }
}
```

### 9.4 cURL — provision

```bash
SERVER_TOKEN="<paste server jwt>"

curl -X POST "https://juwa2.com/api/auth/provision-game-user" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SERVER_TOKEN" \
  -d '{
    "gameUserId": "test-game-user-1",
    "email": "player@example.com",
    "username": "playerlogin",
    "firstName": "Test",
    "lastName": "Player"
  }'
```

### 9.5 cURL — test SSO in browser

Open in browser (or WebView):

```
https://juwa2.com/api/auth/game-sso?token=<player-jwt>&redirect=/feed?openChat=1
```

### 9.6 Python — sign JWT

```python
import json, hmac, hashlib, base64, time, uuid

SECRET = b"your-shared-secret"
ISS = "juwa2-game"
AUD = "juwa2-relay"

def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def sign_jwt(payload: dict) -> str:
    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    body = b64url(json.dumps(payload, separators=(",", ":")).encode())
    msg = f"{header}.{body}".encode()
    sig = b64url(hmac.new(SECRET, msg, hashlib.sha256).digest())
    return f"{header}.{body}.{sig}"

def mint_player_token(game_user_id: str, email: str, username: str) -> str:
    now = int(time.time())
    return sign_jwt({
        "iss": ISS,
        "aud": AUD,
        "sub": game_user_id,
        "email": email,
        "username": username,
        "jti": str(uuid.uuid4()),
        "iat": now,
        "exp": now + 60,
    })
```

---

## 10. Error reference

### Provision API (`POST /api/auth/provision-game-user`)

| HTTP | `error` message | Cause |
|------|-----------------|-------|
| 400 | `gameUserId, email, and username are required.` | Missing required body fields |
| 400 | `Invalid email.` | Malformed email |
| 401 | `Missing Authorization bearer token.` | No `Authorization` header |
| 401 | `Invalid token signature.` / etc. | Bad or expired server JWT |
| 401 | `Not a server token.` | `sub` is not `game-server` |
| 409 | `Username already taken.` | Username belongs to another account |
| 409 | `Email is linked to a different game account.` | Email conflict |
| 409 | `Phone number already in use.` | Duplicate phone |
| 500 | `Provisioning failed.` | Server error |
| 503 | `Game SSO is not configured.` | Relay missing `GAME_SSO_JWT_SECRET` |

### SSO API (`GET /api/auth/game-sso`)

| HTTP | `error` message | Cause |
|------|-----------------|-------|
| 400 | `Missing token.` | No `token` query param |
| 401 | `Token expired.` | Player JWT past `exp` |
| 401 | `Missing jti (single-use nonce).` | No `jti` in token |
| 401 | `Token already used.` | Same `jti` used twice |
| 401 | `Invalid token signature.` | Wrong secret or tampered token |
| 401 | `Player token TTL too long (max 120 seconds).` | `exp - iat > 120` |
| 409 | *(provision errors)* | Profile conflict during lazy provision |
| 500 | `SSO failed.` / `Could not create login session.` | Server error |
| 503 | `Game SSO is not configured.` | Relay env not set |

---

## 11. Testing

### Prerequisites (Relay team)

1. `supabase/5_game_sso.sql` run in Supabase
2. `GAME_SSO_JWT_SECRET` set on Relay server
3. Same secret shared with game backend for testing

### Relay dev helper

In the Relay repo:

```bash
GAME_SSO_JWT_SECRET=your-secret node scripts/game-sso-token.mjs server
GAME_SSO_JWT_SECRET=your-secret node scripts/game-sso-token.mjs player \
  --gameUserId=test-1 --email=test@example.com --username=testplayer
```

### Test checklist

- [ ] `POST provision-game-user` returns `200` with `provisioned: true` for new user
- [ ] Second provision for same `gameUserId` returns `provisioned: false`
- [ ] `GET game-sso` with valid player token opens chat (no login page)
- [ ] Reusing same `jti` returns `401 Token already used`
- [ ] Expired token returns `401 Token expired`
- [ ] Message from WebView appears in Relay staff dashboard inbox
- [ ] Staff reply appears in WebView without refresh

### Health check

```bash
curl https://juwa2.com/api/health
```

```json
{ "ok": true, "deploy": "...", "vercel": true }
```

---

## 12. Security requirements

| Rule | Detail |
|------|--------|
| **Never** put `GAME_SSO_JWT_SECRET` in mobile app | Backend server only |
| **Never** send game passwords to Relay | Token auth only |
| Player JWT TTL | ≤ 60 seconds recommended |
| Server JWT TTL | ≤ 10 minutes |
| `jti` | New UUID for every SSO attempt |
| HTTPS | Required for all API and WebView traffic |
| Mint tokens server-side | App calls your API; your API signs JWT |
| Validate game session | Only mint SSO token if player is logged into Juwa |

---

## 13. FAQ

**Q: Do we need Supabase keys in the mobile app?**  
No. WebView + SSO only. Relay handles the database.

**Q: Do players need a Relay password?**  
No for in-app. Relay stores a random internal password players never use.

**Q: How does staff identify the player?**  
By `@username`, display name, and `gameUserId` on the profile. One chat thread per player.

**Q: Can we open chat without calling provision first?**  
Yes. `game-sso` provisions lazily on first use. Provision on signup is still recommended.

**Q: What if WebView shows JSON error?**  
Token invalid/expired/used. Mint a fresh token and retry. Do not reuse `jti`.

**Q: Who generates `GAME_SSO_JWT_SECRET`?**  
Relay team generates and shares with your backend lead.

---

## Support contact

| Role | Contact |
|------|---------|
| Relay platform / API issues | _____________________ |
| Juwa game backend | _____________________ |

**Related docs:**
- `docs/IN_APP_INTEGRATION_HANDOFF.md` — high-level handoff guide
- `docs/TOKEN_AUTH_SPEC.md` — internal token spec

---

*End of API reference*
