# JUWA2 Support

> Player support portal and business partner platform — announcements, messaging, and staff dashboard.

---

## Tech Stack

| Layer | Tool |
|-------|------|
| Frontend | Next.js 15 (App Router, TypeScript) |
| Styling | Tailwind CSS |
| Backend / DB | Supabase (Postgres + Auth + Realtime) |
| Email / OTP | Resend (optional) |
| Deployment | Vercel |

---

## Architecture

### Domain split

| Domain | Purpose |
|--------|---------|
| `juwa2support.com` | Player login, signup, feed, staff dashboard |
| `slug.partners.juwa2support.com` | Public business partner pages |

The `src/middleware.ts` file routes support traffic vs partner subdomains and rewrites partner hosts to `/business/[slug]/...`.

### User roles

| Role | Sub-role | Can do |
|------|----------|--------|
| Customer | — | Browse feed, react, comment, message support |
| Business | Admin (1 per biz) | Post announcements, manage team, reply to messages |
| Business | Support | Reply to customer messages |

---

## Setup

See `supabase/00_START_HERE.sql` for database bootstrap order.

```bash
npm install
cp .env.local.example .env.local
# Fill in Supabase keys and domains, then:
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Environment

Key variables (see `.env.local.example`):

```env
NEXT_PUBLIC_SUPPORT_DOMAIN=juwa2support.com
NEXT_PUBLIC_ROOT_DOMAIN=partners.juwa2support.com
NEXT_PUBLIC_PRIMARY_SUPPORT_BUSINESS_SLUG=juwa2
RESEND_FROM_EMAIL=noreply@juwa2support.com
```

---

## Database

Run scripts in order for a fresh project:

1. `supabase/1_reset.sql` (optional — wipes data)
2. `supabase/2_bootstrap.sql`
3. `supabase/3_extras.sql`
4. Create admin in Supabase Auth, then `supabase/4_create_admin.sql`

Full reference schema: `supabase/schema.sql`
