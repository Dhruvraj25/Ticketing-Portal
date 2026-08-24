'use client'

import { memo, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface WalletPaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
}

export const WalletPagination = memo(function WalletPagination({
  currentPage,
  totalPages,
  onPageChange,
}: WalletPaginationProps) {
  const goToPrev = useCallback(() => onPageChange(Math.max(1, currentPage - 1)), [currentPage, onPageChange])
  const goToNext = useCallback(() => onPageChange(Math.min(totalPages, currentPage + 1)), [currentPage, totalPages, onPageChange])

  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-between pt-2" style={{ minHeight: 40 }}>
      <p className="text-sm text-muted-foreground">Page {currentPage} of {totalPages}</p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={goToPrev} disabled={currentPage === 1} className="rounded-lg">
          <ChevronLeft className="h-4 w-4 mr-1" /> Previous
        </Button>
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
          .map((p, idx, arr) => {
            const showEllipsis = idx > 0 && p - arr[idx - 1] > 1
            return (
              <span key={p} className="flex items-center">
                {showEllipsis && <span className="px-1 text-muted-foreground">...</span>}
                <button
                  onClick={() => onPageChange(p)}
                  className={`h-8 w-8 rounded-lg text-sm font-medium transition-colors ${
                    currentPage === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >{p}</button>
              </span>
            )
          })}
        <Button variant="outline" size="sm" onClick={goToNext} disabled={currentPage === totalPages} className="rounded-lg">
          Next <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  )
})
