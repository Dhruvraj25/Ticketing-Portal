// ── BARREL RE-EXPORT FILE ──────────────────────────────────────────────────
// NOTE: No 'use server' directive — this is a barrel re-export file.
// The actual 'use server' functions live in the tickets/*.ts modules below.

export {
  createTicket,
} from './create'

export {
  getTicketsList,
  getTicketById,
  getTickets,
  getConsolidatedDashboardData,
  getDashboardStats,
  getUnassignedTickets,
  getRecentUnassignedTickets,
  getCurrentUser,
  getCachedProjects,
  getCachedModules,
  getCachedDevelopers,
  getTicketHistory,
  getTicketHistoryCount,
} from './queries'

export type {
  TicketListItem,
  TicketListFilters,
  TicketListResult,
} from './queries'

export {
  updateTicketStatus,
  assignTicket,
  managerForwardToClient,
  managerReassignDeveloper,
  clientApproveTicket,
  clientReopenTicket,
  clearManagerAnalyticsCache,
  getTicketFormClients,
  getTicketFormProjects,
  getTicketFormModules,
} from './update'

export {
  addComment,
  getComments,
  getCommentsCount,
} from './comments'

export {
  startTimer,
  stopTimer,
  pauseTimer,
  resumeTimer,
  getActiveTimer,
  getTimeLogs,
  getTimeLogsBatch,
} from './timelogs'

export {
  getManagerAnalytics,
  getDeveloperAnalytics,
  getAnalyticsData,
  getWorklogSummary,
  getEmployeeProductivity,
  getCachedWorklogs,
  clearWorklogsCache,
  getPaginatedWorklogs,
} from './history'

export type { AttachmentWithUser } from '@/lib/types'
