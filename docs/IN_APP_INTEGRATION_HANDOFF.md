# Juwa 2.0 In-App Support Integration — Handoff Guide

**For:** Juwa 2.0 mobile app team  
**From:** Relay / JUWA2 Support platform team  
**Purpose:** Connect the existing Juwa 2 app to Relay customer support (chat popup + secure account linking)  
**Auth model:** **Token-based SSO** (no password sharing) — agreed security approach

---

## In one sentence

When a player taps the **headset icon**, the game server gives Relay a **short-lived signed token** (not a password), Relay opens **live support chat** in a popup — no Facebook, no password sent over the internet.

---

## Security decision (agreed)

The game developers recommended **against sharing username/password** with the support system. **We agree.** This is the correct approach.

| Old approach (do NOT use for in-app) | New approach (use this) |
|--------------------------------------|-------------------------|
| Send same password to Relay on signup | **Never send game passwords to Relay** |
| Player logs into support with game password | **Short-lived token** minted by game server |
| Password exposed if Relay DB breached | Relay stores a **random internal password** players never know |
| Password travels over the network | Only a **signed JWT** travels (expires in ~60 seconds) |

> Players who visit the support **website directly** can still use email + password signup there.  
> **In-app integration uses tokens only.**

---

## How it works (simple picture)

```
PLAYER SIGNS UP IN JUWA APP
        │
        ▼
Game server tells Relay: "create support profile" (signed token, NO password)
        │
        ▼
Player plays → taps headset icon in lobby
        │
        ▼
Game server creates short-lived SSO token (~60 sec)
        │
        ▼
App opens WebView → Relay validates token → chat popup opens
        │
        ▼
Support staff replies from web dashboard → player sees reply in realtime
```

---

# PART 1 — What WE provide (Relay / Support team)

## 1.1 Access & credentials

Send in a **secure channel** (password manager — not public chat).

### Shared secret for token signing (both backends)

| Item | Who has it |
|------|------------|
| `GAME_SSO_JWT_SECRET` (or public key if using RS256) | Relay server + **game backend only** |

Used to sign and verify SSO tokens. **Never put in the mobile app.**

### For game BACKEND server only

| Item | What it's for |
|------|---------------|
| Supabase URL | Optional — only if they provision users themselves (not recommended) |
| Service Role Key | **We keep this.** They do NOT need it if using our token APIs |

> With token-based auth, the game team **does not need Supabase service role key**. They only need the shared JWT secret and our API URLs.

### For game MOBILE app

| Item | What it's for |
|------|---------------|
| Support chat URL | WebView target after SSO redirect |
| Nothing else | App never talks to Supabase directly in v1 |

### Public config

| Item | Value |
|------|-------|
| Support website | `https://juwa2.com` |
| SSO entry (WebView) | `https://juwa2.com/api/auth/game-sso?token=...` |
| Chat after login | `https://juwa2.com/feed?openChat=1` |

---

## 1.2 Source code

Share the full repository (Git or ZIP).

| File | Why |
|------|-----|
| `docs/GAME_INTEGRATION_API.md` | **API reference — send this to game devs** |
| `docs/IN_APP_INTEGRATION_HANDOFF.md` | This guide |
| `docs/TOKEN_AUTH_SPEC.md` | Token API details (when published) |
| `src/app/feed/page.tsx` | Chat UI (loaded in WebView) |
| `src/lib/ensureSupportConversation.ts` | How chat threads are created |

---

## 1.3 Live platform (already running)

| What | Status |
|------|--------|
| Support website + chat | ✅ Live |
| Staff dashboard | ✅ Live |
| Realtime messages | ✅ Live |

They do **not** build chat backend or staff tools.

---

## 1.4 APIs we provide (token-based)

### API 1 — Provision support account (server-to-server)

Called when a Juwa account is created, or lazily on first support use.

```
POST https://juwa2.com/api/auth/provision-game-user
Authorization: Bearer <signed-server-jwt>
Content-Type: application/json
```

**Request body:**

```json
{
  "gameUserId": "unique-id-from-game-database",
  "email": "player@email.com",
  "username": "player-login-name",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+15551234567"
}
```

**No password field.**

**What Relay does:**

1. Verifies the server JWT signature
2. Creates or updates Relay profile linked to `gameUserId` + `email`
3. Sets a **random internal password** (player never sees it)
4. Links player to JUWA2 support + creates chat thread if needed

**Response:**

```json
{
  "success": true,
  "relayUserId": "uuid",
  "provisioned": true
}
```

---

### API 2 — Open chat (SSO for WebView)

Called when player taps headset icon.

**Step A — Game server mints a short-lived token (on their side):**

```json
{
  "gameUserId": "unique-id-from-game",
  "email": "player@email.com",
  "username": "player-login-name",
  "iat": 1718000000,
  "exp": 1718000060,
  "jti": "unique-nonce-per-request"
}
```

Sign with `GAME_SSO_JWT_SECRET`. **Expire in 60 seconds.** **Single use.**

**Step B — Game app opens WebView:**

```
https://juwa2.com/api/auth/game-sso?token=<signed-jwt>&redirect=/feed?openChat=1
```

**What Relay does:**

1. Verifies signature + expiry + nonce (reject replay)
2. Finds or provisions the Relay account
3. Creates a Supabase session (server-side)
4. Redirects WebView to `/feed?openChat=1` — chat opens immediately

**No password is sent. No login screen.**

---

### API 3 — Health check

```
GET https://juwa2.com/api/health
```

---

## 1.5 Game SSO APIs (implemented)

| API | Route | Status |
|-----|-------|--------|
| Provision game user | `POST /api/auth/provision-game-user` | ✅ Built |
| WebView SSO | `GET /api/auth/game-sso` | ✅ Built |

**Before use:** Run `supabase/5_game_sso.sql` and set `GAME_SSO_JWT_SECRET` in `.env.local`.

**Dev test tokens:** `node scripts/game-sso-token.mjs player`

---

# PART 2 — What THEY need to do (Game app team)

## 2.1 Summary checklist

| # | Task | Where |
|---|------|--------|
| 1 | Store `GAME_SSO_JWT_SECRET` on game server | Backend |
| 2 | On Juwa signup → call provision API (no password) | Backend |
| 3 | On headset tap → mint 60s SSO token → open WebView | Backend + app |
| 4 | Replace Facebook link with chat WebView popup | Lobby |
| 5 | Add "Contact Customer Support" below download button | Signup screen |
| 6 | Test end-to-end | QA |

---

## 2.2 Task 1 — Link account on NEW signup (no password)

**When:** Player finishes "Create your account" in Juwa app.

**On their server (never on the device):**

```
POST /api/auth/provision-game-user
Authorization: Bearer <long-lived-server-jwt>
Body: { gameUserId, email, username, firstName, lastName, phone }
```

| Juwa field | API field |
|------------|-----------|
| Internal player ID | `gameUserId` |
| Account (login name) | `username` |
| Email | `email` |
| Name / phone | `firstName`, `lastName`, `phone` |

**Do NOT send the game password.**

---

## 2.3 Task 2 — Old players (~1 year of users)

Same flow, triggered **lazily**:

```
Player taps headset
  → Game server mints SSO token (includes gameUserId + email)
  → Relay provisions account automatically if missing
  → Chat opens
```

No separate migration required if lazy provisioning is enabled on SSO.

---

## 2.4 Task 3 — Headset icon → WebView popup

```
1. Player taps headset
2. App calls OWN game server: GET /support/sso-token (example)
3. Game server returns signed JWT (60 sec TTL) — OR app opens URL that game server redirects
4. App opens WebView:
   https://juwa2.com/api/auth/game-sso?token=JWT&redirect=/feed?openChat=1
5. Chat opens inside popup
6. Player closes popup → back to lobby
```

**Remove the Facebook URL.**

---

## 2.5 Task 4 — "Contact Customer Support" on signup screen

**Where:** Below "DOWNLOAD JUWA2.0 APP".

| Situation | Action |
|-----------|--------|
| Player logged in | Same WebView SSO flow as headset |
| Player not logged in | Prompt to create account first |

---

## 2.6 What they do NOT need

| Item | Reason |
|------|--------|
| Supabase service role key | Relay handles DB |
| Game password in API calls | Token auth only |
| Native chat UI (v1) | WebView loads our chat |
| Staff dashboard | We provide it |

---

# PART 3 — Token security rules (both teams)

| Rule | Detail |
|------|--------|
| Token TTL | **≤ 60 seconds** for SSO |
| Single use | Each `jti` nonce can only be used once |
| HTTPS only | All API and WebView traffic over TLS |
| Server-to-server | Provision API called from game **backend**, not mobile app |
| Secret storage | `GAME_SSO_JWT_SECRET` on servers only — never in APK/IPA |
| No passwords | Game password **never** sent to Relay for in-app flow |
| Replay protection | Relay stores used `jti` briefly and rejects duplicates |
| Optional upgrade | RS256 (game signs with private key, we verify with public key) |

### Why this is safer

1. **No password on the wire** — only a short-lived signed token  
2. **Breach isolation** — compromising Relay DB does not expose game passwords (we never store them)  
3. **Least privilege** — mobile app only opens a WebView URL; no DB keys in the app  
4. **Revocable** — rotate `GAME_SSO_JWT_SECRET` without changing player passwords  

---

# PART 4 — Step-by-step timeline

## Phase 1 — Setup

| Step | Who | Action |
|------|-----|--------|
| 1 | **Us** | Generate `GAME_SSO_JWT_SECRET`, share securely with their backend lead |
| 2 | **Us** | Send repo + this document |
| 3 | **Them** | Confirm WebView works on their stack (Unity / iOS / Android) |
| 4 | **Both** | Agree on `gameUserId` format (stable unique ID from game DB) |

## Phase 2 — Account linking

| Step | Who | Action |
|------|-----|--------|
| 5 | **Us** | Ship `provision-game-user` API |
| 6 | **Them** | Call provision API on new Juwa signup (no password) |
| 7 | **Both** | Test: new signup → Relay profile exists |

## Phase 3 — In-app chat

| Step | Who | Action |
|------|-----|--------|
| 8 | **Us** | Ship `game-sso` API |
| 9 | **Them** | Backend mints SSO token on headset tap |
| 10 | **Them** | WebView popup + remove Facebook |
| 11 | **Both** | Test: message in app → staff dashboard → reply in popup |

## Phase 4 — Launch

| Step | Who | Action |
|------|-----|--------|
| 12 | **Both** | QA checklist (below) |
| 13 | **Them** | App store release |

---

# PART 5 — Testing checklist

## Security

- [ ] No game password in any API request or app log
- [ ] SSO token expires after 60 seconds
- [ ] Reused SSO token is rejected
- [ ] `GAME_SSO_JWT_SECRET` not in mobile app binary

## Account linking

- [ ] New Juwa signup → Relay profile created (provision API)
- [ ] Old player → first headset tap → account auto-created
- [ ] Same player twice → no duplicate accounts

## Chat

- [ ] Headset opens WebView (not Facebook)
- [ ] No login screen in WebView
- [ ] Player sends message → staff sees it
- [ ] Staff reply → player sees it without refresh
- [ ] Close popup → lobby works normally

---

# PART 6 — Responsibility matrix

| Task | Relay team (us) | Game team (them) |
|------|-----------------|------------------|
| Chat UI + staff dashboard | ✅ | — |
| `GAME_SSO_JWT_SECRET` | ✅ Generate & share | ✅ Store on server |
| `provision-game-user` API | ✅ Build | ✅ Call on signup |
| `game-sso` API | ✅ Build | ✅ Open WebView with token |
| Mint SSO tokens | — | ✅ Backend |
| Headset → WebView | — | ✅ |
| Remove Facebook link | — | ✅ |
| Send game passwords to Relay | ❌ Never | ❌ Never |

---

# PART 7 — What to send them

1. ☐ **`docs/GAME_INTEGRATION_API.md`** — detailed API reference for game devs
2. ☐ This document  
3. ☐ Repository access  
4. ☐ `GAME_SSO_JWT_SECRET` (backend lead only, secure channel)  
5. ☐ Production URL: `https://juwa2.com`  
6. ☐ Your contact for integration questions  

**Do NOT send:** Supabase service role key (they don't need it for token auth).

---

# PART 8 — FAQ

**Q: Do we share the player's game password with Relay?**  
**No.** Token-based auth only for in-app integration.

**Q: Can players still log into juwa2.com in a browser?**  
Yes. Website signup/login remains separate. In-app uses tokens.

**Q: What if Relay's database is breached?**  
Game passwords are not stored in Relay for in-app users, so game accounts are not exposed via Relay.

**Q: Who creates the SSO token?**  
Game backend — never the mobile app directly (app calls game server first).

**Q: Do we still need Supabase keys?**  
Not for v1 WebView flow. Relay handles everything server-side.

---

**Relay platform contact:** _____________________  
**Document version:** 2.0 — Token auth — June 2026
