import Link from 'next/link'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { resolveAuthenticatedPath } from '@/lib/authRouting'
import { getSiteHostKind, getSupportSiteUrl, normalizeHost } from '@/lib/siteHost'
import Juwa2Logo from '@/components/Juwa2Logo'
import { JUWA2_COPY } from '@/lib/juwa2Theme'

export default async function HomePage() {
  const host = normalizeHost((await headers()).get('host') || 'localhost')
  const kind = getSiteHostKind(host)

  if (kind === 'platform-root') {
    redirect(getSupportSiteUrl())
  }

  const supabase = await createClient()
  const authedPath = await resolveAuthenticatedPath(supabase)
  if (authedPath && authedPath !== '/login') {
    redirect(authedPath)
  }

  return (
    <div className="min-h-screen bg-[#050508] flex flex-col">
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-[420px] rounded-3xl border border-white/[0.07] bg-[#0a0a0c] shadow-[0_24px_80px_-32px_rgba(0,0,0,0.85)] px-8 py-8 text-center">
          <Juwa2Logo size="lg" className="mx-auto mb-4" />
          <p className="text-[#8b96b8] text-sm leading-snug">{JUWA2_COPY.authSubtitle}</p>

          <div className="inline-flex items-center gap-2 mt-4 px-3.5 py-1.5 rounded-full bg-[#2c220f] border border-[#f6b332]/25 text-[#f6b332] text-xs font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f6b332]" aria-hidden />
            {JUWA2_COPY.approvalBadge}
          </div>

          <div className="mt-8 flex flex-col gap-2.5">
            <Link href="/login" className="w-full py-3 rounded-xl juwa2-btn text-sm font-semibold text-center">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="w-full py-3 rounded-xl border border-white/10 text-[#8b96b8] text-sm font-semibold hover:text-white hover:border-white/20 transition-colors text-center"
            >
              Create account
            </Link>
          </div>

          <p className="mt-6 text-[11px] text-[#5c6478] leading-relaxed">{JUWA2_COPY.productTagline}</p>
          <p className="mt-3 text-[10px] text-[#3d4558] font-mono">Deploy: DEPLOY-CHECK-2026-06-08-v5</p>
        </div>
      </main>
    </div>
  )
}
