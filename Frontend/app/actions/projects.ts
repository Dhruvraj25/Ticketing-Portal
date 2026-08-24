// @ts-nocheck

// ── THIS FILE HAS BEEN REFACTORED ───────────────────────────────────────────
// All exports have been moved to app/actions/projects/ for better maintainability.
// This file re-exports everything for backward compatibility.
// Import from '@/app/actions/projects' directly for new code.
// NOTE: No 'use server' directive — this is a barrel re-export file.
// The actual 'use server' functions live in the projects/*.ts modules.
// ============================================================================

export {
  // Queries
  getProjects,
  getProjectById,
  getProjectTicketStats,
  getProjectNames,
  // CRUD
  createProject,
  updateProject,
  updateProjectStatus,
  archiveProject,
  deleteProject,
  // Assignments
  assignClient,
  assignManager,
  assignDeveloper,
  removeDeveloper,
  getProjectDevelopers,
  // Analytics
  getProjectDetailAnalytics,
  getModuleAnalytics,
  getProjectTicketAnalytics,
} from './projects/index'

export type {
  ProjectListFilters,
  ProjectListResult,
  ProjectListItem,
} from './projects/index'
