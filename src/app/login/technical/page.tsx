'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { finalizeSessionAfterSignIn, redirectIfAuthenticated } from '@/lib/authRouting'
import { Juwa2AuthShell } from '@/components/Juwa2AuthShell'
import { AUTH_INPUT, AUTH_LABEL, AUTH_BUTTON, runAuthButtonAction } from '@/lib/authUi'
import { Loader2, Eye, EyeOff, Wrench } from 'lucide-react'

/** Dedicated login for technical support staff (escalations queue only). */
export default function TechnicalLoginPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (cancelled) return
      await redirectIfAuthenticated(supabase, router)
    })()
    return () => {
      cancelled = true
    }
  }, [router, supabase])

  async function onSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (loading) return
    setError('')
    setLoading(true)
    try {
      const identifier = email.trim()
      if (!identifier) throw new Error('Enter your work email or @username.')

      const useStaffId = !identifier.includes('@')

      if (useStaffId) {
        const r = await fetch('/api/auth/staff-sign-in', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ staffId: identifier, password }),
        })
        const j = (await r.json().catch(() => ({}))) as { error?: string }
        if (!r.ok) throw new Error(j.error || 'Sign in failed')
        await supabase.auth.getSession()
      } else {
        const { error: signErr } = await supabase.auth.signInWithPassword({
          email: identifier,
          password,
        })
        if (signErr) throw signErr
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Sign in failed')

      const { data: prof, error: pErr } = await supabase
        .from('profiles')
        .select('role, business_role, account_status, deleted_at')
        .eq('id', user.id)
        .single()

      if (pErr || !prof) {
        await supabase.auth.signOut()
        throw new Error('No profile found for this account.')
      }

      if (prof.deleted_at) {
        await supabase.auth.signOut()
        throw new Error('This account has been removed.')
      }

      if (prof.role !== 'business' || prof.business_role !== 'technical') {
        await supabase.auth.signOut()
        throw new Error('This login is for technical support staff only. Use the main sign-in page for other accounts.')
      }

      await finalizeSessionAfterSignIn(supabase, router)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Juwa2AuthShell activeTab="login" hideTabs>
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-orange-500/25 bg-orange-500/10 px-3 py-2.5">
        <Wrench className="w-5 h-5 text-orange-300 shrink-0" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-orange-100">Technical Support Portal</p>
          <p className="text-[11px] text-orange-200/80">Escalated customer threads only</p>
        </div>
      </div>

      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <div>
          <label className={AUTH_LABEL}>Work email</label>
          <input
            type="text"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tech@yourcompany.com"
            className={AUTH_INPUT}
            required
          />
          <p className="text-[11px] text-[#5c6478] mt-1.5 leading-relaxed">
            Use the email and password your admin set on the Team page. @username also works.
          </p>
        </div>

        <div>
          <label className={AUTH_LABEL}>Password</label>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className={`${AUTH_INPUT} pr-10`}
              required
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b96b8] hover:text-white transition-colors"
              aria-label={showPw ? 'Hide password' : 'Show password'}
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {error ? <p className="text-red-400/90 text-sm">{error}</p> : null}

        <button
          type="button"
          disabled={loading}
          onPointerDown={(e) => runAuthButtonAction(e, () => void onSubmit())}
          className={`w-full py-3 rounded-xl bg-gradient-to-r from-[#f97316] to-[#ea580c] text-white font-semibold hover:opacity-95 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2 mt-1 ${AUTH_BUTTON}`}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Signing in...
            </>
          ) : (
            'Sign in — Technical'
          )}
        </button>

        <p className="text-center text-[11px] text-[#5c6478]">
          Juwa support or admin?{' '}
          <Link href="/login" className="text-[#d4af37] hover:underline">
            Main staff login
          </Link>
        </p>
      </form>
    </Juwa2AuthShell>
  )
}
