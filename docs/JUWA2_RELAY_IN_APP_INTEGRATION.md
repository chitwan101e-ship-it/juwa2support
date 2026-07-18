# JUWA 2.0 × Relay — In-App Customer Support Integration Guide

**Document version:** 1.0  
**Last updated:** June 2026  
**Audience:** Juwa 2.0 mobile app development team  
**Prepared by:** Relay / JUWA2 Support platform team  

---

## Table of contents

1. [Overview](#1-overview)
2. [What Relay is](#2-what-relay-is)
3. [Integration goals](#3-integration-goals)
4. [Architecture](#4-architecture)
5. [Credentials & access handoff](#5-credentials--access-handoff)
6. [Account sync (automatic Relay account creation)](#6-account-sync-automatic-relay-account-creation)
7. [Legacy users (existing app players)](#7-legacy-users-existing-app-players)
8. [In-app chat popup (headset icon)](#8-in-app-chat-popup-headset-icon)
9. [Contact Customer Support (signup screen)](#9-contact-customer-support-signup-screen)
10. [Supabase database reference](#10-supabase-database-reference)
11. [API reference](#11-api-reference)
12. [Integration options (WebView vs native)](#12-integration-options-webview-vs-native)
13. [SSO / session handoff (required for WebView)](#13-sso--session-handoff-required-for-webview)
14. [Code reference (repository)](#14-code-reference-repository)
15. [Staff side (no app changes required)](#15-staff-side-no-app-changes-required)
16. [Security rules](#16-security-rules)
17. [Testing checklist](#17-testing-checklist)
18. [Rollout plan](#18-rollout-plan)
19. [FAQ](#19-faq)
20. [Appendix: credential handoff template](#20-appendix-credential-handoff-template)

---

## 1. Overview

**Relay** is the official customer support platform for **Juwa 2 Pay**. It replaces the previous Facebook-based support flow and gives players direct, in-app access to live support staff.

This document describes how the **Juwa 2.0 mobile app** (released ~1 year ago) should integrate with the **Relay support portal** (web platform backed by **Supabase**).

### Current state

| Component | Status |
|-----------|--------|
| Relay web portal (signup, feed, chat, staff dashboard) | ✅ Live on website |
| Supabase database (auth, messages, realtime) | ✅ Deployed |
| Juwa 2.0 mobile app | ✅ Live (headset → Facebook today) |
| Auto account sync (game ↔ Relay) | 🔲 To implement |
| In-app chat popup (headset → Relay) | 🔲 To implement |
| "Contact Customer Support" on signup screen | 🔲 To implement |
| SSO (seamless login from game → chat) | 🔲 To implement |

### What the game team receives

- This integration guide
- Relay support platform source code (repository)
- Supabase credentials (scoped — see [Section 5](#5-credentials--access-handoff))
- Production URLs and configuration values

---

## 2. What Relay is

Relay is **not** a third-party SaaS product. It is the **JUWA2 Support portal** — a custom platform built on:

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15 (App Router), React, TypeScript |
| Styling | Tailwind CSS |
| Database / Auth / Realtime | Supabase (PostgreSQL) |
| Deployment | Vercel |

### Key URLs (production — replace with actual values when provided)

| Purpose | URL |
|---------|-----|
| Support portal (home) | `https://juwa2.com` |
| Player login | `https://juwa2.com/login` |
| Player feed + chat | `https://juwa2.com/feed` |
| Open chat directly | `https://juwa2.com/feed?openChat=1` |
| Staff dashboard | `https://juwa2.com/dashboard` |
| Health check | `https://juwa2.com/api/health` |

### How chat works today (web)

1. Customer logs into the support portal with email + password.
2. On `/feed`, a floating chat button opens a popup panel.
3. Messages are stored in Supabase (`conversations`, `messages`).
4. Support staff reply from `/dashboard` → Inbox.
5. Messages sync in realtime via Supabase Realtime.

The in-app integration should connect the **existing game app** to this same backend.

---

## 3. Integration goals

Per product requirements:

### 3.1 Automatic Relay account on Juwa signup

> When a customer creates a Juwa 2 account, their Relay account is automatically generated using the **same login credentials** (email + password + username).

### 3.2 Contact Customer Support on signup screen

> A **"Contact Customer Support"** option will be added **directly below** the Juwa 2 app download link on the create-account screen.

### 3.3 In-app support popup from lobby

> In-app customer support functions as a **pop-up**. Players tap the **headset emoji icon** in the lobby (top-right) to contact support — especially for **deposit** or **cash-out** issues.

> **Before:** Headset icon redirected to a Facebook link.  
> **After:** Headset icon opens Relay chat directly from the lobby.

### 3.4 Supabase as shared database

> Supabase is used for data storage. Complete Supabase login details will be provided to ensure a smooth integration process.

---

## 4. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    JUWA 2.0 MOBILE APP                          │
│                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────────────┐ │
│  │ Signup Screen│   │ Lobby        │   │ Chat Popup          │ │
│  │ + Contact    │   │ Headset Icon │──▶│ (WebView or Native) │ │
│  │   Support    │   │              │   │                     │ │
│  └──────┬───────┘   └──────┬───────┘   └──────────┬──────────┘ │
│         │                  │                       │            │
│         │    Game Backend  │                       │            │
│         └────────┬─────────┘                       │            │
└──────────────────┼─────────────────────────────────┼────────────┘
                   │                                 │
                   ▼                                 ▼
┌──────────────────────────────┐    ┌─────────────────────────────┐
│  Relay Support Portal      │    │  Supabase                   │
│  (Next.js on Vercel)       │    │                             │
│                            │    │  • auth.users               │
│  POST /api/auth/register   │───▶│  • profiles                 │
│  GET  /feed?openChat=1     │    │  • conversations            │
│  /dashboard (staff inbox)  │    │  • messages                 │
└──────────────────────────────┘    │  • Realtime subscriptions   │
                                    └─────────────────────────────┘
```

### Data flow summary

| Event | Action |
|-------|--------|
| New Juwa signup | Game backend creates matching Relay/Supabase user |
| Existing player taps headset | Ensure Relay account exists → open chat popup |
| Player sends message | Insert into `messages` → staff sees in dashboard |
| Staff replies | Realtime update → player sees reply in popup |
| Player taps "Contact Customer Support" on signup | Open support URL or in-app chat (before/after account creation) |

---

## 5. Credentials & access handoff

The Relay platform team will provide credentials in a **secure channel** (not email/plain text if possible). Use the template in [Appendix](#20-appendix-credential-handoff-template).

### 5.1 What to give the game BACKEND team (server only)

| Credential | Variable name | Purpose |
|------------|---------------|---------|
| Supabase project URL | `SUPABASE_URL` | API endpoint |
| Supabase service role key | `SUPABASE_SERVICE_ROLE_KEY` | Create users, provision accounts (**never expose in mobile app**) |

### 5.2 What to give the game MOBILE team (client — if using native chat)

| Credential | Variable name | Purpose |
|------------|---------------|---------|
| Supabase project URL | `NEXT_PUBLIC_SUPABASE_URL` | Client connection |
| Supabase anon key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Authenticated client access (RLS-protected) |

### 5.3 Configuration values (both teams)

| Variable | Example | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_APP_URL` | `https://juwa2.com` | Support portal base URL |
| `NEXT_PUBLIC_SUPPORT_DOMAIN` | `juwa2.com` | Primary support domain |
| `NEXT_PUBLIC_PRIMARY_SUPPORT_BUSINESS_SLUG` | `juwa2` | Routes chat to correct support business |

### 5.4 Optional: Supabase Dashboard access

- **Recommended:** Add game backend lead as **read-only** collaborator in Supabase Dashboard.
- **Not required** if they only use API keys and this document.
- **Never** share the service role key in the mobile app binary.

### 5.5 What NOT to share in the mobile app

| Item | Reason |
|------|--------|
| `SUPABASE_SERVICE_ROLE_KEY` | Full database bypass; extractable from APK/IPA |
| Staff dashboard credentials | Support team only |
| Resend / Turnstile secrets | Server-only |

---

## 6. Account sync (automatic Relay account creation)

When a player creates a **Juwa 2 account**, a **Relay account** must be created automatically with the **same credentials**.

### 6.1 Field mapping

| Juwa 2 signup field | Relay / Supabase field | Required |
|---------------------|------------------------|----------|
| Account (login name) | `username` | ✅ Yes |
| Email | `email` | ✅ Yes |
| Password | `password` | ✅ Yes |
| First name | `firstName` | ✅ Yes (website API) |
| Last name | `lastName` | ✅ Yes (website API) |
| Phone | `phone` | ✅ Yes (website API today) |

> **Note:** The current Relay register API requires `phone`, `firstName`, and `lastName`. If the game signup form does not collect these, agree on defaults or extend the game form before integration.

### 6.2 Option A — Call Relay register API (recommended for new signups)

**Endpoint:** `POST https://juwa2.com/api/auth/register`  
**Content-Type:** `application/json`  
**Called from:** Game backend server (not the mobile client)

**Request body:**

```json
{
  "email": "player@example.com",
  "password": "SamePasswordAsGameAccount",
  "username": "playerlogin",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+15551234567",
  "turnstileToken": "optional-if-otp-enabled"
}
```

**Success response (200):**

```json
{
  "success": true,
  "userId": "uuid-of-new-user",
  "businessId": "uuid-of-primary-business",
  "subdomain": "juwa2"
}
```

**What this API does automatically:**

1. Creates Supabase Auth user (`auth.users`)
2. Inserts `profiles` row (`role: customer`, `account_status: approved`)
3. Auto-follows primary support business (`juwa2`)
4. Sends welcome notification
5. Creates welcome chat message from support staff
6. Notifies staff admins of new signup

**Error responses:**

| Status | Meaning |
|--------|---------|
| 400 | Missing fields, duplicate username/email/phone, captcha failed |
| 429 | Rate limited |
| 500 | Server error |

### 6.3 Option B — Direct Supabase Admin API (server-side)

If the game backend prefers direct database access, replicate the register flow using the service role key:

```
1. supabase.auth.admin.createUser({ email, password, email_confirm: true })
2. INSERT into profiles (id, username, first_name, last_name, phone, role: 'customer', account_status: 'approved')
3. INSERT into follows (user_id, business_id) — primary business
4. ensureSupportConversation(business_id, customer_id)
5. Optional: insert welcome message
```

Reference implementation: `src/app/api/auth/register/route.ts`  
Conversation helper: `src/lib/ensureSupportConversation.ts`

### 6.4 When to trigger sync

| Trigger | Recommended action |
|---------|-------------------|
| Juwa account created (new signup) | Call register API immediately after game account creation |
| Juwa password changed | Update Supabase auth password (admin API) |
| Juwa account deleted | Coordinate with support team (soft-delete policy) |

### 6.5 Idempotency

Before creating a user, check if the email or username already exists in `profiles`. If the player already has a Relay account, skip creation and proceed to chat.

---

## 7. Legacy users (existing app players)

The Juwa 2 app has been live for ~1 year. **Existing players do not have Relay accounts yet.**

Choose one strategy (agree with Relay team before launch):

### Option A — Lazy provisioning (recommended)

On first headset tap (or first login after app update):

1. Game backend checks if email exists in Supabase Auth.
2. If not → create Relay account with same credentials via service role.
3. Open chat popup.

**Pros:** No bulk migration, gradual rollout.  
**Cons:** Requires game backend endpoint.

### Option B — Bulk migration

1. Export existing game users (email, username, password hash or reset flow).
2. Batch create Supabase users via script.
3. Import `profiles` + `follows` + `conversations`.

**Pros:** All users ready on day one.  
**Cons:** Password sync complexity (hashes may not be compatible).

### Option C — Force one-time web login

Open WebView to `https://juwa2.com/login` on first use.

**Pros:** Simplest technically.  
**Cons:** Poor UX; not recommended.

> **Recommendation:** Use **Option A (lazy provisioning)** for legacy users and **Option A register API** for new signups.

---

## 8. In-app chat popup (headset icon)

### 8.1 Current behavior (remove)

```
Lobby → tap headset icon → open Facebook URL
```

### 8.2 New behavior (implement)

```
Lobby → tap headset icon → open Relay chat popup (in-app overlay)
```

### 8.3 UI requirements

| Requirement | Detail |
|-------------|--------|
| Trigger | Headset emoji icon, top-right of lobby (existing placement) |
| Presentation | Pop-up / modal overlay (not full app navigation away) |
| Primary use case | Deposit issues, cash-out / withdrawal issues |
| Close behavior | Player can dismiss popup and return to lobby |
| Session | Player should not need to log in again if already logged into game |

### 8.4 Deep link URL

```
https://juwa2.com/feed?openChat=1
```

The `openChat=1` query parameter is already supported in the Relay web app (`src/app/feed/page.tsx`) and automatically opens the chat panel.

### 8.5 Optional: context for deposit / withdrawal

Pass context when opening from ATM / withdrawal areas:

```
https://juwa2.com/feed?openChat=1&context=withdrawal
```

> Custom context handling may require a small addition on the Relay side. Coordinate with the platform team if pre-filled messages are needed (e.g. "I need help with a withdrawal").

### 8.6 Implementation approaches

See [Section 12](#12-integration-options-webview-vs-native). WebView is recommended for v1.

---

## 9. Contact Customer Support (signup screen)

### 9.1 Placement

On the **"Create your account"** screen, add **"Contact Customer Support"** directly **below** the **"DOWNLOAD JUWA2.0 APP"** button.

### 9.2 Behavior options

| Player state | Recommended action |
|--------------|-------------------|
| Not yet registered | Link to `https://juwa2.com/login?redirect=/feed?openChat=1` or open chat after signup |
| Just registered | Open in-app chat popup (SSO) or `https://juwa2.com/feed?openChat=1` |
| On web signup page | Link to `https://juwa2.com/feed?openChat=1` |

### 9.3 Suggested label

```
Contact Customer Support
```

Style as a text link or secondary button below the blue download button.

---

## 10. Supabase database reference

### 10.1 Tables used for chat

#### `profiles`

Extends `auth.users` (1:1). One row per player.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | Same as `auth.users.id` |
| `username` | text | Unique; maps to Juwa login name |
| `first_name` | text | |
| `last_name` | text | |
| `phone` | text | |
| `role` | enum | `'customer'` for players |
| `account_status` | enum | `'approved'` for active players |

#### `businesses`

Support organizations. Primary business slug: `juwa2`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | |
| `name` | text | e.g. "JUWA2 Support" |
| `slug` | text | e.g. `juwa2` |

#### `follows`

Links customers to businesses they can message.

| Column | Type |
|--------|------|
| `user_id` | uuid → profiles |
| `business_id` | uuid → businesses |

#### `conversations`

One support thread per customer per business.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | |
| `business_id` | uuid | |
| `customer_id` | uuid | |
| `status` | text | `'open'` |

**Unique constraint:** `(business_id, customer_id)`

#### `messages`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | |
| `conversation_id` | uuid | |
| `sender_id` | uuid | Customer or staff profile id |
| `body` | text | Message text |
| `image_url` | text | Optional image attachment |
| `read` | boolean | Read receipt |
| `created_at` | timestamptz | |

### 10.2 Row Level Security (RLS)

Customers can only access their own conversations and messages. The anon key + authenticated session is sufficient for native chat — no service role needed on client.

Key policies (already deployed):

- Customers `SELECT` conversations where `customer_id = auth.uid()`
- Customers `INSERT` messages in their own conversations
- Staff access via `is_business_member(business_id)`

### 10.3 Realtime

Enable replication in Supabase Dashboard → Database → Replication for:

- `messages`
- `conversations`
- `notifications` (optional, for badges)

### 10.4 Storage

| Bucket | Purpose |
|--------|---------|
| `message-images` | Chat image attachments |

### 10.5 Full schema

See `supabase/schema.sql` in the repository.

---

## 11. API reference

### 11.1 Public endpoints (game integration)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/auth/register` | Create Relay account (new signups) |
| `GET` | `/api/health` | Verify portal is reachable |

**Health check example:**

```bash
curl https://juwa2.com/api/health
```

```json
{ "ok": true, "deploy": "...", "vercel": true }
```

### 11.2 Endpoints to be built (coordinate with Relay team)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/auth/provision-game-user` | Lazy-create Relay account for legacy players |
| `GET` | `/api/auth/sso` | One-time token → Supabase session for WebView |

> These do not exist yet. Request implementation from the Relay platform team if using WebView approach.

### 11.3 Staff endpoints (do not use in game app)

`/api/staff/*` — internal support dashboard only.

---

## 12. Integration options (WebView vs native)

### Option A — WebView popup (recommended for v1)

| Step | Action |
|------|--------|
| 1 | Player taps headset icon |
| 2 | App calls game backend for SSO URL or session token |
| 3 | App opens modal WebView |
| 4 | WebView loads `https://juwa2.com/feed?openChat=1` with session |
| 5 | Player chats with support staff |
| 6 | Player closes modal → returns to lobby |

**Pros:** Fastest to ship; reuses full Relay UI (images, typing, read receipts).  
**Cons:** Requires SSO endpoint; WebView UX depends on implementation.

**Platforms:**

- **Unity:** `Application.OpenURL` or embedded WebView plugin
- **Android:** `WebView` in `DialogFragment`
- **iOS:** `WKWebView` in modal `UIViewController`

### Option B — Native chat UI (Supabase SDK in app)

| Step | Action |
|------|--------|
| 1 | Initialize Supabase client with URL + anon key |
| 2 | `signInWithPassword(email, password)` — same as game login |
| 3 | Query `conversations` for primary business |
| 4 | Load `messages`; subscribe to Realtime |
| 5 | Render native chat UI; insert on send |

**Pros:** Native look and feel; no WebView.  
**Cons:** More dev work; must rebuild features (images, typing, etc.).

**Reference code in repository:**

- `src/app/feed/page.tsx` — customer chat logic
- `src/lib/customerMessaging.ts` — unread counts, previews
- `src/lib/ensureSupportConversation.ts` — create thread

### Recommendation

| Phase | Approach |
|-------|----------|
| v1 launch | WebView + SSO |
| v2 (optional) | Native chat if needed |

---

## 13. SSO / session handoff (required for WebView)

Players are already logged into Juwa 2. They should **not** see a second login screen when opening support chat.

### Proposed flow

```
1. Player logged into Juwa 2 (game has email + session)
2. Game backend mints short-lived signed JWT (e.g. 60 seconds)
   Payload: { email, userId, exp }
3. Game opens WebView:
   https://juwa2.com/api/auth/sso?token=<jwt>
4. Relay backend validates JWT (shared secret with game server)
5. Relay creates Supabase session cookie
6. Redirect to /feed?openChat=1
7. Chat opens immediately
```

### Requirements

| Item | Owner |
|------|-------|
| Shared JWT secret | Both teams |
| SSO endpoint on Relay portal | Relay platform team |
| Token minting on game login | Game backend team |
| WebView cookie handling | Game mobile team |

> **Status:** Not implemented yet. Schedule before WebView launch.

---

## 14. Code reference (repository)

### 14.1 Repository structure

```
zuwacustomersupport-main/
├── docs/
│   └── JUWA2_RELAY_IN_APP_INTEGRATION.md   ← this file
├── supabase/
│   ├── 00_START_HERE.sql                   ← DB setup guide
│   ├── 2_bootstrap.sql
│   ├── 3_extras.sql
│   └── schema.sql                          ← full schema reference
├── src/
│   ├── app/
│   │   ├── api/auth/register/route.ts      ← account creation
│   │   ├── feed/page.tsx                   ← customer chat UI
│   │   └── dashboard/page.tsx              ← staff inbox
│   └── lib/
│       ├── ensureSupportConversation.ts
│       ├── customerMessaging.ts
│       ├── resolvePrimaryBusiness.ts
│       └── supabase/client.ts
├── .env.local.example
└── README.md
```

### 14.2 Key files for game team

| File | Why read it |
|------|-------------|
| `src/app/api/auth/register/route.ts` | Exact account creation logic |
| `src/lib/ensureSupportConversation.ts` | How support threads are created |
| `src/app/feed/page.tsx` | Chat UI behavior, `openChat=1` handling |
| `src/lib/customerMessaging.ts` | Unread message logic |
| `supabase/schema.sql` | Database tables and RLS |
| `.env.local.example` | All environment variables |

---

## 15. Staff side (no app changes required)

Support staff continue using the **web dashboard**. No changes needed in the game app for staff.

| Task | URL |
|------|-----|
| Reply to player messages | `https://juwa2.com/dashboard` → Inbox |
| View customer profile | Dashboard thread view |
| Send images | Built into inbox |
| Canned replies | Dashboard settings |

When staff reply, players see messages in realtime in the in-app popup (WebView or native).

---

## 16. Security rules

| Rule | Detail |
|------|--------|
| Service role key | **Server only.** Never in mobile app. |
| Anon key | Safe for mobile client (RLS enforced). |
| Password sync | Same password in game and Relay; hash via Supabase Auth only. |
| HTTPS | All API and WebView traffic over TLS. |
| SSO tokens | Short-lived (≤ 60s), single-use, signed. |
| Rate limiting | Register API is rate-limited; use backend-to-backend calls. |

---

## 17. Testing checklist

### Account sync

- [ ] New Juwa signup creates Relay account
- [ ] Same email + password works on `https://juwa2.com/login`
- [ ] `profiles` row exists with `role = customer`
- [ ] Player auto-follows `juwa2` business
- [ ] Welcome message appears in chat

### Legacy users

- [ ] Existing player (no Relay account) → first headset tap creates account
- [ ] Existing player (already has Relay account) → chat opens without duplicate

### In-app chat

- [ ] Headset icon opens popup (not Facebook)
- [ ] Chat opens without second login (after SSO)
- [ ] Player can send text message
- [ ] Staff sees message in dashboard inbox
- [ ] Staff reply appears in player popup in realtime
- [ ] Player can close popup and return to lobby
- [ ] Image upload works (if supported in v1)

### Signup screen

- [ ] "Contact Customer Support" visible below download button
- [ ] Link/popup works for new and existing users

### Deposit / withdrawal context

- [ ] Open chat from ATM area (if context param implemented)
- [ ] Staff can identify issue type

---

## 18. Rollout plan

| Phase | Tasks | Owner |
|-------|-------|-------|
| **1. Handoff** | Share credentials, repo, this document | Relay team |
| **2. Agreement** | Legacy user strategy, WebView vs native, SSO | Both teams |
| **3. Account sync** | Register API or admin provisioning on game backend | Game backend |
| **4. SSO** | Build `/api/auth/sso` on Relay; token minting on game server | Both teams |
| **5. Headset icon** | Replace Facebook URL with chat popup WebView | Game mobile |
| **6. Signup link** | Add "Contact Customer Support" below download | Game mobile |
| **7. QA** | Run testing checklist on staging | Both teams |
| **8. Production** | App store release + monitor | Game team |

---

## 19. FAQ

**Q: Is Relay a separate app players must install?**  
A: No. Relay is embedded in the Juwa 2 app (popup) and also available on the web at the support portal URL.

**Q: Do players need a separate support password?**  
A: No. Same credentials as their Juwa 2 account (email + password).

**Q: What happens to the Facebook support link?**  
A: Remove it. Headset icon opens Relay chat instead.

**Q: Can we use only Supabase and skip the Relay website?**  
A: Yes, with native chat (Option B). Staff still use the web dashboard. WebView (Option A) reuses the website chat UI.

**Q: Existing players from the last year?**  
A: Use lazy provisioning (Section 7, Option A) unless bulk migration is agreed.

**Q: Who provides Supabase access?**  
A: Relay platform team provides scoped keys (Section 5). Full dashboard access is optional.

**Q: Is the service role key safe in the mobile app?**  
A: **No.** Never put it in the app. Use it only on the game backend server.

---

## 20. Appendix: credential handoff template

Copy, fill in, and send securely to the game team lead.

---

### JUWA 2 × Relay — Credential Handoff

**Date:** _______________  
**Relay portal URL:** https://juwa2.com  
**Primary business slug:** juwa2  

#### For game BACKEND server only

```
SUPABASE_URL=https://________________.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ_________________________________
```

#### For game MOBILE app (native chat only — skip if using WebView)

```
NEXT_PUBLIC_SUPABASE_URL=https://________________.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ_________________________________
```

#### URLs

```
Support portal:     https://juwa2.com
Login:              https://juwa2.com/login
Chat (deep link):   https://juwa2.com/feed?openChat=1
Health check:       https://juwa2.com/api/health
Register API:       POST https://juwa2.com/api/auth/register
```

#### Repository

```
Git URL / ZIP: ___________________________________
Branch: main
Integration doc: docs/JUWA2_RELAY_IN_APP_INTEGRATION.md
```

#### Contacts

| Role | Name | Email |
|------|------|-------|
| Relay platform lead | | |
| Game backend lead | | |
| Game mobile lead | | |

#### Agreed decisions

- [ ] Legacy users: Lazy / Bulk / Web login  
- [ ] Chat UI: WebView / Native  
- [ ] SSO: Relay builds / Game builds / Shared  
- [ ] Phone field on game signup: Yes / No / Default value  

---

*End of document*
