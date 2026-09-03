'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { validatePasswordResetToken } from '@/app/actions/profile'
import {
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  ArrowLeft,
  Loader2,
} from 'lucide-react'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  // Strict role policy: the token is validated server-side and only Admin /
  // Project Manager accounts may set a password here. Client/Developer tokens
  // (including stale ones issued before the policy) are rejected.
  const [tokenStatus, setTokenStatus] = useState<'checking' | 'valid' | 'invalid' | 'expired' | 'role'>('checking')

  useEffect(() => {
    let cancelled = false
    if (!token) {
      setTokenStatus('invalid')
      return () => { cancelled = true }
    }
    validatePasswordResetToken(token)
      .then((res) => {
        if (cancelled) return
        setTokenStatus(res.valid ? 'valid' : (res.reason as 'invalid' | 'expired' | 'role'))
      })
      .catch(() => {
        if (!cancelled) setTokenStatus('invalid')
      })
    return () => { cancelled = true }
  }, [token])

  const blockedReason =
    tokenStatus === 'invalid' || tokenStatus === 'expired'
      ? 'This password reset link is invalid or has expired. Please request a new one.'
      : tokenStatus === 'role'
        ? 'Password resets for your role are handled by our Support team.'
        : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!token || tokenStatus !== 'valid') {
      setError('This password reset link is invalid or has expired. Please request a new one.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      const result = await authClient.resetPassword({ newPassword: password, token })
      if (result.error) {
        throw new Error(result.error.message || 'Could not reset your password')
      }
      setSuccess(true)
      setTimeout(() => router.push('/sign-in'), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset your password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row font-sans transition-colors bg-[#F9FAFB] dark:bg-slate-950 text-slate-900">
      {/* LEFT COLUMN: Black Enterprise Showcase */}
      <div className="lg:w-1/2 bg-black p-8 sm:p-12 lg:p-16 flex flex-col justify-between relative overflow-hidden text-white min-h-[320px] lg:min-h-screen">
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center text-white">
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="8" cy="16" r="4" fill="white" />
                <circle cx="24" cy="8" r="4" fill="white" />
                <circle cx="24" cy="24" r="4" fill="white" />
                <path d="M11.5 14.5L20.5 9.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M11.5 17.5L20.5 22.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
            <span className="text-2xl font-extrabold tracking-tight text-white font-sans">Support Hero</span>
          </div>
        </div>

        <div className="my-auto py-10 relative z-10 max-w-lg space-y-6">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-[1.15]">
            Secure. Reliable. Enterprise-grade.
          </h1>
          <p className="text-sm sm:text-base text-slate-400 leading-relaxed font-normal">
            Reset your account password to regain access to your enterprise management console.
          </p>
        </div>

        <div className="relative z-10 font-mono text-xs text-slate-500">
          © 2024 Support Hero. Global technical infrastructure.
        </div>
      </div>

      {/* RIGHT COLUMN: Reset Card */}
      <div className="lg:w-1/2 p-6 sm:p-12 lg:p-16 flex flex-col justify-center items-center relative min-h-[480px]">
        <div className="w-full max-w-md my-auto space-y-6">
          <div className="rounded-2xl p-8 sm:p-10 border transition-all shadow-sm bg-white border-slate-200/90 dark:bg-slate-900 dark:border-slate-800">
            <div className="space-y-1.5 mb-8">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <KeyRound size={20} className="text-slate-500" />
                Reset Password
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Choose a new password for your account
              </p>
            </div>

            {error && (
              <div className="mb-6 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 text-xs font-mono font-bold flex items-center gap-2">
                <AlertCircle size={15} />
                <span>{error}</span>
              </div>
            )}

            {tokenStatus === 'checking' ? (
              <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-500 dark:text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verifying your reset link...</span>
              </div>
            ) : blockedReason ? (
              <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold">
                  <AlertCircle size={15} />
                  <span>{blockedReason}</span>
                </div>
                <p className="font-normal text-slate-500 dark:text-slate-400">
                  You can contact Support to have a new password set for your account.
                </p>
              </div>
            ) : success ? (
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs text-center space-y-2">
                <Check size={20} className="mx-auto text-emerald-600 dark:text-emerald-400" />
                <p className="font-bold">Password reset successfully!</p>
                <p className="text-xs font-normal text-slate-500 dark:text-slate-400">
                  Redirecting you to sign in...
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5 font-mono">
                <div className="space-y-2">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    NEW PASSWORD
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      className="w-full px-4 py-3 rounded-xl border text-xs outline-none transition-all pr-10 bg-slate-100/70 border-transparent text-slate-900 placeholder-slate-400 focus:bg-white focus:border-slate-400 focus:ring-1 focus:ring-slate-400 dark:bg-slate-800/70 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-slate-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Lock size={16} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    CONFIRM PASSWORD
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Re-enter your password"
                      className="w-full px-4 py-3 rounded-xl border text-xs outline-none transition-all pr-10 bg-slate-100/70 border-transparent text-slate-900 placeholder-slate-400 focus:bg-white focus:border-slate-400 focus:ring-1 focus:ring-slate-400 dark:bg-slate-800/70 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-slate-500"
                    />
                    <Lock size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !token || tokenStatus !== 'valid'}
                  className="w-full py-3.5 rounded-xl bg-slate-950 hover:bg-slate-800 active:bg-slate-900 disabled:bg-slate-300 disabled:text-slate-500 dark:bg-slate-100 dark:hover:bg-slate-200 dark:disabled:bg-slate-800 dark:disabled:text-slate-500 text-white dark:text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer active:scale-95 shadow-xs mt-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Updating password...</span>
                    </>
                  ) : (
                    <>
                      <span>Update Password</span>
                    </>
                  )}
                </button>
              </form>
            )}

            <div className="mt-8 text-center text-xs text-slate-500 dark:text-slate-400 font-sans">
              <Link href="/sign-in" className="font-bold text-slate-900 dark:text-slate-100 hover:underline cursor-pointer inline-flex items-center gap-1">
                <ArrowLeft size={13} />
                Back to Sign In
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F9FAFB] dark:bg-slate-950 flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-slate-300 dark:border-slate-700 border-t-slate-900 rounded-full animate-spin" />
    </div>}>
      <ResetPasswordForm />
    </Suspense>
  )
}
