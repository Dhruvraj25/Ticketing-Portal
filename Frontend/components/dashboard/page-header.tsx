'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Calendar, Clock } from 'lucide-react'

export function CurrentDate() {
  const [dateStr, setDateStr] = useState('')
  const [timeStr, setTimeStr] = useState('')

  useEffect(() => {
    function update() {
      const now = new Date()
      setDateStr(format(now, 'EEEE, MMMM d, yyyy'))
      setTimeStr(format(now, 'h:mm a'))
    }
    update()
    const interval = setInterval(update, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-mono border bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-800/80 dark:border-slate-700 dark:text-slate-300">
      <Calendar size={14} className="text-slate-400" />
      <span>{dateStr}</span>
      <span className="text-slate-300 dark:text-slate-600">•</span>
      <Clock size={14} className="text-slate-400" />
      <span>{timeStr}</span>
    </div>
  )
}
