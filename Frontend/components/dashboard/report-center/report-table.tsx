'use client'

import { useState, useMemo, memo } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Eye, EyeOff, Columns3 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
import { TICKET_STATUS_CONFIG, TICKET_PRIORITY_CONFIG } from '@/lib/types'

interface Column {
  key: string
  label: string
  type?: string
}

interface ReportTableProps {
  columns: Column[]
  data: Record<string, unknown>[]
}

export const ReportTable = memo(function ReportTable({ columns, data }: ReportTableProps) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(columns.map(c => c.key)))
  const pageSizeOptions = [10, 25, 50, 100]

  // Filter by search
  const filtered = useMemo(() => {
    if (!search.trim()) return data
    const q = search.toLowerCase()
    return data.filter(row =>
      Object.entries(row).some(([key, value]) =>
        visibleColumns.has(key) && String(value).toLowerCase().includes(q)
      )
    )
  }, [data, search, visibleColumns])

  // Sort
  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal
      }
      const aStr = String(aVal ?? '').toLowerCase()
      const bStr = String(bVal ?? '').toLowerCase()
      const cmp = aStr.localeCompare(bStr)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sortKey, sortDir])

  const totalPages = Math.ceil(sorted.length / pageSize)
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize)

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(0)
  }

  function toggleColumn(key: string) {
    setVisibleColumns(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function formatValue(value: unknown, col: Column): React.ReactNode {
    if (value === null || value === undefined || value === '') return <span className="text-muted-foreground/50">—</span>

    if (col.type === 'badge') {
      const statusConfig = TICKET_STATUS_CONFIG[value as keyof typeof TICKET_STATUS_CONFIG]
      if (statusConfig) {
        return (
          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium', statusConfig.color)}>
            {statusConfig.label}
          </span>
        )
      }
      const priorityConfig = TICKET_PRIORITY_CONFIG[value as keyof typeof TICKET_PRIORITY_CONFIG]
      if (priorityConfig) {
        return (
          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium', priorityConfig.color)}>
            {priorityConfig.label}
          </span>
        )
      }
      if (value === 'Yes') return <span className="text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/15 px-2 py-0.5 rounded-lg">Yes</span>
      if (value === 'No') return <span className="text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/15 px-2 py-0.5 rounded-lg">No</span>
      return <span className="text-xs font-medium">{String(value)}</span>
    }

    if (col.type === 'date') {
      try {
        return <span className="text-xs text-muted-foreground">{new Date(value as string).toLocaleDateString()}</span>
      } catch { return String(value) }
    }

    if (col.type === 'number') {
      return <span className="text-xs font-medium text-foreground tabular-nums">{Number(value).toLocaleString()}</span>
    }

    return <span className="text-xs text-foreground">{String(value)}</span>
  }

  // Don't show table until report data exists
  if (data.length === 0) return null

  const visibleCols = columns.filter(c => visibleColumns.has(c.key))

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
            placeholder="Search records..."
            className="pl-9 h-9 rounded-lg bg-white dark:bg-slate-900 border-border text-sm"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="rounded-lg h-9 text-xs">
              <Columns3 className="mr-1.5 h-3.5 w-3.5" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase">Toggle Columns</div>
            <DropdownMenuSeparator />
            {columns.map(col => (
              <DropdownMenuCheckboxItem
                key={col.key}
                checked={visibleColumns.has(col.key)}
                onCheckedChange={() => toggleColumn(col.key)}
                className="text-xs cursor-pointer"
              >
                {col.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="text-xs text-muted-foreground ml-auto">
          {sorted.length} records
          {sorted.length !== filtered.length && (
            <span> (filtered from {data.length})</span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <div className="max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/50 border-b border-border">
                {visibleCols.map(col => (
                  <th
                    key={col.key}
                    className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap"
                    onClick={() => toggleSort(col.key)}
                  >
                    <span className="flex items-center gap-1">
                      {col.label}
                      {sortKey === col.key ? (
                        sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-30" />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={visibleCols.length} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No records match your search criteria
                  </td>
                </tr>
              ) : (
                paged.map((row, i) => (
                  <motion.tr
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.01 }}
                    className={cn(
                      'border-b border-border/30 hover:bg-muted/20 transition-colors',
                      i % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-muted/10'
                    )}
                  >
                    {visibleCols.map(col => (
                      <td key={col.key} className="px-4 py-3">
                        {formatValue(row[col.key], col)}
                      </td>
                    ))}
                  </motion.tr>
                )              ))}
            </tbody>
          </table>
        </div>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Rows per page:</span>
            <Select
              value={String(pageSize)}
              onValueChange={v => { setPageSize(Number(v)); setPage(0) }}
            >
              <SelectTrigger className="h-8 w-16 rounded-lg bg-white dark:bg-slate-900 border-border text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map(s => (
                  <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={page === 0}
                onClick={() => setPage(p => Math.max(0, p - 1))}
              >
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              >
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})
