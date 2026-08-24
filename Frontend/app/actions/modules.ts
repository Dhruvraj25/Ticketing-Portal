// ── THIS FILE HAS BEEN REFACTORED ───────────────────────────────────────────
// All exports have been moved to app/actions/modules/ for better maintainability.
// This file re-exports everything for backward compatibility.
// Import from '@/app/actions/modules' directly for new code.
// ============================================================================

export {
  // Queries
  getModules,
  getModuleById,
  getModulesByProjectIds,
  getModulesByProject,
  getModulesTicketStats,
  // CRUD
  createModule,
  updateModule,
  updateModuleStatus,
  archiveModule,
  deleteModule,
} from './modules/index'

export type {
  ModuleListFilters,
  ModuleListResult,
  ModuleListItem,
  ModuleTicketStats,
} from './modules/index'
