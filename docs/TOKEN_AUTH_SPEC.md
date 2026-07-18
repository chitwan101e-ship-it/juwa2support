# Token Authentication Spec — Game ↔ Relay (In-App Support)

**Status:** Implemented in this repository (v1)  
**Auth model:** Short-lived JWT — **no password sharing**

---

## Overview

Game backend and Relay backend share a signing secret (or asymmetric key pair).  
The mobile app **never** sends player passwords to Relay.

Two flows:

1. **Provision** — link a game player to a Relay support profile (signup or lazy)  
2. **SSO** — open chat in WebView with a 60-second token  

---

## Shared configuration

| Variable | Owner | Description |
|----------|-------|-------------|
| `GAME_SSO_JWT_SECRET` | Both backends | HMAC-SHA256 secret (min 32 random bytes) |
| `GAME_SSO_JWT_ISSUER` | Agreed | e.g. `juwa2-game` |
| `GAME_SSO_JWT_AUDIENCE` | Agreed | e.g. `juwa2-relay` |

Optional (stronger): RS256 with game private key + Relay public key.

---

## JWT claims

### Server-to-server (provision API `Authorization` header)

Longer-lived server token (e.g. 5 minutes), minted by game backend:

```json
{
  "iss": "juwa2-game",
  "aud": "juwa2-relay",
  "sub": "game-server",
  "iat": 1718000000,
  "exp": 1718000300
}
```

### Player SSO token (WebView)

Short-lived, single-use:

```json
{
  "iss": "juwa2-game",
  "aud": "juwa2-relay",
  "sub": "game-user-id-12345",
  "email": "player@example.com",
  "username": "playerlogin",
  "first_name": "John",
  "last_name": "Doe",
  "iat": 1718000000,
  "exp": 1718000060,
  "jti": "550e8400-e29b-41d4-a716-446655440000"
}
```

| Claim | Required | Notes |
|-------|----------|-------|
| `sub` | ✅ | Stable game user ID |
| `email` | ✅ | Links to Relay profile |
| `username` | ✅ | Display + profile |
| `first_name`, `last_name` | Optional | For new provisioning |
| `exp` | ✅ | Max 60s from `iat` for SSO |
| `jti` | ✅ | Unique per request — replay protection |

---

## API 1: Provision game user

```
POST /api/auth/provision-game-user
Authorization: Bearer <server-jwt>
Content-Type: application/json
```

### Request

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

### Relay server logic

```
1. Verify Authorization JWT (iss, aud, exp, signature)
2. Find profile by email OR game_user_id
3. If not found:
   a. admin.createUser({ email, email_confirm: true, password: randomUUID() })
   b. insert profiles row (role: customer, account_status: approved)
   c. insert follows (primary business)
   d. ensureSupportConversation()
4. If found: update username/name if changed
5. Return { success, relayUserId, provisioned }
```

### Response `200`

```json
{
  "success": true,
  "relayUserId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "provisioned": true
}
```

### Errors

| Status | Meaning |
|--------|---------|
| 401 | Invalid or expired server JWT |
| 400 | Missing required fields |
| 409 | Username taken by different email |

---

## API 2: Game SSO (WebView entry)

```
GET /api/auth/game-sso?token=<player-sso-jwt>&redirect=/feed?openChat=1
```

### Relay server logic

```
1. Verify player JWT (iss, aud, exp ≤ 60s, signature)
2. Check jti not in used_tokens store (Redis or DB, TTL 2 min)
3. Mark jti as used
4. provision user if missing (same as API 1, using claims)
5. admin.generateLink({ type: 'magiclink', email }) OR create session via service role
6. Set Supabase session cookies on response
7. Redirect 302 to redirect param (default /feed?openChat=1)
```

### Mobile app usage

```text
// Player taps headset
const res = await fetch('https://game-api.example.com/support/sso');
const { ssoUrl } = await res.json();
// ssoUrl = https://juwa2.com/api/auth/game-sso?token=...&redirect=/feed?openChat=1
webView.load(ssoUrl);
```

Game API `/support/sso` must require an **active game session** before minting the token.

---

## Security checklist

- [ ] Password never in request body for game integration  
- [ ] SSO token TTL ≤ 60 seconds  
- [ ] `jti` single-use enforcement  
- [ ] HTTPS only  
- [ ] Secret rotation procedure documented  
- [ ] Rate limit `/api/auth/game-sso` by IP + sub  
- [ ] Log failed verification attempts  

---

## Database addition (recommended)

Add to `profiles` table:

```sql
alter table public.profiles
  add column if not exists game_user_id text unique;
```

Links Relay profile to game account without relying on password.

---

## Reply to game developers

> We agree with token-based authentication. We will not require game passwords for in-app support.  
> Your backend will mint short-lived signed JWTs; our Relay server will validate, provision accounts, and open chat via WebView.  
> Please implement token minting on your server; we will deliver `/api/auth/provision-game-user` and `/api/auth/game-sso`.
