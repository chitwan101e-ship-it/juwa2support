# Juwa 2.0 × Relay — Integration Essentials

**For:** Juwa 2.0 app developers  
**Auth:** JWT tokens only — **never send game passwords to Relay**  
**Secret:** `GAME_SSO_JWT_SECRET` provided separately (secure channel)

---

## What you need to understand (5 minutes)

### What Relay is
Relay is the **live support chat** for Juwa 2 Pay. You **do not build chat**. You open Relay’s web chat inside a **WebView popup** in the game.

### What happens when player taps headset
```
1. Player is logged into Juwa
2. App asks YOUR game server for a support link
3. Your server creates a short-lived signed token (60 sec)
4. App opens WebView with that link
5. Relay logs player in automatically → chat opens
6. Staff replies from their dashboard → player sees it in the popup
```

### How staff knows who the player is
Each player gets **one Relay profile** linked by:
- `gameUserId` — your internal player ID
- `@username` — Juwa login name
- `email`

Staff see name + `@username` in their inbox. One chat thread per player — history is saved.

### What you never do
- ❌ Put `GAME_SSO_JWT_SECRET` in the mobile app  
- ❌ Send game passwords to Relay  
- ❌ Build your own chat backend  

---

## Credentials (from Relay team)

| Item | Value |
|------|-------|
| `GAME_SSO_JWT_SECRET` | **[sent separately]** — game backend only |
| `GAME_SSO_JWT_ISSUER` | `juwa2-game` |
| `GAME_SSO_JWT_AUDIENCE` | `juwa2-relay` |
| Base URL | `https://juwa2.com` |

Add to **your game server** `.env`:
```env
GAME_SSO_JWT_SECRET=[from Relay team]
GAME_SSO_JWT_ISSUER=juwa2-game
GAME_SSO_JWT_AUDIENCE=juwa2-relay
RELAY_BASE_URL=https://juwa2.com
```

---

## Two APIs — that's all

| API | When | Who calls |
|-----|------|-----------|
| **Provision** `POST /api/auth/provision-game-user` | New Juwa signup | Game **backend** |
| **SSO** `GET /api/auth/game-sso?token=...` | Headset tap / open chat | Mobile **WebView** |

---

## API 1 — Provision (on signup)

**When:** Right after a new Juwa account is created.

```http
POST https://juwa2.com/api/auth/provision-game-user
Authorization: Bearer <server-jwt>
Content-Type: application/json
```

```json
{
  "gameUserId": "your-internal-player-id",
  "email": "player@email.com",
  "username": "playerlogin",
  "firstName": "John",
  "lastName": "Doe"
}
```

**No password.**

| Juwa signup field | API field |
|-------------------|-----------|
| Internal player ID | `gameUserId` |
| Account name | `username` |
| Email | `email` |

**Response:**
```json
{ "success": true, "relayUserId": "uuid", "provisioned": true }
```

---

## API 2 — SSO (open chat)

**When:** Player taps headset or "Contact Customer Support".

**Step 1 — Your backend mints a player JWT** (60 sec, new UUID for `jti` each time):

```json
{
  "iss": "juwa2-game",
  "aud": "juwa2-relay",
  "sub": "your-internal-player-id",
  "email": "player@email.com",
  "username": "playerlogin",
  "jti": "new-uuid-v4-here",
  "iat": 1718000000,
  "exp": 1718000060
}
```

Sign with `GAME_SSO_JWT_SECRET` using **HS256**.

**Step 2 — Return this URL to the mobile app:**

```
https://juwa2.com/api/auth/game-sso?token={JWT}&redirect=%2Ffeed%3FopenChat%3D1
```

**Step 3 — App opens WebView** with that URL. Chat opens. No login screen.

---

## JWT types (quick)

| Token | `sub` claim | TTL | Used for |
|-------|-------------|-----|----------|
| **Server** | `game-server` | 10 min | Provision API (`Authorization` header) |
| **Player** | `gameUserId` | 60 sec | SSO WebView (`?token=` param) |

Player token **must** include `jti` (unique UUID, single-use) and `email`.

---

## What you must build

### Game backend
| Task | Details |
|------|---------|
| Store secret | `GAME_SSO_JWT_SECRET` on server only |
| Sign JWTs | HS256 (see code below) |
| On signup | `POST` provision API |
| New endpoint e.g. `GET /support/sso-url` | Returns `{ "ssoUrl": "..." }` for logged-in player |

### Mobile app
| Task | Details |
|------|---------|
| Headset icon | Call your backend → open WebView with `ssoUrl` |
| Remove Facebook link | Replace with WebView flow |
| WebView popup | Enable cookies + JavaScript |
| Signup screen | Add "Contact Customer Support" below download button |

### You do NOT build
Chat UI · Staff tools · Supabase integration

---

## Minimal code (Node.js)

```javascript
const crypto = require('crypto')

const SECRET = process.env.GAME_SSO_JWT_SECRET
const ISS = 'juwa2-game'
const AUD = 'juwa2-relay'
const RELAY = 'https://juwa2.com'

function signJwt(payload) {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const b = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET).update(`${h}.${b}`).digest('base64url')
  return `${h}.${b}.${sig}`
}

// Server token — for provision API
function serverToken() {
  const now = Math.floor(Date.now() / 1000)
  return signJwt({ iss: ISS, aud: AUD, sub: 'game-server', iat: now, exp: now + 300 })
}

// Player token — for WebView
function playerToken(player) {
  const now = Math.floor(Date.now() / 1000)
  return signJwt({
    iss: ISS, aud: AUD,
    sub: player.gameUserId,
    email: player.email,
    username: player.username,
    jti: crypto.randomUUID(),
    iat: now, exp: now + 60,
  })
}

// On signup
async function onSignup(player) {
  await fetch(`${RELAY}/api/auth/provision-game-user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serverToken()}` },
    body: JSON.stringify({
      gameUserId: player.gameUserId,
      email: player.email,
      username: player.username,
      firstName: player.firstName,
      lastName: player.lastName,
    }),
  })
}

// On headset tap — mobile app calls this
function getSsoUrl(player) {
  const token = playerToken(player)
  return `${RELAY}/api/auth/game-sso?token=${encodeURIComponent(token)}&redirect=%2Ffeed%3FopenChat%3D1`
}
```

---

## Old players (already in app ~1 year)

No bulk migration needed. **First headset tap** auto-creates their Relay profile via the SSO endpoint.

---

## Common errors

| Error | Fix |
|-------|-----|
| `Invalid token signature` | Secret mismatch — check both sides use same secret |
| `Token expired` | Open WebView within 60 sec of minting token |
| `Token already used` | Generate new `jti` — never reuse |
| `Not a server token` | Server JWT must have `sub: "game-server"` |
| `Game SSO is not configured` | Contact Relay team |

---

## Test checklist

- [ ] `GET https://juwa2.com/api/health` → `{ "ok": true }`
- [ ] New signup → provision returns `200`
- [ ] Headset → WebView opens chat (no login page)
- [ ] Send message → staff sees in dashboard
- [ ] Staff reply → player sees in WebView
- [ ] Secret is NOT in mobile app

---

## Quick reference

```
SIGNUP:   POST /api/auth/provision-game-user  (server JWT, no password)
CHAT:     GET  /api/auth/game-sso?token=PLAYER_JWT&redirect=/feed?openChat=1
HEALTH:   GET  /api/health

Issuer:   juwa2-game
Audience: juwa2-relay
Secret:   [from Relay team — backend only]
```

---

**Relay contact:** ___________________  
**Full docs (optional):** `docs/JUWA2_GAME_INTEGRATION_COMPLETE.md`
