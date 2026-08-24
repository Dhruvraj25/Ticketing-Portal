'use client'

import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  updateProfile,
  updateProfileImage,
  removeProfileImage,
  changePassword,
  requestPasswordReset,
} from '@/app/actions/profile'
import { USER_ROLE_CONFIG, VALIDATION } from '@/lib/types'
import { format } from 'date-fns'
import {
  User,
  Mail,
  Calendar,
  Camera,
  CheckCircle2,
  Loader2,
  Save,
  AlertCircle,
  Moon,
  Sun,
  Bell,
  Trash2,
  Upload,
  Sparkles,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
} from 'lucide-react'
import { RestartTourButton } from '@/components/tour/restart-tour-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { PhoneInput } from '@/components/ui/phone-input'
import { useTheme } from '@/components/theme-provider'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

interface UserData {
  id: string
  name: string
  email: string
  role: string
  createdAt: Date
  avatarUrl?: string | null
  phone?: string | null
  countryCode?: string | null
  timezone?: string | null
  about?: string | null
  language?: string | null
  timeFormat?: string | null
  dateFormat?: string | null
  emailNotificationsEnabled?: boolean | null
}

interface ProfileClientProps {
  user: UserData
}

const TIMEZONES: { value: string; label: string }[] = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Toronto', label: 'Toronto (ET)' },
  { value: 'America/Sao_Paulo', label: 'São Paulo (BRT)' },
  { value: 'Europe/London', label: 'London (GMT)' },
  { value: 'Europe/Paris', label: 'Paris (CET)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET)' },
  { value: 'Europe/Madrid', label: 'Madrid (CET)' },
  { value: 'Europe/Amsterdam', label: 'Amsterdam (CET)' },
  { value: 'Europe/Stockholm', label: 'Stockholm (CET)' },
  { value: 'Africa/Cairo', label: 'Cairo (EET)' },
  { value: 'Africa/Johannesburg', label: 'Johannesburg (SAST)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Asia/Karachi', label: 'Karachi (PKT)' },
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Asia/Dhaka', label: 'Dhaka (BST)' },
  { value: 'Asia/Bangkok', label: 'Bangkok (ICT)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong (HKT)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Seoul', label: 'Seoul (KST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
  { value: 'Pacific/Auckland', label: 'Auckland (NZST)' },
]

export function ProfileClient({ user }: ProfileClientProps) {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const roleConfig = USER_ROLE_CONFIG[user.role as keyof typeof USER_ROLE_CONFIG] || { label: user.role, color: 'bg-muted text-muted-foreground' }
  const [activeTab, setActiveTab] = useState<'personal' | 'preferences' | 'security'>('personal')

  // Personal Info
  const [fullName, setFullName] = useState(user.name)
  const [email] = useState(user.email)
  // Note: country/timezone defaults are fixed constants (not browser-derived)
  // so the server and client render the exact same markup on first load.
  const [about, setAbout] = useState(user.about ?? '')
  const [phone, setPhone] = useState(user.phone ?? '')
  const [countryCode, setCountryCode] = useState(user.countryCode ?? 'US')
  const [timezone, setTimezone] = useState(user.timezone ?? 'UTC')
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Profile Image
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatarUrl ?? null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Preferences
  const [language, setLanguage] = useState(user.language ?? 'en')
  const [timeFormat, setTimeFormat] = useState<'12h' | '24h'>((user.timeFormat as '12h' | '24h') || '12h')
  const [dateFormat, setDateFormat] = useState(user.dateFormat ?? 'MM/dd/yyyy')
  const [emailNotifications, setEmailNotifications] = useState(user.emailNotificationsEnabled ?? true)

  // Change Password
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState<'current' | 'new' | 'confirm' | null>(null)
  const [passwordError, setPasswordError] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  // Password Reset Request (roles that cannot change their password directly)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [resetSubmitting, setResetSubmitting] = useState(false)
  const [resetStatus, setResetStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const themePref = theme ?? 'light'
  // Strict role policy: only Admin and Project Manager can change passwords
  // directly. Client / Developer use the Support reset request flow instead.
  const canChangePasswordDirectly = user.role === 'admin' || user.role === 'project_manager'

  // Make sure the saved timezone is always present in the selector list.
  const timezoneOptions = TIMEZONES.some((t) => t.value === timezone)
    ? TIMEZONES
    : [...TIMEZONES, { value: timezone, label: timezone }]

  const handleSave = async () => {
    setSaving(true)
    setSaveSuccess(false)
    setSaveError('')
    try {
      await updateProfile({
        name: fullName,
        phone,
        countryCode,
        timezone,
        about,
        language,
        timeFormat,
        dateFormat,
        emailNotificationsEnabled: emailNotifications,
      })
      setSaveSuccess(true)
      toast.success('Changes saved successfully')
      setTimeout(() => setSaveSuccess(false), 2000)
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save'
      setSaveError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setAvatarError('Only PNG, JPG, JPEG, and WebP images are supported')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Image must be less than 5MB')
      return
    }

    setUploadingAvatar(true)
    setAvatarError('')

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error ?? 'Upload failed')
      }

      await updateProfileImage(data.url, data.publicId)
      setAvatarUrl(data.url)
      router.refresh()
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploadingAvatar(false)
    }

    e.target.value = ''
  }

  const handleRemoveAvatar = async () => {
    setUploadingAvatar(true)
    setAvatarError('')
    try {
      await removeProfileImage()
      setAvatarUrl(null)
      router.refresh()
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Failed to remove image')
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleRequestReset = async () => {
    setResetSubmitting(true)
    setResetStatus(null)
    try {
      const res = await requestPasswordReset()
      setResetDialogOpen(false)
      toast.success('Password reset request sent to Support successfully.')
      setResetStatus({
        type: 'success',
        text: `Request sent successfully. Reference: ${res.reference}`,
      })
    } catch (err) {
      setResetDialogOpen(false)
      const msg = err instanceof Error ? err.message : 'Failed to send the request.'
      toast.error(msg)
      setResetStatus({ type: 'error', text: msg })
    } finally {
      setResetSubmitting(false)
    }
  }

  const handleChangePassword = async () => {
    setPasswordError('')
    if (!currentPassword) {
      setPasswordError('Current password is required.')
      return
    }
    if (!newPassword || newPassword.length < 12) {
      setPasswordError('New password must be at least 12 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.')
      return
    }
    setChangingPassword(true)
    try {
      await changePassword({ currentPassword, newPassword })
      toast.success('Password changed successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to change password'
      setPasswordError(msg)
      toast.error(msg)
    } finally {
      setChangingPassword(false)
    }
  }

  const passwordInput = (
    key: 'current' | 'new' | 'confirm',
    id: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
  ) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={showPassword === key ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={key === 'current' ? 'current-password' : 'new-password'}
          className="h-10 rounded-lg bg-muted/20 border-border/50 pr-10"
        />
        <button
          type="button"
          onClick={() => setShowPassword(showPassword === key ? null : key)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={showPassword === key ? 'Hide password' : 'Show password'}
        >
          {showPassword === key ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )

  const tabs = [
    { id: 'personal' as const, label: 'Personal Information', icon: User },
    { id: 'preferences' as const, label: 'Preferences', icon: Moon },
    { id: 'security' as const, label: 'Security', icon: Lock },
  ]

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Profile Header Card */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        data-tour="profile-card"
        className="bg-white dark:bg-slate-900 border border-border rounded-xl card-shadow overflow-hidden"
      >
        <div className="px-6 py-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            {/* Left Side: Avatar, Name, Role, Email */}
            <div className="flex items-center gap-4 flex-1 min-w-0">
              {/* Profile Avatar */}
              <div className="relative group shrink-0">
                <div className="h-16 w-16 rounded-2xl bg-slate-900 dark:bg-emerald-500 flex items-center justify-center overflow-hidden border-2 border-white shadow-md relative">
                  {avatarUrl ? (
                    <Image src={avatarUrl} alt={user.name} fill className="object-cover" />
                  ) : (
                    <span className="text-xl font-bold text-white">
                      {user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-white dark:bg-slate-900 border border-border shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent"
                  aria-label="Change profile picture"
                >
                  <Camera className="h-3 w-3 text-muted-foreground" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleAvatarUpload}
                />
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg font-semibold text-foreground truncate">{user.name}</h1>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleConfig.color}`}>
                    {roleConfig.label}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{user.email}</span>
                </p>
              </div>
            </div>

            {/* Right Side: Member Since, Status */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
              <div className="flex items-center gap-1.5 bg-muted/30 px-3 py-1.5 rounded-lg border border-border/50">
                <Calendar className="h-3 w-3" />
                <span>Member since {format(new Date(user.createdAt), 'MMM yyyy')}</span>
              </div>
              <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-500/30">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="font-medium">Active</span>
              </div>
            </div>
          </div>

          {/* Avatar actions */}
          {(avatarUrl || uploadingAvatar) && (
            <div className="flex items-center gap-2 mt-3 ml-[72px]">
              {uploadingAvatar ? (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Uploading...
                </div>
              ) : (
                <>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Upload className="h-3 w-3" />
                    Change
                  </button>
                  <span className="text-muted-foreground/40">|</span>
                  <button
                    onClick={handleRemoveAvatar}
                    className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                    Remove
                  </button>
                </>
              )}
            </div>
          )}

          {avatarError && (
            <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-1.5 mt-3 ml-[72px]">
              <AlertCircle className="h-3 w-3 shrink-0" />
              {avatarError}
            </div>
          )}
        </div>
      </motion.div>

      {/* Tabs */}
      <div data-tour="profile-tabs" className="flex items-center gap-1 bg-muted/30 border border-border/50 rounded-lg p-1">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-tour={`profile-tab-${tab.id}`}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all flex-1 justify-center',
                activeTab === tab.id
                  ? 'bg-white dark:bg-slate-900 text-foreground shadow-sm border border-border/50'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/50 dark:hover:bg-slate-800/50'
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === 'personal' && (
          <motion.div
            key="personal"
            data-tour="profile-personal-info"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="bg-white dark:bg-slate-900 border border-border rounded-xl card-shadow"
          >
            <div className="p-6 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">Personal Information</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Update your personal details</p>
            </div>
            <div className="p-6 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="about">About</Label>
                <Textarea
                  id="about"
                  value={about}
                  onChange={(e) => setAbout(e.target.value)}
                  placeholder="Tell us a little about yourself..."
                  rows={3}
                  maxLength={2048}
                  className="rounded-lg bg-muted/20 border-border/50 resize-none"
                />
                <p className="text-xs text-muted-foreground text-right">
                  {about.length}/2048
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    maxLength={VALIDATION.USER_NAME_MAX_LENGTH}
                    className="h-10 rounded-lg bg-muted/20 border-border/50"
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {fullName.length}/{VALIDATION.USER_NAME_MAX_LENGTH}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    value={email}
                    disabled
                    className="h-10 rounded-lg bg-muted/30 border-border/50 text-muted-foreground cursor-not-allowed"
                  />
                  <p className="text-xs text-muted-foreground">Email cannot be changed — contact an administrator.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <PhoneInput
                    id="phone"
                    value={phone}
                    country={countryCode}
                    onValueChange={setPhone}
                    onCountryChange={setCountryCode}
                    placeholder="Enter phone number"
                  />
                  <p className="text-xs text-muted-foreground">Number is validated against the selected country.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger id="timezone" className="h-10 rounded-lg bg-muted/20 border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {timezoneOptions.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {saveError && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {saveError}
                </div>
              )}
            </div>
            <div className="p-6 border-t border-border flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Last updated {format(new Date(), 'MMM d, yyyy')}
              </p>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg shadow-sm"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : saveSuccess ? (
                  <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-400" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {saveSuccess ? 'Saved' : 'Save Changes'}
              </Button>
            </div>
          </motion.div>
        )}

        {activeTab === 'preferences' && (
          <motion.div
            key="preferences"
            data-tour="profile-preferences"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="bg-white dark:bg-slate-900 border border-border rounded-xl card-shadow"
          >
            <div className="p-6 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">Preferences</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Customize your experience</p>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label>Theme</Label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setTheme('light')}
                      className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border transition-all ${
                        themePref === 'light'
                          ? 'bg-primary/5 border-primary/30 text-primary'
                          : 'bg-muted/20 border-border/50 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Sun className="h-4 w-4" />
                      <span className="text-sm font-medium">Light</span>
                    </button>
                    <button
                      onClick={() => setTheme('dark')}
                      className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border transition-all ${
                        themePref === 'dark'
                          ? 'bg-primary/5 border-primary/30 text-primary'
                          : 'bg-muted/20 border-border/50 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Moon className="h-4 w-4" />
                      <span className="text-sm font-medium">Dark</span>
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">Applied instantly and remembered on this device.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="language">Language</Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger id="language" className="h-10 rounded-lg bg-muted/20 border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
                      <SelectItem value="de">German</SelectItem>
                      <SelectItem value="ja">Japanese</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="timeFormat">Time Format</Label>
                  <Select value={timeFormat} onValueChange={(v) => setTimeFormat(v as '12h' | '24h')}>
                    <SelectTrigger id="timeFormat" className="h-10 rounded-lg bg-muted/20 border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="12h">12-hour (AM/PM)</SelectItem>
                      <SelectItem value="24h">24-hour</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dateFormat">Date Format</Label>
                  <Select value={dateFormat} onValueChange={setDateFormat}>
                    <SelectTrigger id="dateFormat" className="h-10 rounded-lg bg-muted/20 border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MM/dd/yyyy">MM/DD/YYYY</SelectItem>
                      <SelectItem value="dd/MM/yyyy">DD/MM/YYYY</SelectItem>
                      <SelectItem value="yyyy-MM-dd">YYYY-MM-DD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/20 border border-border/40">
                <div className="flex items-center gap-3">
                  <Bell className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Email notifications</p>
                    <p className="text-xs text-muted-foreground">Receive email notifications for ticket updates</p>
                  </div>
                </div>
                <button
                  onClick={() => setEmailNotifications(!emailNotifications)}
                  aria-pressed={emailNotifications}
                  aria-label="Toggle email notifications"
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                    emailNotifications ? 'bg-emerald-500' : 'bg-muted'
                  }`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white dark:bg-slate-900 shadow-sm transition-transform ${
                    emailNotifications ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/20 border border-border/40">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Product Tour</p>
                    <p className="text-xs text-muted-foreground">Replay the guided walkthrough of SupportHub</p>
                  </div>
                </div>
                <RestartTourButton
                  size="sm"
                  variant="outline"
                  className="rounded-lg shrink-0"
                  label="Restart Tour"
                />
              </div>

              {saveError && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {saveError}
                </div>
              )}
            </div>
            <div className="p-6 border-t border-border flex justify-end">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg shadow-sm"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : saveSuccess ? (
                  <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-400" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {saveSuccess ? 'Saved' : 'Save Changes'}
              </Button>
            </div>
          </motion.div>
        )}

        {activeTab === 'security' && (
          <motion.div
            key="security"
            data-tour="profile-security"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="bg-white dark:bg-slate-900 border border-border rounded-xl card-shadow"
          >
            <div className="p-6 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">Security</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {canChangePasswordDirectly
                  ? 'Change your account password'
                  : 'Request a password reset from the Support team'}
              </p>
            </div>
            <div className="p-6 max-w-md space-y-5">
              {canChangePasswordDirectly ? (
                <>
                  {passwordInput('current', 'currentPassword', 'Current Password', currentPassword, setCurrentPassword, 'Enter current password')}
                  {passwordInput('new', 'newPassword', 'New Password', newPassword, setNewPassword, 'At least 12 characters')}
                  {passwordInput('confirm', 'confirmPassword', 'Confirm New Password', confirmPassword, setConfirmPassword, 'Re-enter new password')}

                  {passwordError && (
                    <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {passwordError}
                    </div>
                  )}

                  <Button
                    onClick={handleChangePassword}
                    disabled={changingPassword || saving}
                    className="rounded-lg shadow-sm"
                  >
                    {changingPassword ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Lock className="h-4 w-4 mr-2" />
                    )}
                    {changingPassword ? 'Changing...' : 'Change Password'}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    After changing your password, you will be signed out of all other devices.
                  </p>
                </>
              ) : (
                <>
                  <div className="rounded-lg bg-muted/20 border border-border/40 p-4 flex items-start gap-3">
                    <Lock className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p className="font-medium text-foreground">Direct password changes are disabled for your role</p>
                      <p>
                        To update your password, submit a request and our Support team will review it and set a new
                        password for you. No password is sent by email.
                      </p>
                    </div>
                  </div>

                  <Button
                    onClick={() => setResetDialogOpen(true)}
                    disabled={resetSubmitting}
                    className="rounded-lg shadow-sm"
                  >
                    {resetSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <KeyRound className="h-4 w-4 mr-2" />
                    )}
                    Request Password Reset
                  </Button>

                  {resetStatus && (
                    <div
                      className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${
                        resetStatus.type === 'success'
                          ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30'
                          : 'text-destructive bg-destructive/10'
                      }`}
                    >
                      {resetStatus.type === 'success' ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                      ) : (
                        <AlertCircle className="h-4 w-4 shrink-0" />
                      )}
                      {resetStatus.text}
                    </div>
                  )}

                  <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
                    <AlertDialogContent className="bg-white dark:bg-slate-900 border-border/50 max-w-md">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-foreground">Request Password Reset</AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground">
                          A password reset request will be sent to the Support team for review. The Support team
                          will contact you and set a new password for your account.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="border-border/50" disabled={resetSubmitting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRequestReset} disabled={resetSubmitting}>
                          {resetSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Send Request
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
