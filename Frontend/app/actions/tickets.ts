// @ts-nocheck

// ── THIS FILE IS DEPRECATED ────────────────────────────────────────────────
// All exports have been moved to app/actions/tickets/ for better maintainability.
// This file re-exports everything for backward compatibility.
// Import from '@/app/actions/tickets' directly for new code.
// NOTE: No 'use server' directive — this is a barrel re-export file.
// The actual 'use server' functions live in the tickets/*.ts modules.

export {
  // Create
  createTicket,
  // Queries
  getTicketsList,
  getTicketById,
  getConsolidatedDashboardData,
  getTicketInsights,
  getDashboardStats,
  getUnassignedTickets,
  getRecentUnassignedTickets,
  getCurrentUser,
  getCachedProjects,
  getCachedModules,
  getCachedDevelopers,
  getTicketHistory,
  getTicketHistoryCount,
  // Update
  updateTicketStatus,
  updateTicketPriority,
  assignTicket,
  managerForwardToClient,
  managerReassignDeveloper,
  clientApproveTicket,
  clientReopenTicket,
  getTicketFormClients,
  getTicketFormProjects,
  getTicketFormModules,
  getModulesForClient,
  // Comments
  addComment,
  getComments,
  getCommentsCount,
  // Time Logs
  startTimer,
  getTimerTickets,
  getTicketTimerState,
  getMyTimerState,
  getMyTimeEntriesForExport,
  stopTimer,
  pauseTimer,
  resumeTimer,
  getActiveTimer,
  getTimeLogs,
  getTimeLogsBatch,
  // Analytics & History
  getManagerAnalytics,
  getDeveloperAnalytics,
  getAnalyticsData,
  getWorklogSummary,
  getEmployeeProductivity,
  getCachedWorklogs,
  clearWorklogsCache,
  getPaginatedWorklogs,
  getTicketWorkActivity,
  // Backward-compat alias
  getTickets,
} from './tickets/index'

export type {
  TicketListItem,
  TicketInsights,
  TicketListFilters,
  TicketListResult,
  AttachmentWithUser,
} from './tickets/index'
