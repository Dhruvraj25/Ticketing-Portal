'use client'

import dynamic from 'next/dynamic'

const AnalyticsKpiStrip = dynamic(
  () =>
    import('@/components/dashboard/analytics-charts').then((m) => ({
      default: m.AnalyticsKpiStrip,
    })),
  { ssr: false },
)

const TicketVolumeChart = dynamic(
  () =>
    import('@/components/dashboard/analytics-charts').then((m) => ({
      default: m.TicketVolumeChart,
    })),
  { ssr: false },
)

const StatusDistributionChart = dynamic(
  () =>
    import('@/components/dashboard/analytics-charts').then((m) => ({
      default: m.StatusDistributionChart,
    })),
  { ssr: false },
)

const PriorityDistributionChart = dynamic(
  () =>
    import('@/components/dashboard/analytics-charts').then((m) => ({
      default: m.PriorityDistributionChart,
    })),
  { ssr: false },
)

const DeveloperWorkloadChart = dynamic(
  () =>
    import('@/components/dashboard/analytics-charts').then((m) => ({
      default: m.DeveloperWorkloadChart,
    })),
  { ssr: false },
)

const DeveloperTimeTable = dynamic(
  () =>
    import('@/components/dashboard/analytics-charts').then((m) => ({
      default: m.DeveloperTimeTable,
    })),
  { ssr: false },
)

export {
  AnalyticsKpiStrip,
  TicketVolumeChart,
  StatusDistributionChart,
  PriorityDistributionChart,
  DeveloperWorkloadChart,
  DeveloperTimeTable,
}
