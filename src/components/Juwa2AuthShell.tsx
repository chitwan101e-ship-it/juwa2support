import Link from 'next/link'
import clsx from 'clsx'
import Juwa2Logo from '@/components/Juwa2Logo'
import { JUWA2_COPY } from '@/lib/juwa2Theme'

type AuthTab = 'login' | 'signup'

type Juwa2AuthShellProps = {
  activeTab?: AuthTab
  children: React.ReactNode
  /** Wider card for signup steps */
  wide?: boolean
  /** Hide sign-in / create-account switcher (e.g. reset password) */
  hideTabs?: boolean
  /** Show staff-approval pill under tagline */
  showBadge?: boolean
}

export function Juwa2AuthShell({
  activeTab = 'login',
  children,
  wide,
  hideTabs,
  showBadge = true,
}: Juwa2AuthShellProps) {
  return (
    <div className="min-h-screen bg-[#050508] flex flex-col">
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div
          className={clsx(
            'w-full rounded-3xl border border-white/[0.07] bg-[#0a0a0c] shadow-[0_24px_80px_-32px_rgba(0,0,0,0.85)]',
            wide ? 'max-w-lg px-8 py-8' : 'max-w-[420px] px-8 py-8'
          )}
        >
          <header className="text-center mb-7">
            <Juwa2Logo size="lg" className="mx-auto mb-4" />
            <p className="text-[#8b96b8] text-sm leading-snug max-w-[280px] mx-auto">{JUWA2_COPY.authSubtitle}</p>

            {showBadge ? (
              <div className="inline-flex items-center gap-2 mt-4 px-3.5 py-1.5 rounded-full bg-[#2c220f] border border-[#f6b332]/25 text-[#f6b332] text-xs font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#f6b332]" aria-hidden />
                {JUWA2_COPY.approvalBadge}
              </div>
            ) : null}

            {!hideTabs ? (
              <div className="mt-5 rounded-2xl border border-white/10 bg-[#111111] p-1 flex text-sm font-semibold">
              {activeTab === 'login' ? (
                <span className="flex-1 text-center py-2.5 text-[#0a0a0a] rounded-xl juwa2-btn">Sign In</span>
              ) : (
                <Link
                  href="/login"
                  className="flex-1 text-center py-2.5 text-[#8b96b8] rounded-xl hover:text-white transition-colors"
                >
                  Sign In
                </Link>
              )}
              {activeTab === 'signup' ? (
                <span className="flex-1 text-center py-2.5 text-[#0a0a0a] rounded-xl juwa2-btn">Create Account</span>
              ) : (
                <Link
                  href="/signup"
                  className="flex-1 text-center py-2.5 text-[#8b96b8] rounded-xl hover:text-white transition-colors"
                >
                  Create Account
                </Link>
              )}
            </div>
            ) : null}
          </header>

          {children}

          <p className="mt-6 text-center text-[10px] text-[#3d4558] font-mono">Deploy: DEPLOY-CHECK-2026-06-08-v5</p>
        </div>
      </main>
    </div>
  )
}
