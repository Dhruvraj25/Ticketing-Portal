// ============================================================================
// PROJECT ACTIONS — Barrel Exports
// ============================================================================
// Maintains the same public API as the original monolithic projects.ts.
//
// NOTE: No 'use server' directive here. Each individual module file
// (queries.ts, crud.ts, assignments.ts, analytics.ts) has its own
// 'use server' directive. This barrel just re-exports their async
// server actions — Next.js would reject re-exports from a 'use server'
// barrel because it can't statically trace the original async-ness.
// ============================================================================

// Queries
export { getProjects, getProjectById, getProjectTicketStats, getProjectNames } from './queries'
export type { ProjectListFilters, ProjectListResult, ProjectListItem } from './queries'

// CRUD
export { createProject, updateProject, updateProjectStatus, archiveProject, deleteProject } from './crud'

// Assignments
export { assignClient, assignManager, assignDeveloper, removeDeveloper, getProjectDevelopers } from './assignments'

// Analytics
export { getProjectDetailAnalytics, getModuleAnalytics, getProjectTicketAnalytics } from './analytics'
