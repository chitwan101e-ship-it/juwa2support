'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Juwa2AuthShell } from '@/components/Juwa2AuthShell'
import { AUTH_INPUT, AUTH_LABEL, AUTH_BUTTON, keepAuthButtonClick } from '@/lib/authUi'
import { TURNSTILE_LOAD_ERROR } from '@/lib/userFacingErrors'
import { Loader2, Eye, EyeOff, ArrowLeft } from 'lucide-react'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { showTurnstileWidget, turnstileSiteKey } from '@/lib/turnstileConfig'

function ResetPasswordInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const showTurnstile = showTurnstileWidget

  const [step, setStep] = useState<1 | 2>(1)
  const [identifier, setIdentifier] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileScriptReady, setTurnstileScriptReady] = useState(false)
  const turnstileRef = useRef<TurnstileInstance>(null)

  useEffect(() => {
    const pre = searchParams.get('i')?.trim()
    if (pre) setIdentifier(pre)
  }, [searchParams])

  useEffect(() => {
    if (!showTurnstile) return
    const timer = window.setTimeout(() => {
      const loaded = Boolean((window as Window & { turnstile?: unknown }).turnstile)
      if (!loaded && !turnstileScriptReady) {
        setError(TURNSTILE_LOAD_ERROR)
      }
    }, 4000)
    return () => window.clearTimeout(timer)
  }, [showTurnstile, turnstileScriptReady])

  const sendCode = useCallback(async () => {
    if (loading) return
    const id = identifier.trim()
    if (!id) {
      setError('Enter your email or @username.')
      return
    }
    if (showTurnstile && !turnstileToken) {
      setError('Complete the security check.')
      return
    }
    setLoading(true)
    setError('')
    setInfo('')
    try {
      const res = await fetch('/api/auth/password-reset/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: id,
          turnstileToken: showTurnstile ? turnstileToken ?? undefined : undefined,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error || 'Could not send code.')
      setInfo('If an account exists, we sent a 6-digit code to your email.')
      setStep(2)
      turnstileRef.current?.reset()
      setTurnstileToken(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not send code.')
      turnstileRef.current?.reset()
      setTurnstileToken(null)
    } finally {
      setLoading(false)
    }
  }, [identifier, showTurnstile, turnstileToken, loading])

  async function submitNewPassword(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setError('')
    if (password.length < 8) {
      setError('Use at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (!/^\d{6}$/.test(otp.trim())) {
      setError('Enter the 6-digit code from your email.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/password-reset/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: identifier.trim(),
          otp: otp.trim(),
          newPassword: password,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error || 'Could not reset password.')
      router.replace('/login?reset=ok')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not reset password.')
    } finally {
      setLoading(false)
    }
  }

  const back = () => {
    setStep(1)
    setError('')
    setOtp('')
    setPassword('')
    setConfirm('')
  }

  return (
    <Juwa2AuthShell hideTabs showBadge={false}>
      <div className="mb-5 text-center">
        <h1 className="text-base font-semibold text-white">Reset password</h1>
        <p className="text-[#8b96b8] text-sm mt-1">
          {step === 1 ? 'We&apos;ll email you a one-time code.' : 'Enter the code and choose a new password.'}
        </p>
      </div>

      {step === 2 ? (
        <button
          type="button"
          onClick={back}
          className="flex items-center gap-1 text-sm text-[#d4af37] hover:opacity-70 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      ) : null}

      {step === 1 ? (
        <div className="space-y-4">
          <div>
            <label className={AUTH_LABEL}>Email or username</label>
            <input
              type="text"
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="you@email.com"
              className={AUTH_INPUT}
            />
          </div>

          {showTurnstile ? (
            <div className="flex flex-col items-center gap-2">
              <Turnstile
                ref={turnstileRef}
                siteKey={turnstileSiteKey}
                onSuccess={(t) => {
                  setTurnstileToken(t)
                  setError('')
                }}
                onExpire={() => setTurnstileToken(null)}
                onWidgetLoad={() => setTurnstileScriptReady(true)}
              />
            </div>
          ) : null}

          {error ? <p className="text-red-400 text-sm">{error}</p> : null}

          <button
            type="button"
            onPointerDown={keepAuthButtonClick}
            onClick={() => void sendCode()}
            disabled={loading}
            className={`w-full py-3 rounded-xl juwa2-btn font-semibold hover:opacity-95 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2 ${AUTH_BUTTON}`}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending…
              </>
            ) : (
              'Send code'
            )}
          </button>
        </div>
      ) : (
        <form onSubmit={(e) => void submitNewPassword(e)} className="space-y-4">
          <div>
            <label className={AUTH_LABEL}>6-digit code</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className={AUTH_INPUT}
              required
            />
          </div>
          <div>
            <label className={AUTH_LABEL}>New password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${AUTH_INPUT} pr-10`}
                autoComplete="new-password"
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b96b8] hover:text-white"
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className={AUTH_LABEL}>Confirm password</label>
            <input
              type={showPw ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={AUTH_INPUT}
              autoComplete="new-password"
              required
              minLength={8}
            />
          </div>
          {error ? <p className="text-red-400 text-sm">{error}</p> : null}
          {info ? <p className="text-emerald-400/90 text-sm">{info}</p> : null}
          <button
            type="submit"
            disabled={loading}
            onPointerDown={keepAuthButtonClick}
            className={`w-full py-3 rounded-xl juwa2-btn font-semibold hover:opacity-95 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2 ${AUTH_BUTTON}`}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Updating…
              </>
            ) : (
              'Update password'
            )}
          </button>
        </form>
      )}

      <p className="text-center mt-6 text-sm text-[#8b96b8]">
        <Link href="/login" className="text-[#d4af37] hover:underline">
          Back to sign in
        </Link>
      </p>
    </Juwa2AuthShell>
  )
}

export default function ResetPasswordPage() {
  const fallback = useMemo(
    () => (
      <div className="min-h-screen bg-[#050508] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#d4af37] animate-spin" />
      </div>
    ),
    []
  )

  return (
    <Suspense fallback={fallback}>
      <ResetPasswordInner />
    </Suspense>
  )
}
