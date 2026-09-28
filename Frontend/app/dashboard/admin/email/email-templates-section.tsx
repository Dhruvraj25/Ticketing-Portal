'use client'

import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Eye, FileText, Loader2, Pencil, RotateCcw, XCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  getEmailTemplateForEdit,
  getEmailTemplatePreview,
  getEmailTemplates,
  previewEmailTemplateDraft,
  resetEmailTemplate,
  saveEmailTemplate,
  type EmailAdminResult,
  type EmailTemplateEditorData,
  type EmailTemplateItem,
  type EmailTemplatePreview,
  type EmailTemplateStatus,
} from '@/app/actions/email-admin'

type TemplatesPayload = { editable: boolean; templates: EmailTemplateItem[] }
type EditorField = 'subject' | 'htmlBody' | 'textBody'

const SCROLL_BOX = 'max-h-[420px] overflow-y-auto overscroll-contain'

function TemplateStatusBadge({ status }: { status: EmailTemplateStatus }) {
  if (status === 'customized') {
    return <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30 whitespace-nowrap">Customized</span>
  }
  if (status === 'customized_inactive') {
    return <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30 whitespace-nowrap">Customized (inactive)</span>
  }
  return <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-800 whitespace-nowrap">Using Default</span>
}

/** Sandboxed render of email HTML (sample data only; no scripts can run). */
function EmailFrame({ html, className }: { html: string; className?: string }) {
  return <iframe title="Email template preview" sandbox="" srcDoc={html} className={cn('w-full rounded-lg border border-border bg-white', className)} />
}

export function EmailTemplatesSection({
  initial,
  onTemplatesChange,
}: {
  initial: EmailAdminResult<TemplatesPayload>
  onTemplatesChange?: (templates: EmailTemplateItem[]) => void
}) {
  const [result, setResult] = useState(initial)
  const templates = result.data?.templates ?? []

  const reload = useCallback(async () => {
    const r = await getEmailTemplates()
    setResult(r)
    if (r.ok && r.data) onTemplatesChange?.(r.data.templates)
  }, [onTemplatesChange])

  // ── Preview (saved/effective template) ────────────────────────────────────
  const [preview, setPreview] = useState<EmailTemplatePreview | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function openPreview(eventType: string) {
    setBusy('preview:' + eventType)
    try {
      const res = await getEmailTemplatePreview(eventType)
      if (res.ok && res.data) setPreview(res.data)
      else toast.error(res.error || 'Unable to render the template preview')
    } finally {
      setBusy(null)
    }
  }

  // ── Editor ────────────────────────────────────────────────────────────────
  const [editor, setEditor] = useState<EmailTemplateEditorData | null>(null)
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [htmlBody, setHtmlBody] = useState('')
  const [textBody, setTextBody] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [draftPreview, setDraftPreview] = useState<{ subject: string; html: string } | null>(null)
  const [draftLoading, setDraftLoading] = useState(false)
  const lastField = useRef<EditorField>('htmlBody')
  const fieldRefs = {
    subject: useRef<HTMLInputElement>(null),
    htmlBody: useRef<HTMLTextAreaElement>(null),
    textBody: useRef<HTMLTextAreaElement>(null),
  }

  async function openEditor(eventType: string) {
    setBusy('edit:' + eventType)
    try {
      const res = await getEmailTemplateForEdit(eventType)
      if (!res.ok || !res.data) {
        toast.error(res.error || 'Unable to load the template')
        return
      }
      const d = res.data
      const content = d.customized ?? d.default
      setName(content.name)
      setSubject(content.subject)
      setHtmlBody(content.htmlBody)
      setTextBody(content.textBody ?? '')
      setIsActive(d.customized ? d.customized.isActive : true)
      setErrors([])
      setDraftPreview(null)
      setEditor(d)
    } finally {
      setBusy(null)
    }
  }

  function loadDefaultIntoEditor() {
    if (!editor) return
    setName(editor.default.name)
    setSubject(editor.default.subject)
    setHtmlBody(editor.default.htmlBody)
    setTextBody('')
    setErrors([])
    setDraftPreview(null)
  }

  /** Insert {{variable}} at the cursor of the last focused field. */
  function insertVariable(variable: string) {
    const token = `{{${variable}}}`
    const field = lastField.current
    const el = fieldRefs[field].current
    const setters: Record<EditorField, [string, (v: string) => void]> = {
      subject: [subject, setSubject],
      htmlBody: [htmlBody, setHtmlBody],
      textBody: [textBody, setTextBody],
    }
    const [value, set] = setters[field]
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    set(value.slice(0, start) + token + value.slice(end))
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      el.setSelectionRange(start + token.length, start + token.length)
    })
  }

  async function handleDraftPreview() {
    if (!editor) return
    setDraftLoading(true)
    setErrors([])
    try {
      const res = await previewEmailTemplateDraft(editor.eventType, { subject, htmlBody, textBody: textBody || null })
      if (res.ok && res.data) setDraftPreview(res.data)
      else {
        setDraftPreview(null)
        setErrors(res.errors?.length ? res.errors : [res.error || 'Unable to render the preview'])
      }
    } finally {
      setDraftLoading(false)
    }
  }

  async function handleSave() {
    if (!editor) return
    setSaving(true)
    setErrors([])
    try {
      const res = await saveEmailTemplate(editor.eventType, { name, subject, htmlBody, textBody: textBody || null, isActive })
      if (res.ok) {
        toast.success(isActive ? 'Template saved — it will be used for new emails' : 'Template saved (inactive — the default is still used)')
        setEditor(null)
        await reload()
      } else {
        setErrors(res.errors?.length ? res.errors : [res.error || 'Unable to save the template'])
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleReset(t: EmailTemplateItem) {
    if (!window.confirm(`Reset "${t.defaultLabel}" to the default template?\n\nYour customized version will be deleted and the built-in template will be used for new emails.`)) return
    setBusy('reset:' + t.eventType)
    try {
      const res = await resetEmailTemplate(t.eventType)
      if (res.ok) {
        toast.success(`"${t.defaultLabel}" now uses the default template`)
        await reload()
      } else {
        toast.error(res.error || 'Unable to reset the template')
      }
    } finally {
      setBusy(null)
    }
  }

  const limits = editor?.limits

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><FileText className="h-4 w-4" /> Email Templates</CardTitle>
          <CardDescription className="text-xs">
            Built-in templates are used by default. Editing a template saves a customized version for that email only;
            Reset to Default restores the built-in template.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {!result.ok ? (
            <div className="p-4">
              <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-300">
                <XCircle className="h-4 w-4 shrink-0 mt-0.5" /><span>{result.error || 'Unable to load templates.'}</span>
              </div>
            </div>
          ) : (
            <div className={cn(SCROLL_BOX, 'overflow-x-auto')}>
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-border">
                    <th className="text-left font-medium text-muted-foreground px-4 py-2">Template</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-2">Description</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-2">Status</th>
                    <th className="text-right font-medium text-muted-foreground px-4 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((t) => (
                    <tr key={t.eventType} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-4 py-2">
                        <p className="font-medium text-foreground">{t.label}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">Event: {t.eventType}</p>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">Sent to {t.recipient.charAt(0).toLowerCase() + t.recipient.slice(1)}</td>
                      <td className="px-4 py-2"><TemplateStatusBadge status={t.status} /></td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-1.5">
                          <Button variant="outline" size="sm" className="h-7" onClick={() => openPreview(t.eventType)} disabled={busy !== null}>
                            {busy === 'preview:' + t.eventType ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                            <span className="ml-1.5">Preview</span>
                          </Button>
                          <Button variant="outline" size="sm" className="h-7" onClick={() => openEditor(t.eventType)} disabled={busy !== null}>
                            {busy === 'edit:' + t.eventType ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
                            <span className="ml-1.5">Edit</span>
                          </Button>
                          {t.status !== 'default' && (
                            <Button variant="ghost" size="sm" className="h-7 text-red-600 dark:text-red-400" onClick={() => handleReset(t)} disabled={busy !== null}>
                              {busy === 'reset:' + t.eventType ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                              <span className="ml-1.5">Reset to Default</span>
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Preview (effective template) ───────────────────────────────── */}
      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null) }}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{preview?.label}</DialogTitle>
            <DialogDescription>
              Preview with sample data · Recipient: {preview?.recipient} · {preview?.customized ? 'Customized template' : 'Default template'}
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Subject</p>
                <p className="text-sm font-medium">{preview.subject}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Available Variables</p>
                <div className="flex flex-wrap gap-1.5">
                  {preview.variables.map((v) => <Badge key={v} variant="outline" className="font-mono text-[11px]">{`{{${v}}}`}</Badge>)}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Body</p>
                <EmailFrame html={preview.html} className="h-[420px]" />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Editor ─────────────────────────────────────────────────────── */}
      <Dialog open={!!editor} onOpenChange={(o) => { if (!o && !saving) setEditor(null) }}>
        <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Email Template</DialogTitle>
            <DialogDescription>
              {editor?.label} · Event: <span className="font-mono">{editor?.eventType}</span> · Sent to {editor?.recipient}
            </DialogDescription>
          </DialogHeader>

          {editor && (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_240px] gap-5">
              <div className="space-y-4 min-w-0">
                <div className="space-y-1.5">
                  <Label htmlFor="tpl-name">Template Name</Label>
                  <Input id="tpl-name" value={name} maxLength={limits?.name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tpl-subject">Subject</Label>
                  <Input
                    id="tpl-subject"
                    ref={fieldRefs.subject}
                    value={subject}
                    maxLength={limits?.subject}
                    onChange={(e) => setSubject(e.target.value)}
                    onFocus={() => { lastField.current = 'subject' }}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="tpl-html">HTML Body</Label>
                    <span className="text-[11px] text-muted-foreground">{htmlBody.length.toLocaleString()} / {limits?.htmlBody.toLocaleString()}</span>
                  </div>
                  <Textarea
                    id="tpl-html"
                    ref={fieldRefs.htmlBody}
                    value={htmlBody}
                    onChange={(e) => setHtmlBody(e.target.value)}
                    onFocus={() => { lastField.current = 'htmlBody' }}
                    spellCheck={false}
                    className="font-mono text-xs min-h-[340px] resize-y"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Email content only — the branded header and footer are added automatically. Scripts, iframes, forms,
                    styles blocks and event handlers are not allowed.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tpl-text">Plain Text Body <span className="text-muted-foreground font-normal">(optional — generated from the HTML if empty)</span></Label>
                  <Textarea
                    id="tpl-text"
                    ref={fieldRefs.textBody}
                    value={textBody}
                    onChange={(e) => setTextBody(e.target.value)}
                    onFocus={() => { lastField.current = 'textBody' }}
                    className="font-mono text-xs min-h-[100px] resize-y"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="tpl-active" checked={isActive} onCheckedChange={setIsActive} />
                  <Label htmlFor="tpl-active" className="font-normal">Use this customized template for new emails</Label>
                </div>

                {errors.length > 0 && (
                  <div className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-300">
                    <p className="font-medium mb-1">Please fix the following:</p>
                    <ul className="list-disc pl-4 space-y-0.5">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
                  </div>
                )}

                {draftPreview && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Preview (sample data) · Subject: <span className="font-medium text-foreground">{draftPreview.subject}</span></p>
                    <EmailFrame html={draftPreview.html} className="h-[380px]" />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-foreground">Available Variables</p>
                <p className="text-[11px] text-muted-foreground">
                  Only these values are supplied to this email. Click to insert at the cursor.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {editor.variables.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => insertVariable(v)}
                      className="font-mono text-[11px] px-2 py-0.5 rounded-md border border-border hover:bg-muted/50 transition-colors"
                    >
                      {`{{${v}}}`}
                    </button>
                  ))}
                </div>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-0 text-xs" onClick={loadDefaultIntoEditor}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Load default content
                </Button>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleDraftPreview} disabled={draftLoading || saving}>
              {draftLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
              Preview
            </Button>
            <Button variant="outline" onClick={() => setEditor(null)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
