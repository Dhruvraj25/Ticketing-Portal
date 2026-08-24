'use client'

import { memo } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { WALLET_STATUS_CONFIG } from '@/lib/types'

interface WalletFiltersProps {
  searchQuery: string
  onSearchChange: (value: string) => void
  selectedStatus: string
  onStatusChange: (value: string) => void
  selectedProject: string
  onProjectChange: (value: string) => void
  showFilters: boolean
  onToggleFilters: () => void
  hasFilters: boolean
  onClearFilters: () => void
  projects: { id: number; projectName: string; projectCode: string; clientId?: string }[]
}

export const WalletFilters = memo(function WalletFilters({
  searchQuery,
  onSearchChange,
  selectedStatus,
  onStatusChange,
  selectedProject,
  onProjectChange,
  showFilters,
  onToggleFilters,
  hasFilters,
  onClearFilters,
  projects,
}: WalletFiltersProps) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-border rounded-xl shadow-sm">
      <div className="p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => { onSearchChange(e.target.value) }}
              placeholder="Search by client, project, or code..."
              className="pl-9 h-10 rounded-xl bg-muted/30 border-border/50 text-sm"
            />
          </div>

          <button
            onClick={onToggleFilters}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-colors',
              hasFilters
                ? 'bg-primary/5 border-primary/30 text-primary'
                : 'bg-white dark:bg-slate-900 border-border/50 text-muted-foreground hover:text-foreground hover:border-border'
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {hasFilters && <span className="h-2 w-2 rounded-full bg-primary" />}
          </button>

          {hasFilters && (
            <button onClick={onClearFilters} className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
        </div>

        {/* Expanded Filters — auto-height container with smooth transition */}
        <div
          className={cn(
            'grid transition-all duration-200',
            showFilters
              ? 'grid-rows-[1fr] opacity-100 mt-4 pt-4 border-t border-border/50'
              : 'grid-rows-[0fr] opacity-0'
          )}
        >
          <div className="overflow-hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Select value={selectedStatus} onValueChange={onStatusChange}>
                <SelectTrigger className="w-full h-9 rounded-xl bg-muted/20 border-border/50 text-sm">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.entries(WALLET_STATUS_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>{config.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedProject} onValueChange={onProjectChange}>
                <SelectTrigger className="w-full h-9 rounded-xl bg-muted/20 border-border/50 text-sm">
                  <SelectValue placeholder="Project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.projectCode} — {p.projectName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})
