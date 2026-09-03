'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signIn, signUp } from '@/lib/auth-client'
import { requestPasswordResetEmail } from '@/app/actions/profile'
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  KeyRound,
  AlertCircle,
  X,
  Check,
  User,
  Loader2,
  Ticket,
  FolderKanban,
  Clock,
  MessagesSquare,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'

interface AuthFormProps {
  mode: 'sign-in' | 'sign-up'
}

/* ────────────────────────────────────────────────────────────────────────
 * SupportHub brand mark — connected-nodes logo used across the portal
 * ──────────────────────────────────────────────────────────────────────── */
function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <circle cx="8" cy="16" r="4" fill="currentColor" />
      <circle cx="24" cy="8" r="4" fill="currentColor" />
      <circle cx="24" cy="24" r="4" className="fill-emerald-500" />
      <path
        d="M11.5 14.5L20.5 9.5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M11.5 17.5L20.5 22.5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

/* ────────────────────────────────────────────────────────────────────────
 * Left-panel illustration — ticket management & team collaboration
 * (theme-aware: adapts to light/dark via Tailwind fill/stroke classes)
 * ──────────────────────────────────────────────────────────────────────── */
function AuthIllustration() {
  return (
    <svg viewBox="0 0 560 420" fill="none" className="w-full h-auto max-h-[270px] max-w-[520px]" aria-hidden="true">
      {/* Main ticket panel */}
      <rect
        x="42"
        y="42"
        width="476"
        height="318"
        rx="24"
        strokeWidth="1.5"
        className="fill-white stroke-slate-200 dark:fill-slate-900 dark:stroke-slate-800"
      />

      {/* Panel header — avatars + title + search pill */}
      <circle className="fill-slate-200 dark:fill-slate-700" cx="78" cy="86" r="15" />
      <circle
        className="fill-slate-300 stroke-white dark:fill-slate-600 dark:stroke-slate-900"
        cx="102"
        cy="86"
        r="15"
        strokeWidth="2.5"
      />
      <circle
        className="fill-emerald-500 stroke-white dark:stroke-slate-900"
        cx="126"
        cy="86"
        r="15"
        strokeWidth="2.5"
      />
      <rect x="154" y="78" width="150" height="11" rx="5.5" className="fill-slate-200 dark:fill-slate-700" />
      <rect x="154" y="95" width="92" height="7" rx="3.5" className="fill-slate-100 dark:fill-slate-800" />
      <rect x="428" y="72" width="66" height="28" rx="14" className="fill-slate-100 dark:fill-slate-800" />
      <circle cx="444" cy="86" r="4" className="fill-slate-400 dark:fill-slate-500" />
      <rect x="454" y="82.5" width="28" height="7" rx="3.5" className="fill-slate-300 dark:fill-slate-600" />

      <line x1="70" y1="122" x2="490" y2="122" strokeWidth="1.5" className="stroke-slate-100 dark:stroke-slate-800" />

      {/* Ticket row 1 — open */}
      <circle className="fill-emerald-500" cx="76" cy="156" r="6" />
      <rect x="96" y="150" width="200" height="10" rx="5" className="fill-slate-200 dark:fill-slate-700" />
      <rect x="96" y="166" width="130" height="7" rx="3.5" className="fill-slate-100 dark:fill-slate-800" />
      <rect x="432" y="144" width="62" height="24" rx="12" className="fill-emerald-500/10" />
      <circle cx="446" cy="156" r="4" className="fill-emerald-500" />
      <rect x="456" y="152.5" width="26" height="7" rx="3.5" className="fill-emerald-500/50" />

      <line x1="70" y1="192" x2="490" y2="192" strokeWidth="1.5" className="stroke-slate-100 dark:stroke-slate-800" />

      {/* Ticket row 2 — in progress */}
      <circle className="fill-slate-400 dark:fill-slate-500" cx="76" cy="210" r="6" />
      <rect x="96" y="204" width="170" height="10" rx="5" className="fill-slate-200 dark:fill-slate-700" />
      <rect x="96" y="220" width="110" height="7" rx="3.5" className="fill-slate-100 dark:fill-slate-800" />
      <rect x="432" y="198" width="62" height="24" rx="12" className="fill-slate-100 dark:fill-slate-800" />
      <circle cx="446" cy="210" r="4" className="fill-slate-400 dark:fill-slate-500" />
      <rect x="456" y="206.5" width="26" height="7" rx="3.5" className="fill-slate-300 dark:fill-slate-700" />

      <line x1="70" y1="246" x2="490" y2="246" strokeWidth="1.5" className="stroke-slate-100 dark:stroke-slate-800" />

      {/* Ticket row 3 — resolved */}
      <circle className="fill-amber-500" cx="76" cy="264" r="6" />
      <rect x="96" y="258" width="190" height="10" rx="5" className="fill-slate-200 dark:fill-slate-700" />
      <rect x="96" y="274" width="120" height="7" rx="3.5" className="fill-slate-100 dark:fill-slate-800" />
      <rect x="432" y="252" width="62" height="24" rx="12" className="fill-amber-500/10" />
      <circle cx="446" cy="264" r="4" className="fill-amber-500" />
      <rect x="456" y="260.5" width="26" height="7" rx="3.5" className="fill-amber-500/50" />

      {/* Bottom — volume chart */}
      <rect x="80" y="290" width="28" height="44" rx="6" className="fill-slate-100 dark:fill-slate-800" />
      <rect x="116" y="270" width="28" height="64" rx="6" className="fill-slate-100 dark:fill-slate-800" />
      <rect x="152" y="282" width="28" height="52" rx="6" className="fill-slate-100 dark:fill-slate-800" />
      <rect x="188" y="258" width="28" height="76" rx="6" className="fill-emerald-500" />
      <rect x="224" y="294" width="28" height="40" rx="6" className="fill-slate-100 dark:fill-slate-800" />
      <rect x="260" y="276" width="28" height="58" rx="6" className="fill-slate-100 dark:fill-slate-800" />
      <line x1="72" y1="334" x2="486" y2="334" strokeWidth="1.5" className="stroke-slate-100 dark:stroke-slate-800" />
      <rect x="420" y="304" width="52" height="7" rx="3.5" className="fill-slate-100 dark:fill-slate-800" />
      <rect x="420" y="316" width="42" height="14" rx="7" className="fill-slate-200 dark:fill-slate-700" />
      <circle cx="478" cy="328" r="4" className="fill-emerald-500" />

      {/* Floating toast — resolved */}
      <rect
        x="352"
        y="18"
        width="168"
        height="54"
        rx="16"
        strokeWidth="1.5"
        className="fill-white stroke-slate-200 dark:fill-slate-800 dark:stroke-slate-700"
      />
      <circle cx="376" cy="45" r="13" className="fill-emerald-500" />
      <path
        d="M370 45l4 4 7.5-8"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <rect x="398" y="38" width="96" height="9" rx="4.5" className="fill-slate-200 dark:fill-slate-700" />
      <rect x="398" y="53" width="64" height="7" rx="3.5" className="fill-slate-100 dark:fill-slate-800" />

      {/* Floating stat card — support hours */}
      <rect
        x="24"
        y="322"
        width="180"
        height="78"
        rx="16"
        strokeWidth="1.5"
        className="fill-white stroke-slate-200 dark:fill-slate-800 dark:stroke-slate-700"
      />
      <rect x="44" y="340" width="60" height="7" rx="3.5" className="fill-slate-100 dark:fill-slate-800" />
      <rect x="44" y="354" width="46" height="14" rx="7" className="fill-slate-200 dark:fill-slate-700" />
      <path
        d="M44 382L64 370 84 376 104 360 124 366 144 350 164 356 184 344"
        className="stroke-emerald-500"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Ambient dots */}
      <circle cx="518" cy="88" r="5" className="fill-emerald-500/40" />
      <circle cx="44" cy="52" r="6" className="fill-emerald-500/30" />
      <circle cx="500" cy="330" r="4" className="fill-slate-300 dark:fill-slate-600" />
    </svg>
  )
}

const FEATURES = [
  { icon: Ticket, label: 'Ticket Status Tracking' },
  { icon: FolderKanban, label: 'Project Tracking' },
  { icon: Clock, label: 'Support Hours Tracking' },
  { icon: MessagesSquare, label: 'Centralized Communication' },
]

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Forgot password modal
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [resetSubmitting, setResetSubmitting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  const isSignIn = mode === 'sign-in'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (isSignIn) {
        const result = await signIn.email({ email, password, rememberMe })
        if (result.error) throw new Error(result.error.message || 'Invalid credentials')
        router.push('/dashboard')
      } else {
        if (!name.trim()) {
          throw new Error('Please enter your full name.')
        }
        const result = await signUp.email({ name, email, password })
        if (result.error) throw new Error(result.error.message || 'Registration failed')
        router.push('/dashboard')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleSendResetLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setResetError(null)
    if (!resetEmail) return
    setResetSubmitting(true)
    try {
      // Server action enforces the strict role policy: only Admin/Project
      // Manager accounts receive a reset email; Client/Developer accounts are
      // silently declined (same generic response as unknown emails, so account
      // existence is never disclosed) and guided toward the Support request
      // flow instead.
      await requestPasswordResetEmail(resetEmail)
      setResetSent(true)
      setTimeout(() => {
        setResetSent(false)
        setIsForgotPasswordOpen(false)
        setResetEmail('')
      }, 3000)
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Could not send reset link. Please try again.')
    } finally {
      setResetSubmitting(false)
    }
  }

  const inputClassName =
    'h-11 pl-10 pr-10 bg-slate-50/70 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 ' +
    'focus-visible:border-emerald-500 focus-visible:ring-emerald-500/25 dark:focus-visible:ring-emerald-500/20'

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row lg:h-screen lg:overflow-hidden font-inter transition-colors bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* ── Mobile brand strip ─────────────────────────────────────────── */}
      <div className="lg:hidden flex items-center px-6 pt-8 pb-2">
        <div className="flex items-center gap-2.5 text-slate-900 dark:text-slate-100">
          <LogoMark className="h-7 w-7" />
          <div>
            <p className="text-lg font-bold tracking-tight leading-none">Support Hero</p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              Enterprise Ticketing Portal
            </p>
            <p className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
              Product by Infinixo Technologies
            </p>
          </div>
        </div>
      </div>

      {/* ── LEFT COLUMN: Branding & illustration ──────────────────────── */}
      <aside className="relative hidden lg:flex lg:w-1/2 flex-col justify-between overflow-hidden p-6 sm:p-8 xl:p-12 bg-gradient-to-br from-white via-slate-50 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        {/* Subtle grid + emerald ambient shapes */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(100,116,139,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(100,116,139,0.06)_1px,transparent_1px)] bg-[size:32px_32px] dark:bg-[linear-gradient(to_right,rgba(148,163,184,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.04)_1px,transparent_1px)]"
        />
        <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-emerald-400/10 blur-3xl" />

        {/* Header */}
        <div className="relative z-10 flex items-center gap-3 animate-fade-in">
          <LogoMark className="h-9 w-9 text-slate-900 dark:text-slate-100" />
          <div>
            <p className="text-xl font-bold tracking-tight text-slate-900 dark:text-white leading-none">
              Support Hero
            </p>
            <p className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              Enterprise Ticketing Portal
            </p>
            <p className="mt-1 text-[9px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
              Product by Infinixo Technologies
            </p>
          </div>
        </div>

        {/* Middle content */}
        <div className="relative z-10 my-auto w-full max-w-lg space-y-4 sm:space-y-5 py-4 animate-fade-in">
          <div className="space-y-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              All-in-one support operations
            </span>
            <h1 className="text-2xl xl:text-3xl font-bold tracking-tight text-slate-900 dark:text-white leading-[1.15]">
              We Manage tickets, projects, support hours, and client communication from one
              centralized platform.
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              One workspace for your entire support operation — from triage to resolution.
            </p>
          </div>

          {/* Feature grid */}
          <ul className="grid grid-cols-2 gap-2.5">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 px-3 py-2.5"
              >
                <Icon className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
              </li>
            ))}
          </ul>

          {/* Illustration */}
          <div className="pt-1 flex justify-center animate-fade-in" style={{ animationDelay: '120ms' }}>
            <AuthIllustration />
          </div>
        </div>

        {/* Footer */}
        <div
          className="relative z-10 flex items-center justify-between text-xs text-slate-400 dark:text-slate-500 animate-fade-in"
          style={{ animationDelay: '200ms' }}
        >
          <span>© 2024 Support Hero</span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            All systems operational
          </span>
        </div>
      </aside>

      {/* ── RIGHT COLUMN: Authentication card ─────────────────────────── */}
      <main className="relative flex flex-1 lg:w-1/2 flex-col items-center justify-center px-4 sm:px-8 py-6 lg:py-10">
        <div className="w-full max-w-md animate-fade-in-up" style={{ animationDelay: '80ms' }}>
          {/* Card */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-12px_rgba(15,23,42,0.12)]">
            {/* Card header */}
            <div className="mb-6">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                <LogoMark className="h-5 w-5" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                {isSignIn ? 'Welcome back' : 'Create Account'}
              </h2>
              <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                {isSignIn
                  ? 'Sign in to your Support Hero account'
                  : 'Set up your enterprise workspace access'}
              </p>
            </div>

            {/* Error message */}
            {error && (
              <div
                role="alert"
                className="mb-6 flex items-start gap-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-sm text-rose-700 dark:text-rose-300"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isSignIn && (
                <div className="space-y-2">
                  <Label htmlFor="name">Full name</Label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <Input
                      id="name"
                      type="text"
                      required
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jane Smith"
                      className={inputClassName}
                    />
                  </div>
                </div>
              )}

              {/* Email field */}
              <div className="space-y-2">
                <Label htmlFor="email">Work email</Label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <Input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    aria-invalid={error ? true : undefined}
                    className={inputClassName}
                  />
                </div>
              </div>

              {/* Password field */}
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    autoComplete={isSignIn ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isSignIn ? 'Enter your password' : 'Min. 8 characters'}
                    aria-invalid={error ? true : undefined}
                    className={`${inputClassName} pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Remember me + forgot password */}
              <div className="flex items-center justify-between pt-0.5">
                <label
                  htmlFor="remember-me"
                  className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 cursor-pointer select-none"
                >
                  <Checkbox
                    id="remember-me"
                    checked={rememberMe}
                    onCheckedChange={(v) => setRememberMe(v === true)}
                    className="data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                  />
                  Remember me
                </label>
                {isSignIn && (
                  <button
                    type="button"
                    onClick={() => setIsForgotPasswordOpen(true)}
                    className="text-sm font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors cursor-pointer"
                  >
                    Forgot password?
                  </button>
                )}
              </div>

              {/* Primary submit button */}
              <Button type="submit" disabled={loading} className="h-11 w-full text-sm">
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    <span>{isSignIn ? 'Signing in...' : 'Creating account...'}</span>
                  </>
                ) : (
                  <>
                    <span>{isSignIn ? 'Sign in' : 'Create account'}</span>
                    <ArrowRight className="size-4" />
                  </>
                )}
              </Button>
            </form>

            {/* Bottom switch link — only shown on the sign-up page. The login
                page intentionally does not offer sign-up; /sign-up remains a
                working route for invited users. */}
            {!isSignIn && (
              <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
                Already have an account?{' '}
                <Link
                  href="/sign-in"
                  className="font-semibold text-slate-900 dark:text-slate-100 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer"
                >
                  Sign in
                </Link>
              </div>
            )}
          </div>

          {/* Footer links */}
          <div className="mt-6 flex items-center justify-center gap-6 text-xs text-slate-400 dark:text-slate-500">
            <button type="button" className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-pointer">
              Privacy Policy
            </button>
            <button type="button" className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-pointer">
              Terms of Service
            </button>
          </div>
        </div>
      </main>

      {/* ── Forgot Password Modal ─────────────────────────────────────── */}
      {isForgotPasswordOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-password-title"
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-2xl animate-scale-in"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3
                id="reset-password-title"
                className="font-bold text-sm flex items-center gap-2 text-slate-900 dark:text-slate-100"
              >
                <KeyRound className="size-4 text-emerald-600 dark:text-emerald-400" />
                Reset Password
              </h3>
              <button
                onClick={() => setIsForgotPasswordOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {resetSent ? (
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-sm text-center space-y-2">
                <Check size={20} className="mx-auto text-emerald-600 dark:text-emerald-400" />
                <p className="font-bold">Request received</p>
                <p className="text-xs font-normal text-slate-500 dark:text-slate-400">
                  If this email is registered to an eligible account, a password reset link is on
                  its way. If you don&apos;t receive an email, please contact our Support team to
                  reset your password.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSendResetLink} className="space-y-4 text-sm">
                {resetError && (
                  <div
                    role="alert"
                    className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-medium flex items-center gap-2"
                  >
                    <AlertCircle size={14} />
                    <span>{resetError}</span>
                  </div>
                )}
                <p className="text-slate-500 dark:text-slate-400 text-sm">
                  Enter your registered work email address and we&apos;ll send you a password reset
                  link.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Work email</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="name@company.com"
                    className={inputClassName}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsForgotPasswordOpen(false)}
                    disabled={resetSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={resetSubmitting || !resetEmail}>
                    {resetSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
                    {resetSubmitting ? 'Sending...' : 'Send Reset Link'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
