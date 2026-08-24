'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TICKET_STATUS_CONFIG, TICKET_PRIORITY_CONFIG } from '@/lib/types'
import { X, Filter, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

export function TicketFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Keep a ref to latest searchParams to avoid useCallback dependency churn
  const searchParamsRef = useRef(searchParams)
  searchParamsRef.current = searchParams
  
  const currentStatus = searchParams.get('status') || ''
  const currentPriority = searchParams.get('priority') || ''
  const currentSearch = searchParams.get('q') || ''

  const updateFilter = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParamsRef.current.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    router.push(`/dashboard/tickets?${params.toString()}`)
  }, [router])

  const clearFilters = useCallback(() => {
    router.push('/dashboard/tickets')
  }, [router])

  const hasFilters = currentStatus || currentPriority || currentSearch

  return (
    <div className="rounded-xl bg-white dark:bg-slate-900 border border-border p-4 card-shadow animate-fade-in-down">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={currentSearch}
            onChange={(e) => updateFilter('q', e.target.value)}
            placeholder="Search tickets..."
            className="pl-9 h-9 rounded-xl bg-input/50 border-border/50 text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          
          <Select value={currentStatus} onValueChange={(v) => updateFilter('status', v === 'all' ? '' : v)}>
            <SelectTrigger className="w-[140px] h-9 rounded-xl bg-input/50 border-border/50">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(TICKET_STATUS_CONFIG).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  {config.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={currentPriority} onValueChange={(v) => updateFilter('priority', v === 'all' ? '' : v)}>
            <SelectTrigger className="w-[140px] h-9 rounded-xl bg-input/50 border-border/50">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              {Object.entries(TICKET_PRIORITY_CONFIG).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  {config.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-9 rounded-xl text-muted-foreground hover:text-foreground"
            >
              <X className="mr-1 h-3 w-3" />
              Clear filters
            </Button>            
        )}
      </div>
    </div>
  )
}
