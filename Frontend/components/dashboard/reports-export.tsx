'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Download, FileText, FileSpreadsheet, FileJson, FileType, Loader2, Check } from 'lucide-react'
import { motion } from 'framer-motion'

interface ReportsExportProps {
  analytics: any
  devStats: any[]
  productivity: any[]
  totalWorkMinutes: number
}

export function ReportsExport({ analytics, devStats, productivity, totalWorkMinutes }: ReportsExportProps) {
  const [exporting, setExporting] = useState<string | null>(null)
  const [exported, setExported] = useState<string | null>(null)

  function buildReportData() {
    return {
      generatedAt: new Date().toISOString(),
      ticketAnalytics: {
        totalTickets: analytics.totalTickets,
        resolvedTickets: analytics.resolvedTickets,
        avgResolutionHours: analytics.avgResolutionHours,
        dailyVolume: analytics.dailyVolume,
        statusDistribution: analytics.statusDistribution,
        priorityDistribution: analytics.priorityDistribution,
        categoryDistribution: analytics.categoryDistribution,
      },
      developerPerformance: devStats.map((d: any) => ({
        name: d.name,
        activeTickets: d.activeTickets,
        resolvedTickets: d.resolvedTickets,
        totalTimeMinutes: d.totalTimeMinutes,
        totalTimeHours: Math.round(d.totalTimeMinutes / 60 * 10) / 10,
      })),
      teamProductivity: productivity.map((e: any) => ({
        name: e.name,
        role: e.role,
        totalMinutes: e.totalMinutes,
        totalHours: Math.round(e.totalMinutes / 60 * 10) / 10,
        ticketsWorked: e.ticketsWorked,
        resolvedTickets: e.resolvedTickets,
      })),
      totalWorkMinutes,
      totalWorkHours: Math.round(totalWorkMinutes / 60 * 10) / 10,
    }
  }

  async function handleExport(format: string) {
    setExporting(format)
    setExported(null)

    try {
      const data = buildReportData()

      switch (format) {
        case 'csv': {
          // Generate CSV
          const headers = ['Name', 'Role', 'Total Hours', 'Tickets Worked', 'Resolved', 'Avg Minutes/Ticket']
          const rows = productivity.map((e: any) => [
            e.name,
            e.role,
            Math.round(e.totalMinutes / 60 * 10) / 10,
            e.ticketsWorked,
            e.resolvedTickets,
            e.avgMinutesPerTicket,
          ])
          const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
          downloadFile(csv, 'report-productivity.csv', 'text/csv')
          break
        }

        case 'json': {
          const json = JSON.stringify(data, null, 2)
          downloadFile(json, 'report-full.json', 'application/json')
          break
        }

        case 'txt': {
          const lines = [
            '=== Support Hero Report ===',
            `Generated: ${new Date().toLocaleString()}`,
            '',
            '=== Ticket Analytics ===',
            `Total Tickets: ${analytics.totalTickets}`,
            `Resolved: ${analytics.resolvedTickets}`,
            `Avg Resolution: ${analytics.avgResolutionHours}h`,
            '',
            '=== Developer Performance ===',
            ...devStats.map((d: any) => `${d.name}: ${d.activeTickets} active, ${d.resolvedTickets} resolved, ${Math.round(d.totalTimeMinutes / 60 * 10) / 10}h`),
            '',
            '=== Team Resources ===',
            ...productivity.map((e: any) => `${e.name} (${e.role}): ${Math.round(e.totalMinutes / 60 * 10) / 10}h, ${e.ticketsWorked} tickets`),
            '',
            `Total Team Hours: ${Math.round(totalWorkMinutes / 60 * 10) / 10}h`,
          ]
          downloadFile(lines.join('\n'), 'report.txt', 'text/plain')
          break
        }

        case 'html': {
          // Generate a print-friendly HTML report
          const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Support Hero Report</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 900px; margin: 0 auto; padding: 2rem; color: #1e293b; }
  h1 { font-size: 1.5rem; border-bottom: 2px solid #6366f1; padding-bottom: 0.5rem; }
  h2 { font-size: 1.125rem; margin-top: 2rem; color: #4f46e5; }
  table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
  th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #e2e8f0; }
  th { background: #f1f5f9; font-weight: 600; }
  .kpis { display: flex; gap: 1rem; margin: 1rem 0; }
  .kpi { flex: 1; text-align: center; padding: 1rem; background: #f8fafc; border-radius: 0.75rem; border: 1px solid #e2e8f0; }
  .kpi-value { font-size: 1.5rem; font-weight: 700; color: #4f46e5; }
  .kpi-label { font-size: 0.75rem; color: #64748b; margin-top: 0.25rem; }
  .footer { margin-top: 2rem; font-size: 0.75rem; color: #94a3b8; text-align: center; }
</style></head>
<body>
  <h1>Support Hero Analytics Report</h1>
  <p>Generated: ${new Date().toLocaleString()}</p>

  <div class="kpis">
    <div class="kpi"><div class="kpi-value">${analytics.totalTickets}</div><div class="kpi-label">Total Tickets</div></div>
    <div class="kpi"><div class="kpi-value">${analytics.resolvedTickets}</div><div class="kpi-label">Resolved (30d)</div></div>
    <div class="kpi"><div class="kpi-value">${analytics.avgResolutionHours}h</div><div class="kpi-label">Avg Resolution</div></div>
    <div class="kpi"><div class="kpi-value">${Math.round(totalWorkMinutes / 60 * 10) / 10}h</div><div class="kpi-label">Team Hours</div></div>
  </div>

  <h2>Status Distribution</h2>
  <table><tr><th>Status</th><th>Count</th></tr>
    ${analytics.statusDistribution.map((s: any) => `<tr><td>${s.status}</td><td>${s.count}</td></tr>`).join('')}
  </table>

  <h2>Developer Performance</h2>
  <table><tr><th>Developer</th><th>Active</th><th>Resolved</th><th>Hours</th></tr>
    ${devStats.map((d: any) => `<tr><td>${d.name}</td><td>${d.activeTickets}</td><td>${d.resolvedTickets}</td><td>${Math.round(d.totalTimeMinutes / 60 * 10) / 10}</td></tr>`).join('')}
  </table>

  <h2>Team Resources</h2>
  <table><tr><th>Name</th><th>Role</th><th>Hours</th><th>Tickets</th><th>Resolved</th></tr>
    ${productivity.map((e: any) => `<tr><td>${e.name}</td><td>${e.role}</td><td>${Math.round(e.totalMinutes / 60 * 10) / 10}</td><td>${e.ticketsWorked}</td><td>${e.resolvedTickets}</td></tr>`).join('')}
  </table>

  <div class="footer">Support Hero — Generated automatically</div>
</body></html>`
          downloadFile(html, 'report.html', 'text/html')
          break
        }

        case 'xlsx': {
          // Simple Excel-compatible XML spreadsheet
          const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Summary">
    <Table>
      <Row><Cell><Data ss:Type="String">Support Hero Report</Data></Cell></Row>
      <Row><Cell><Data ss:Type="String">Generated: ${new Date().toLocaleString()}</Data></Cell></Row>
      <Row/>
      <Row><Cell><Data ss:Type="String">Metric</Data></Cell><Cell><Data ss:Type="String">Value</Data></Cell></Row>
      <Row><Cell><Data ss:Type="String">Total Tickets</Data></Cell><Cell><Data ss:Type="Number">${analytics.totalTickets}</Data></Cell></Row>
      <Row><Cell><Data ss:Type="String">Resolved</Data></Cell><Cell><Data ss:Type="Number">${analytics.resolvedTickets}</Data></Cell></Row>
      <Row><Cell><Data ss:Type="String">Avg Resolution (h)</Data></Cell><Cell><Data ss:Type="Number">${analytics.avgResolutionHours}</Data></Cell></Row>
      <Row><Cell><Data ss:Type="String">Team Hours</Data></Cell><Cell><Data ss:Type="Number">${Math.round(totalWorkMinutes / 60 * 10) / 10}</Data></Cell></Row>
    </Table>
  </Worksheet>
  <Worksheet ss:Name="Developers">
    <Table>
      <Row><Cell><Data ss:Type="String">Name</Data></Cell><Cell><Data ss:Type="String">Active</Data></Cell><Cell><Data ss:Type="String">Resolved</Data></Cell><Cell><Data ss:Type="String">Hours</Data></Cell></Row>
      ${devStats.map((d: any) => `<Row><Cell><Data ss:Type="String">${d.name}</Data></Cell><Cell><Data ss:Type="Number">${d.activeTickets}</Data></Cell><Cell><Data ss:Type="Number">${d.resolvedTickets}</Data></Cell><Cell><Data ss:Type="Number">${Math.round(d.totalTimeMinutes / 60 * 10) / 10}</Data></Cell></Row>`).join('')}
    </Table>
  </Worksheet>
</Workbook>`
          downloadFile(xml, 'report.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
          break
        }
      }

      setExported(format)
      setTimeout(() => setExported(null), 3000)
    } catch {
      // Silent
    } finally {
      setExporting(null)
    }
  }

  function downloadFile(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportFormats = [
    { id: 'csv', label: 'CSV', icon: FileSpreadsheet, description: 'Comma-separated values' },
    { id: 'json', label: 'JSON', icon: FileJson, description: 'Raw data export' },
    { id: 'txt', label: 'Text', icon: FileType, description: 'Plain text report' },
    { id: 'html', label: 'HTML', icon: FileText, description: 'Formatted web report' },
    { id: 'xlsx', label: 'Excel', icon: FileSpreadsheet, description: 'Spreadsheet (XML)' },
  ]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button className="bg-white/20 dark:bg-slate-900 hover:bg-white/30 text-white border-white/20 backdrop-blur-sm rounded-xl h-10 px-5">
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : exported ? (
              <Check className="mr-2 h-4 w-4" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {exporting ? 'Exporting...' : exported ? 'Exported!' : 'Export Report'}
          </Button>
        </motion.div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {exportFormats.map((fmt) => (
          <DropdownMenuItem
            key={fmt.id}
            onClick={() => handleExport(fmt.id)}
            disabled={exporting !== null}
            className="cursor-pointer"
          >
            <fmt.icon className="mr-2 h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{fmt.label}</p>
              <p className="text-xs text-muted-foreground">{fmt.description}</p>
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled className="text-xs text-muted-foreground">
          Use print-to-PDF for PDF export
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
