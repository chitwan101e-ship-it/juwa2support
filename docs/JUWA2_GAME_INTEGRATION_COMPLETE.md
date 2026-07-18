# Juwa 2.0 × Relay — Complete In-App Support Integration Documentation

**Document version:** 1.0  
**Date:** June 2026  
**Prepared by:** Relay / JUWA2 Support Platform Team  
**Audience:** Juwa 2.0 mobile app & backend developers  

---

> **How to use this document**  
> This is the **single complete reference** for integrating Juwa 2.0 in-app customer support with Relay.  
> The shared JWT secret (`GAME_SSO_JWT_SECRET`) is **not included here** — it will be provided separately via a secure channel.

---

## Table of contents

1. [Introduction](#1-introduction)
2. [Product requirements](#2-product-requirements)
3. [Architecture overview](#3-architecture-overview)
4. [Credentials & configuration](#4-credentials--configuration)
5. [Authentication model](#5-authentication-model)
6. [JWT specification](#6-jwt-specification)
7. [API reference](#7-api-reference)
8. [What the game team must build](#8-what-the-game-team-must-build)
9. [UI integration points](#9-ui-integration-points)
10. [How staff identify players](#10-how-staff-identify-players)
11. [Integration flows](#11-integration-flows)
12. [Code examples](#12-code-examples)
13. [Error reference](#13-error-reference)
14. [Testing guide](#14-testing-guide)
15. [Security requirements](#15-security-requirements)
16. [Rollout timeline](#16-rollout-timeline)
17. [Responsibility matrix](#17-responsibility-matrix)
18. [FAQ](#18-faq)
19. [Support contacts](#19-support-contacts)

---

## 1. Introduction

**Relay** is the official customer support platform for **Juwa 2 Pay**. It replaces the previous Facebook-based support flow and allows players to contact support staff **directly from the Juwa 2.0 mobile app**.

### What Relay provides (already built)

| Component | Status |
|-----------|--------|
| Support website (`juwa2.com`) | ✅ Live |
| Live chat (text + images) | ✅ Live |
| Staff inbox / dashboard | ✅ Live |
| Realtime message delivery | ✅ Live |
| Token-based game integration APIs | ✅ Live |

### What the game team builds

| Component | Owner |
|-----------|-------|
| JWT signing on game **backend** | Game team |
| Call provision API on signup | Game team |
| Headset icon → WebView chat popup | Game team |
| Remove Facebook support link | Game team |
| "Contact Customer Support" on signup screen | Game team |

### Auth approach (agreed)

**Token-based SSO only** for in-app integration.

- ❌ Do **not** send game passwords to Relay  
- ✅ Game backend signs short-lived JWTs  
- ✅ Relay validates tokens and opens chat in a WebView  

---

## 2. Product requirements

### 2.1 Automatic Relay account on Juwa signup

When a customer creates a Juwa 2 account, a Relay support profile is created automatically using the **same identity** (email, username, game user ID) — **without sharing the game password**.

### 2.2 In-app chat popup (headset icon)

- Location: lobby, top-right **headset emoji icon** (existing placement)
- Behavior: opens a **popup WebView** with Relay live chat
- Replaces: old Facebook redirect
- Primary use cases: **deposit issues**, **cash-out / withdrawal issues**

### 2.3 Contact Customer Support (signup screen)

- Location: **below** the "DOWNLOAD JUWA2.0 APP" button on the create-account screen
- Behavior: same WebView SSO flow as headset (if player is logged in)

### 2.4 Legacy players

The Juwa app has been live for ~1 year. Existing players may not have Relay profiles yet.  
**Solution:** lazy provisioning — first headset tap creates their Relay profile automatically via the SSO endpoint.

---

## 3. Architecture overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         JUWA 2.0 MOBILE APP                              │
│                                                                          │
│  Signup screen ──────────► Game backend ──POST──► Provision API         │
│  Headset icon  ──────────► Game backend ──mints──► Player JWT           │
│                              │                                           │
│                              ▼                                           │
│                     WebView popup loads game-sso URL                     │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    RELAY (juwa2.com — Next.js + Supabase)                │
│                                                                          │
│  GET  /api/auth/game-sso        → validate JWT → session → chat UI      │
│  POST /api/auth/provision-game-user → create/link player profile        │
│                                                                          │
│  /feed?openChat=1               → customer chat (loaded in WebView)     │
│  /dashboard                     → staff inbox (Relay staff only)        │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         SUPABASE DATABASE                                │
│  profiles · conversations · messages · game_user_id                      │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key principle

The mobile app **does not build chat**. It opens Relay’s existing web chat inside a **mini browser (WebView)**. The game backend only proves **who the player is** via signed JWTs.

---

## 4. Credentials & configuration

### 4.1 Values provided by Relay team

| Item | Value | How provided |
|------|-------|--------------|
| `GAME_SSO_JWT_SECRET` | `[PROVIDED SEPARATELY — SECURE CHANNEL]` | Password manager / encrypted message |
| `GAME_SSO_JWT_ISSUER` | `juwa2-game` | This document |
| `GAME_SSO_JWT_AUDIENCE` | `juwa2-relay` | This document |
| Production base URL | `https://juwa2.com` | This document |

### 4.2 Where game backend stores credentials

Add to your **game server** environment only (never in mobile app):

```env
GAME_SSO_JWT_SECRET=[provided separately by Relay team]
GAME_SSO_JWT_ISSUER=juwa2-game
GAME_SSO_JWT_AUDIENCE=juwa2-relay
RELAY_BASE_URL=https://juwa2.com
```

### 4.3 What game team does NOT need

| Item | Reason |
|------|--------|
| Supabase URL / keys | Relay handles database |
| Supabase service role key | Not required for token integration |
| Relay staff dashboard access | Support agents only |

### 4.4 Secret rotation

If `GAME_SSO_JWT_SECRET` is rotated, **both** Relay and game backend must update on the same schedule. Coordinate with Relay team.

---

## 5. Authentication model

Two JWT types, both signed with `GAME_SSO_JWT_SECRET` using **HS256**.

### Type A — Server token

| Property | Value |
|----------|-------|
| Used for | `POST /api/auth/provision-game-user` |
| Signed by | Game backend |
| `sub` claim | Must be `game-server` |
| TTL | Max **10 minutes** |
| Transport | `Authorization: Bearer <token>` header |

### Type B — Player token

| Property | Value |
|----------|-------|
| Used for | `GET /api/auth/game-sso` (WebView) |
| Signed by | Game backend |
| `sub` claim | Player `gameUserId` |
| `jti` claim | Unique UUID — **single use** |
| TTL | Max **120 seconds** (use **60 seconds**) |
| Transport | `?token=` query parameter on WebView URL |

### Algorithm

```
Header:  { "alg": "HS256", "typ": "JWT" }
Signing: HMAC-SHA256(header.payload, GAME_SSO_JWT_SECRET)
```

---

## 6. JWT specification

### 6.1 Server token (provision API)

**Example payload:**

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
| `iss` | Recommended | `juwa2-game` |
| `aud` | Recommended | `juwa2-relay` |
| `sub` | **Yes** | Must be exactly `game-server` |
| `iat` | **Yes** | Unix timestamp (seconds, UTC) |
| `exp` | **Yes** | Max 600 seconds after `iat` |

---

### 6.2 Player token (WebView SSO)

**Example payload:**

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
| `iss` | Recommended | `juwa2-game` |
| `aud` | Recommended | `juwa2-relay` |
| `sub` | **Yes** | Stable `gameUserId` from your database (max 128 chars) |
| `email` | **Yes** | Player email |
| `username` | Recommended | Juwa login name (no `@` prefix) |
| `first_name` | Optional | For new profile creation |
| `last_name` | Optional | For new profile creation |
| `phone` | Optional | Phone number |
| `jti` | **Yes** | New UUID v4 per SSO request — never reuse |
| `iat` | **Yes** | Unix timestamp (seconds, UTC) |
| `exp` | **Yes** | Max 120 seconds after `iat` (recommend 60) |

---

### 6.3 Signing pseudocode

```
header  = base64url(JSON.stringify({ "alg": "HS256", "typ": "JWT" }))
payload = base64url(JSON.stringify(claims))
data    = header + "." + payload
sig     = base64url(HMAC_SHA256(data, GAME_SSO_JWT_SECRET))
jwt     = data + "." + sig
```

---

## 7. API reference

### Base URLs

| Environment | URL |
|-------------|-----|
| **Production** | `https://juwa2.com` |
| Local Relay dev | `http://localhost:3000` |

| Endpoint | Method | Full URL |
|----------|--------|----------|
| Health check | `GET` | `{BASE_URL}/api/health` |
| Provision player | `POST` | `{BASE_URL}/api/auth/provision-game-user` |
| Open chat (SSO) | `GET` | `{BASE_URL}/api/auth/game-sso` |

---

### 7.1 Health check

Verify Relay is online before integration testing.

```
GET /api/health
```

**Response `200`:**

```json
{
  "ok": true,
  "deploy": "DEPLOY-CHECK-2026-06-08-v5",
  "vercel": true
}
```

---

### 7.2 Provision game user

Creates or updates a Relay support profile. **No password in request.**

#### Request

```http
POST /api/auth/provision-game-user HTTP/1.1
Host: juwa2.com
Content-Type: application/json
Authorization: Bearer <server-jwt>
```

#### Body

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
| `email` | string | **Yes** | Player email address |
| `username` | string | **Yes** | Juwa account / login name |
| `firstName` | string | No | Defaults to username or `Player` |
| `lastName` | string | No | Defaults to `User` |
| `phone` | string | No | Optional phone |

#### Juwa signup screen mapping

| Juwa 2 UI field | API field |
|-----------------|-----------|
| Account (login name) | `username` |
| Email | `email` |
| Internal database player ID | `gameUserId` |
| Name / phone (if collected) | `firstName`, `lastName`, `phone` |

#### Success `200`

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
| `relayUserId` | UUID of player in Relay |
| `provisioned` | `true` = newly created; `false` = existing profile updated |

#### Relay internal behavior

1. Validates server JWT  
2. Looks up profile by `gameUserId` or `email`  
3. Creates profile if missing (random internal password — player never sees it)  
4. Links player to JUWA2 support business  
5. Creates chat thread (`conversation`)  
6. Sends welcome message on **first** provision only  

#### When to call

| Event | Call? |
|-------|-------|
| New Juwa account created | **Yes** — immediately after signup |
| Player taps headset | No — SSO handles lazy provision |
| Every app login | No |

---

### 7.3 Game SSO (WebView entry)

Opens support chat with automatic login. Called when player taps headset or "Contact Customer Support".

#### Request

```http
GET /api/auth/game-sso?token=<player-jwt>&redirect=/feed?openChat=1 HTTP/1.1
Host: juwa2.com
```

| Query param | Required | Description |
|-------------|----------|-------------|
| `token` | **Yes** | URL-encoded player JWT |
| `redirect` | No | Path after login. Default: `/feed?openChat=1`. Must start with `/` |

#### Success `302 Redirect`

Browser/WebView is redirected to:

```
https://juwa2.com/feed?openChat=1
```

Session cookies are set in the WebView. Chat panel opens automatically. **No login form.**

#### Error `4xx` / `5xx`

```json
{ "error": "Token expired." }
```

If WebView shows raw JSON, mint a fresh token with a new `jti` and retry.

#### Relay internal behavior

1. Validates player JWT (signature, expiry, claims)  
2. Rejects duplicate `jti` (replay protection)  
3. Provisions profile if not yet created  
4. Creates Supabase session cookies in WebView  
5. Redirects to chat page  

#### Recommended production URL

```
https://juwa2.com/api/auth/game-sso?token={PLAYER_JWT}&redirect=%2Ffeed%3FopenChat%3D1
```

---

## 8. What the game team must build

### 8.1 Game backend (required)

| # | Endpoint / logic | Description |
|---|------------------|-------------|
| 1 | JWT signing utility | HS256 with shared secret |
| 2 | `mintServerToken()` | For provision API (`sub: game-server`) |
| 3 | `mintPlayerToken(player)` | For SSO (`sub: gameUserId`, new `jti` each time) |
| 4 | On signup hook | `POST` to Relay provision API |
| 5 | `GET /support/sso-url` (example) | Authenticated endpoint for mobile app; returns `{ ssoUrl }` |

**Example response for mobile app:**

```json
{
  "ssoUrl": "https://juwa2.com/api/auth/game-sso?token=eyJ...&redirect=%2Ffeed%3FopenChat%3D1",
  "expiresIn": 60
}
```

Only mint SSO URL if player has a **valid Juwa game session**.

### 8.2 Mobile app (required)

| # | Task | Screen |
|---|------|--------|
| 1 | Headset icon → call game backend → open WebView with `ssoUrl` | Lobby |
| 2 | Remove Facebook support URL | Lobby |
| 3 | WebView modal (popup, not full browser) | Lobby |
| 4 | Handle WebView close → return to lobby | Lobby |
| 5 | "Contact Customer Support" link/button | Signup screen |
| 6 | Optional: show loading while WebView loads | Lobby |

### 8.3 Game backend (NOT required)

- Supabase integration  
- Native chat UI  
- Storing game passwords for Relay  
- Staff dashboard  

---

## 9. UI integration points

### 9.1 Lobby — headset icon

**Before:** `headset tap` → open Facebook URL  
**After:** `headset tap` → WebView popup with Relay chat  

```
Player taps 🎧
  → App: GET https://your-game-api.com/support/sso-url
       Header: Authorization: Bearer <juwa-game-session>
  → Backend returns ssoUrl
  → App opens WebView(ssoUrl)
  → Chat appears
  → Player closes WebView → back to lobby
```

### 9.2 Signup screen — Contact Customer Support

**Placement:** directly below **"DOWNLOAD JUWA2.0 APP"** button.

| Player state | Behavior |
|--------------|----------|
| Logged into Juwa | Same SSO WebView flow as headset |
| Not logged in / not registered | Show message: "Create your account first" or open after signup |

**Suggested label:** `Contact Customer Support`

### 9.3 WebView recommendations

| Setting | Recommendation |
|---------|----------------|
| Size | Near full-screen modal on mobile |
| JavaScript | Enabled |
| Cookies | Enabled (required for session) |
| HTTPS only | Required |
| Close button | Visible — returns player to game |

---

## 10. How staff identify players

Each Juwa player maps to **one Relay profile** and **one chat thread**.

| Identifier | Source | Visible to staff |
|------------|--------|------------------|
| `gameUserId` | Game database → stored on Relay profile | Internal link |
| `@username` | Juwa login name | ✅ Inbox + thread header |
| Display name | `firstName` + `lastName` | ✅ Inbox list |
| `relayUserId` | Relay UUID | Contact profile panel |
| Chat history | `messages` table | ✅ Full thread |

**One player = one conversation.** Opening chat 10 times shows the same history.

Staff work in: `https://juwa2.com/dashboard` → Inbox  
No changes required on staff side for game integration.

---

## 11. Integration flows

### Flow 1 — New player signup

```
1. Player completes Juwa signup (account, email, password)
2. Game server creates Juwa account
3. Game server: POST /api/auth/provision-game-user
   (server JWT + gameUserId, email, username — NO password)
4. Relay creates support profile + chat thread
5. Player can open support later via headset
```

### Flow 2 — Headset tap (primary flow)

```
1. Player logged into Juwa, taps headset in lobby
2. App → game backend: request SSO URL
3. Game backend mints player JWT (60s, new jti)
4. App opens WebView:
   https://juwa2.com/api/auth/game-sso?token=...&redirect=/feed?openChat=1
5. Relay validates → logs in → opens chat
6. Player messages support
7. Staff replies in dashboard
8. Player sees reply in WebView (realtime)
9. Player closes WebView
```

### Flow 3 — Legacy player (existing ~1 year users)

```
1. Player has Juwa account but no Relay profile yet
2. Player taps headset → same as Flow 2
3. game-sso auto-provisions profile on first use
4. Chat opens normally
```

### Flow 4 — Deposit / withdrawal support

Same as Flow 2. Player opens chat from lobby (near ATM area).  
Optional future enhancement: pre-fill first message with context — coordinate with Relay team.

---

## 12. Code examples

### 12.1 Node.js — complete integration module

```javascript
const crypto = require('crypto')

const SECRET = process.env.GAME_SSO_JWT_SECRET
const ISS = process.env.GAME_SSO_JWT_ISSUER || 'juwa2-game'
const AUD = process.env.GAME_SSO_JWT_AUDIENCE || 'juwa2-relay'
const RELAY_BASE = process.env.RELAY_BASE_URL || 'https://juwa2.com'

function signJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const data = `${header}.${body}`
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url')
  return `${data}.${sig}`
}

function mintServerToken() {
  const now = Math.floor(Date.now() / 1000)
  return signJwt({ iss: ISS, aud: AUD, sub: 'game-server', iat: now, exp: now + 300 })
}

function mintPlayerToken(player) {
  const now = Math.floor(Date.now() / 1000)
  return signJwt({
    iss: ISS,
    aud: AUD,
    sub: String(player.gameUserId),
    email: player.email.toLowerCase(),
    username: player.username.replace(/^@+/, ''),
    first_name: player.firstName,
    last_name: player.lastName,
    phone: player.phone,
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + 60,
  })
}

async function provisionRelayPlayer(player) {
  const res = await fetch(`${RELAY_BASE}/api/auth/provision-game-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${mintServerToken()}`,
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

function buildSsoUrl(player) {
  const token = mintPlayerToken(player)
  const redirect = encodeURIComponent('/feed?openChat=1')
  return `${RELAY_BASE}/api/auth/game-sso?token=${encodeURIComponent(token)}&redirect=${redirect}`
}

module.exports = { provisionRelayPlayer, buildSsoUrl, mintServerToken, mintPlayerToken }
```

### 12.2 Example — game backend route for mobile app

```javascript
// GET /support/sso-url
// Requires valid Juwa game session
app.get('/support/sso-url', requireJuwaAuth, (req, res) => {
  const player = req.user // { gameUserId, email, username, firstName, lastName, phone }
  res.json({
    ssoUrl: buildSsoUrl(player),
    expiresIn: 60,
  })
})
```

### 12.3 cURL — test provision

```bash
# Replace SERVER_TOKEN with a valid server JWT signed with your secret
curl -X POST "https://juwa2.com/api/auth/provision-game-user" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SERVER_TOKEN" \
  -d '{
    "gameUserId": "test-user-001",
    "email": "testplayer@example.com",
    "username": "testplayer",
    "firstName": "Test",
    "lastName": "Player"
  }'
```

### 12.4 cURL — test health

```bash
curl https://juwa2.com/api/health
```

### 12.5 Python — sign player JWT

```python
import json, hmac, hashlib, base64, time, uuid, os

SECRET = os.environ["GAME_SSO_JWT_SECRET"].encode()
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

def build_sso_url(game_user_id: str, email: str, username: str) -> str:
    now = int(time.time())
    token = sign_jwt({
        "iss": ISS, "aud": AUD,
        "sub": game_user_id,
        "email": email,
        "username": username,
        "jti": str(uuid.uuid4()),
        "iat": now, "exp": now + 60,
    })
    from urllib.parse import quote
    return (
        "https://juwa2.com/api/auth/game-sso"
        f"?token={quote(token)}&redirect=%2Ffeed%3FopenChat%3D1"
    )
```

---

## 13. Error reference

### Provision API errors

| HTTP | Error message | Action |
|------|---------------|--------|
| 400 | `gameUserId, email, and username are required.` | Fix request body |
| 400 | `Invalid email.` | Fix email format |
| 401 | `Missing Authorization bearer token.` | Add `Authorization` header |
| 401 | `Invalid token signature.` | Check secret matches Relay |
| 401 | `Not a server token.` | Set `sub` to `game-server` |
| 401 | `Token expired.` | Mint fresh server JWT |
| 409 | `Username already taken.` | Username conflict — contact Relay |
| 409 | `Email is linked to a different game account.` | Identity conflict |
| 409 | `Phone number already in use.` | Phone conflict |
| 500 | `Provisioning failed.` | Retry; contact Relay if persistent |
| 503 | `Game SSO is not configured.` | Relay env not set — contact Relay |

### SSO API errors

| HTTP | Error message | Action |
|------|---------------|--------|
| 400 | `Missing token.` | Include `token` query param |
| 401 | `Token expired.` | Mint new token immediately before WebView |
| 401 | `Missing jti (single-use nonce).` | Add `jti` UUID to payload |
| 401 | `Token already used.` | Generate new `jti` — never reuse |
| 401 | `Invalid token signature.` | Verify shared secret |
| 401 | `Player token TTL too long` | Set `exp - iat` ≤ 120 (use 60) |
| 500 | `SSO failed.` | Retry; contact Relay |
| 503 | `Game SSO is not configured.` | Contact Relay team |

---

## 14. Testing guide

### 14.1 Prerequisites

- [ ] Relay team has run `supabase/5_game_sso.sql` in Supabase  
- [ ] Relay has `GAME_SSO_JWT_SECRET` configured  
- [ ] You received the same secret via secure channel  
- [ ] `GET /api/health` returns `{ "ok": true }`  

### 14.2 Test sequence

| Step | Test | Expected |
|------|------|----------|
| 1 | `POST provision-game-user` with new `gameUserId` | `200`, `provisioned: true` |
| 2 | Repeat same `gameUserId` | `200`, `provisioned: false` |
| 3 | Mint player JWT, open `game-sso` URL in browser/WebView | Chat opens, no login page |
| 4 | Reuse same `jti` | `401 Token already used` |
| 5 | Wait 61+ seconds, use expired token | `401 Token expired` |
| 6 | Send chat message from WebView | Staff sees in dashboard inbox |
| 7 | Staff replies | Player sees reply without refresh |
| 8 | Close WebView, reopen | Chat history preserved |

### 14.3 Security tests

- [ ] `GAME_SSO_JWT_SECRET` not in mobile app binary  
- [ ] No game password in any Relay API request  
- [ ] SSO token minted only server-side  
- [ ] Unauthenticated app request cannot get `ssoUrl`  

### 14.4 End-to-end checklist (production)

- [ ] New signup → provision succeeds  
- [ ] Headset opens WebView (Facebook removed)  
- [ ] Legacy player first tap → account created + chat works  
- [ ] "Contact Customer Support" on signup screen works  
- [ ] Deposit/withdrawal scenario tested with staff  

---

## 15. Security requirements

| # | Rule |
|---|------|
| 1 | **Never** embed `GAME_SSO_JWT_SECRET` in mobile app (APK/IPA) |
| 2 | **Never** send Juwa game passwords to Relay |
| 3 | Mint all JWTs on **game backend** only |
| 4 | Player JWT TTL ≤ **60 seconds** |
| 5 | New **`jti`** UUID for every SSO attempt |
| 6 | All traffic over **HTTPS** |
| 7 | Validate Juwa game session before minting SSO token |
| 8 | Provision API is **server-to-server** only |

### Why token auth

| Risk | Mitigation |
|------|------------|
| Password intercepted in transit | Only short-lived JWT sent |
| Relay DB breach exposes game passwords | Game passwords never stored in Relay |
| Token replay | Single-use `jti` enforcement |
| Stolen mobile app binary | No secret in app |

---

## 16. Rollout timeline

| Phase | Game team | Relay team |
|-------|-----------|------------|
| **Week 1 — Setup** | Store secret on backend; confirm WebView works | Share secret + this doc |
| **Week 2 — Accounts** | Implement provision on signup | Support testing |
| **Week 3 — Chat** | Headset WebView + remove Facebook | Monitor API logs |
| **Week 4 — QA** | Full test checklist | Staff ready in dashboard |
| **Week 5 — Launch** | App store release | Monitor support volume |

---

## 17. Responsibility matrix

| Task | Relay team | Game team |
|------|------------|-----------|
| Chat UI & messaging | ✅ | — |
| Staff dashboard | ✅ | — |
| `GAME_SSO_JWT_SECRET` generation | ✅ | — |
| Store secret on server | ✅ (Relay) | ✅ (game backend) |
| `provision-game-user` API | ✅ Built | Call on signup |
| `game-sso` API | ✅ Built | Open WebView |
| Mint JWTs | — | ✅ Backend |
| Headset → WebView popup | — | ✅ Mobile |
| Remove Facebook link | — | ✅ Mobile |
| Contact Support on signup | — | ✅ Mobile |
| Send game passwords | ❌ Never | ❌ Never |
| Supabase keys to game team | ❌ Not needed | — |

---

## 18. FAQ

**Q: Do we build a chat system?**  
No. Relay provides chat. You open it in a WebView.

**Q: Do players need a Relay password for in-app support?**  
No. Token SSO logs them in automatically.

**Q: Do we need Supabase access?**  
No. Relay handles all database operations.

**Q: Can we skip provision API and only use SSO?**  
Yes for legacy users (lazy provision). Provision on signup is still recommended.

**Q: What is `gameUserId`?**  
Your internal stable player ID from the Juwa game database. Never changes for a player.

**Q: What if WebView shows JSON error text?**  
Token is invalid, expired, or reused. Mint a fresh token with a new `jti`.

**Q: Can players still use juwa2.com in a browser?**  
Yes. Website login is separate. In-app uses tokens only.

**Q: How fast must we open WebView after minting token?**  
Within 60 seconds (before `exp`).

**Q: Who do we contact for API issues?**  
See [Support contacts](#19-support-contacts) below.

---

## 19. Support contacts

| Role | Name | Email |
|------|------|-------|
| Relay platform / API | ___________________ | ___________________ |
| Juwa game backend lead | ___________________ | ___________________ |
| Juwa mobile app lead | ___________________ | ___________________ |

---

## Appendix A — Quick reference card

```
CREDENTIALS (secret sent separately):
  GAME_SSO_JWT_ISSUER     = juwa2-game
  GAME_SSO_JWT_AUDIENCE   = juwa2-relay
  GAME_SSO_JWT_SECRET     = [secure channel]
  RELAY_BASE_URL          = https://juwa2.com

ON SIGNUP (game backend):
  POST https://juwa2.com/api/auth/provision-game-user
  Authorization: Bearer <server-jwt>
  Body: { gameUserId, email, username, firstName?, lastName?, phone? }

ON HEADSET TAP (game backend → mobile):
  1. Mint player JWT (sub=gameUserId, jti=new UUID, exp=now+60)
  2. Return URL:
     https://juwa2.com/api/auth/game-sso?token=JWT&redirect=%2Ffeed%3FopenChat%3D1
  3. Mobile opens WebView with that URL

HEALTH CHECK:
  GET https://juwa2.com/api/health
```

---

## Appendix B — Credential handoff (fill in when sending)

```
JUWA 2.0 × RELAY — CREDENTIAL HANDOFF
Date: _______________

Relay base URL:     https://juwa2.com
JWT Issuer:         juwa2-game
JWT Audience:       juwa2-relay
JWT Secret:         [ATTACHED SEPARATELY / PASSWORD MANAGER LINK]

API Endpoints:
  POST /api/auth/provision-game-user
  GET  /api/auth/game-sso
  GET  /api/health

Documentation: JUWA2_GAME_INTEGRATION_COMPLETE.md
```

---

*End of document — Juwa 2.0 × Relay Complete Integration Documentation v1.0*
