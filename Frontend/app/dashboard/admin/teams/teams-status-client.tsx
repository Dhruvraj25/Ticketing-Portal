'use client'

import { useState } from 'react'
import {
  sendTeamsTestMessage,
  clearTeamsQueue,
  resetTeamsMonitor,
} from '@/app/actions/teams'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Send, RefreshCw, Trash2, Loader2, CheckCircle2, XCircle, Terminal } from 'lucide-react'

interface TestSendResult {
  success: boolean
  message: string
  statusCode?: number
  responseBody?: string
  error?: string
  mockMode?: boolean
  durationMs?: number
  messageId?: string
}

export function TeamsStatusClient() {
  const [testResult, setTestResult] = useState<TestSendResult | null>(null)
  const [loading, setLoading] = useState<string | null>(null)

  async function handleSendTest() {
    setLoading('test')
    setTestResult(null)
    try {
      const result = await sendTeamsTestMessage() as TestSendResult
      setTestResult(result)
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Test failed',
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setLoading(null)
    }
  }

  async function handleClearQueue() {
    setLoading('queue')
    try {
      await clearTeamsQueue()
      alert('Queue cleared')
    } catch (err) {
      alert('Failed to clear queue: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setLoading(null)
    }
  }

  async function handleResetMonitor() {
    setLoading('monitor')
    try {
      await resetTeamsMonitor()
      alert('Monitor stats reset')
    } catch (err) {
      alert('Failed to reset monitor: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setLoading(null)
    }
  }

  function StatusCodeBadge({ code }: { code: number }) {
    const isSuccess = code >= 200 && code < 300
    const isClientError = code >= 400 && code < 500
    const isServerError = code >= 500
    let cls = 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-800'
    if (isSuccess) cls = 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
    if (isClientError) cls = 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30'
    if (isServerError) cls = 'bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30'
    return (
      <span className={'inline-flex items-center gap-1 text-xs font-mono font-bold px-2 py-0.5 rounded border ' + cls}>
        {code}
      </span>
    )
  }

  function formatResponseBody(body: string | undefined): string {
    if (!body) return '(empty)'
    try {
      return JSON.stringify(JSON.parse(body), null, 2)
    } catch {
      return body
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Send className="h-4 w-4" />
          Actions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="default"
            size="sm"
            onClick={handleSendTest}
            disabled={loading === 'test'}
            className="gap-2"
          >
            {loading === 'test' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send Test Message
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleClearQueue}
            disabled={loading === 'queue'}
            className="gap-2"
          >
            {loading === 'queue' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Clear Queue
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleResetMonitor}
            disabled={loading === 'monitor'}
            className="gap-2"
          >
            {loading === 'monitor' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Reset Stats
          </Button>
        </div>

        {/* Test Result Display */}
        {testResult && (
          <div className="mt-4 space-y-3">
            {/* Status Banner */}
            <div className={'flex items-center gap-2 text-xs rounded-lg px-3 py-2 ' + (
              testResult.success
                ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : 'bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300'
            )}>
              {testResult.success ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0" />
              )}
              <span className="font-semibold">
                {testResult.success
                  ? (testResult.mockMode ? 'Mock message logged (dev mode)' : 'Message delivered via webhook')
                  : 'Delivery failed'
                }
              </span>
              {testResult.durationMs !== undefined && (
                <span className="ml-auto tabular-nums opacity-75">{testResult.durationMs}ms</span>
              )}
            </div>

            {/* HTTP Status Code */}
            {testResult.statusCode !== undefined && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">HTTP Status:</span>
                <StatusCodeBadge code={testResult.statusCode} />
                {testResult.mockMode && (
                  <Badge variant="outline" className="text-[11px] text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15">
                    Mock Mode
                  </Badge>
                )}
              </div>
            )}

            {/* Message */}
            <div className="text-xs text-muted-foreground">
              {testResult.message}
            </div>

            {/* Error Details */}
            {testResult.error && !testResult.success && (
              <div className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15/50 px-3 py-2 space-y-1">
                <div className="flex items-center gap-2">
                  <Terminal className="h-3 w-3 text-red-500 dark:text-red-400" />
                  <span className="text-xs font-semibold text-red-700 dark:text-red-300">Webhook Error</span>
                </div>
                <p className="text-xs text-red-600 dark:text-red-400 font-mono">
                  {testResult.error}
                </p>
              </div>
            )}

            {/* Response Body (collapsible) */}
            {testResult.responseBody && (
              <details className="rounded-lg border border-border">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground px-3 py-2 hover:bg-muted/50 rounded-lg">
                  Response Body
                </summary>
                <div className="border-t border-border">
                  <pre className="text-[11px] font-mono leading-relaxed p-3 overflow-x-auto max-h-48 overflow-y-auto bg-muted/30">
                    {formatResponseBody(testResult.responseBody)}
                  </pre>
                </div>
              </details>
            )}

            {/* Message ID */}
            {testResult.messageId && (
              <div className="text-[11px] text-muted-foreground font-mono">
                Message ID: {testResult.messageId}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
