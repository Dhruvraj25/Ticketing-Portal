'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useBranding } from '@/components/dashboard/branding-provider'
import { updateBranding, removeBrandingLogo, removeBrandingFavicon, resetDefaultBranding } from '@/app/actions/branding'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  Building2,
  Globe,
  Loader2,
  Save,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Upload,
  RotateCcw,
  Ticket,
} from 'lucide-react'

export function BrandingSettings() {
  const router = useRouter()
  const { branding, refreshBranding } = useBranding()

  const [companyName, setCompanyName] = useState(branding.companyName)
  const [logoPreview, setLogoPreview] = useState<string | null>(branding.logoUrl)
  const [faviconPreview, setFaviconPreview] = useState<string | null>(branding.faviconUrl)

  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingFavicon, setUploadingFavicon] = useState(false)
  const [resetting, setResetting] = useState(false)

  const logoInputRef = useRef<HTMLInputElement>(null)
  const faviconInputRef = useRef<HTMLInputElement>(null)

  const handleSaveName = async () => {
    if (!companyName.trim()) return
    setSaving(true)
    setSaveSuccess(false)
    setSaveError('')
    try {
      await updateBranding({ companyName: companyName.trim() })
      await refreshBranding()
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setSaveError('Only PNG, JPG, JPEG, SVG, and WebP images are supported')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setSaveError('Image must be less than 5MB')
      return
    }

    setUploadingLogo(true)
    setSaveError('')
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error ?? 'Upload failed')
      }

      await updateBranding({
        logoUrl: data.url,
        logoPublicId: data.publicId,
      })
      await refreshBranding()
      setLogoPreview(data.url)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploadingLogo(false)
    }
    e.target.value = ''
  }

  const handleUploadFavicon = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp', 'image/x-icon']
    if (!allowedTypes.includes(file.type) && !file.name.endsWith('.ico')) {
      setSaveError('Only PNG, JPG, JPEG, SVG, WebP, and ICO files are supported')
      return
    }

    if (file.size > 1 * 1024 * 1024) {
      setSaveError('Favicon must be less than 1MB')
      return
    }

    setUploadingFavicon(true)
    setSaveError('')
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error ?? 'Upload failed')
      }

      await updateBranding({
        faviconUrl: data.url,
        faviconPublicId: data.publicId,
      })
      await refreshBranding()
      setFaviconPreview(data.url)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploadingFavicon(false)
    }
    e.target.value = ''
  }

  const handleRemoveLogo = async () => {
    setUploadingLogo(true)
    setSaveError('')
    try {
      await removeBrandingLogo()
      await refreshBranding()
      setLogoPreview(null)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to remove logo')
    } finally {
      setUploadingLogo(false)
    }
  }

  const handleRemoveFavicon = async () => {
    setUploadingFavicon(true)
    setSaveError('')
    try {
      await removeBrandingFavicon()
      await refreshBranding()
      setFaviconPreview(null)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to remove favicon')
    } finally {
      setUploadingFavicon(false)
    }
  }

  const handleReset = async () => {
    setResetting(true)
    setSaveError('')
    try {
      await resetDefaultBranding()
      await refreshBranding()
      setCompanyName('SupportHub')
      setLogoPreview(null)
      setFaviconPreview(null)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to reset branding')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-neutral-100">
          <Building2 className="h-4 w-4 text-neutral-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Branding</h2>
          <p className="text-sm text-muted-foreground">Customize your company appearance</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-border rounded-xl card-shadow overflow-hidden">
        {/* Company Name */}
        <div className="p-6 border-b border-border">
          <div className="space-y-2">
            <Label htmlFor="companyName">Company Name</Label>
            <div className="flex gap-3">
              <Input
                id="companyName"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="h-10 rounded-lg bg-muted/20 border-border/50 flex-1 max-w-md"
                placeholder="SupportHub"
              />
              <Button
                onClick={handleSaveName}
                disabled={saving || !companyName.trim() || companyName === branding.companyName}
                className="rounded-lg shadow-sm shrink-0"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : saveSuccess ? (
                  <CheckCircle2 className="h-4 w-4 mr-1.5 text-emerald-400" />
                ) : (
                  <Save className="h-4 w-4 mr-1.5" />
                )}
                {saveSuccess ? 'Saved' : 'Save'}
              </Button>
            </div>
          </div>
        </div>

        {/* Logo Upload */}
        <div className="p-6 border-b border-border">
          <div className="space-y-3">
            <Label>Company Logo</Label>
            <p className="text-xs text-muted-foreground">PNG, JPG, JPEG, SVG, or WebP. Max 5MB.</p>
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-xl bg-muted/30 border border-border/50 flex items-center justify-center overflow-hidden shrink-0">
                {logoPreview ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={logoPreview} alt="Company logo" className="h-full w-full object-contain" />
                ) : (
                  <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary text-primary-foreground">
                    <Ticket className="h-4 w-4" />
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={logoInputRef}
                  type="file"
                  className="hidden"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  onChange={handleUploadLogo}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingLogo}
                  className="rounded-lg"
                >
                  {uploadingLogo ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {logoPreview ? 'Change Logo' : 'Upload Logo'}
                </Button>
                {logoPreview && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRemoveLogo}
                    disabled={uploadingLogo}
                    className="rounded-lg text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Favicon Upload */}
        <div className="p-6 border-b border-border">
          <div className="space-y-3">
            <Label>Favicon (Optional)</Label>
            <p className="text-xs text-muted-foreground">PNG, JPG, JPEG, SVG, WebP, or ICO. Max 1MB.</p>
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-muted/30 border border-border/50 flex items-center justify-center overflow-hidden shrink-0">
                {faviconPreview ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={faviconPreview} alt="Favicon" className="h-full w-full object-contain" />
                ) : (
                  <Globe className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={faviconInputRef}
                  type="file"
                  className="hidden"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp,image/x-icon,.ico"
                  onChange={handleUploadFavicon}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => faviconInputRef.current?.click()}
                  disabled={uploadingFavicon}
                  className="rounded-lg"
                >
                  {uploadingFavicon ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {faviconPreview ? 'Change Favicon' : 'Upload Favicon'}
                </Button>
                {faviconPreview && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRemoveFavicon}
                    disabled={uploadingFavicon}
                    className="rounded-lg text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Reset & Footer */}
        <div className="p-6 flex items-center justify-between">
          <div>
            {saveError && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {saveError}
              </div>
            )}
            {saveSuccess && (
              <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Branding updated successfully.
              </div>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={resetting}
            className="rounded-lg text-muted-foreground"
          >
            {resetting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            )}
            Reset to Default
          </Button>
        </div>
      </div>
    </div>
  )
}
