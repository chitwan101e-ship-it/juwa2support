'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { finalizeSessionAfterSignIn, redirectIfAuthenticated } from '@/lib/authRouting'
import { Juwa2AuthShell } from '@/components/Juwa2AuthShell'
import { AUTH_INPUT, AUTH_LABEL, AUTH_BUTTON, runAuthButtonAction } from '@/lib/authUi'
import { Loader2, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const q = new URLSearchParams(window.location.search)
    const err = q.get('error')
    if (err) setError(decodeURIComponent(err))
    if (q.get('reset') === 'ok') setInfo('Password updated. Sign in with your new password.')
    if (q.get('registered') === '1') setInfo('Account created. Sign in to get started.')
  }, [])

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
      if (!identifier) {
        throw new Error('Enter your email or @username.')
      }

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

      await finalizeSessionAfterSignIn(supabase, router)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Juwa2AuthShell activeTab="login">
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <div>
          <label className={AUTH_LABEL}>Email</label>
          <input
            type="text"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className={AUTH_INPUT}
            required
          />
          <p className="text-[11px] text-[#5c6478] mt-1.5 leading-relaxed">
            Sign in with email and password. Staff can use @username instead.
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
        {info ? <p className="text-emerald-400/90 text-sm">{info}</p> : null}

        <div className="flex justify-end pt-0.5">
          <Link
            href={email.trim() ? `/reset-password?i=${encodeURIComponent(email.trim())}` : '/reset-password'}
            className="text-sm text-[#d4af37] hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <button
          type="button"
          disabled={loading}
          onPointerDown={(e) => runAuthButtonAction(e, () => void onSubmit())}
          className={`w-full py-3 rounded-xl juwa2-btn hover:opacity-95 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2 mt-1 ${AUTH_BUTTON}`}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Signing in...
            </>
          ) : (
            'Sign In'
          )}
        </button>
      </form>
    </Juwa2AuthShell>
  )
}
