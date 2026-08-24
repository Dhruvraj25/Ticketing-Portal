// ============================================================================
// MODULE ACTIONS — Barrel Exports
// ============================================================================
// Maintains the same public API as the original monolithic modules.ts.
//
// NOTE: No 'use server' directive here. Each individual module file
// (queries.ts, crud.ts) has its own 'use server' directive. This barrel
// just re-exports their async server actions.
// ============================================================================

// Queries
export { getModules, getModuleById, getModulesByProjectIds, getModulesByProject, getModulesTicketStats } from './queries'
export type { ModuleListFilters, ModuleListResult, ModuleListItem, ModuleTicketStats } from './queries'

// CRUD
export { createModule, updateModule, updateModuleStatus, archiveModule, deleteModule } from './crud'
