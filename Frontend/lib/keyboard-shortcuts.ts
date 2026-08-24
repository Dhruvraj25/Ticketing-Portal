import type { UserRole } from './types'

/**
 * Global keyboard-shortcut configuration for SupportHub.
 *
 * Everything here is ROLE-GATED to mirror the sidebar's role-based navigation
 * (components/dashboard/sidebar.tsx → navItemsByRole). A shortcut that targets
 * a page the current role cannot access is simply absent from the role's map,
 * so the provider does nothing instead of navigating to a forbidden page.
 */

export interface ShortcutDest {
  label: string
  href: string
}

/** G then <key> navigation targets (GitHub/Jira-style), aligned with the sidebar. */
export const G_NAV_BY_ROLE: Record<UserRole, Record<string, ShortcutDest>> = {
  admin: {
    d: { label: 'Dashboard', href: '/dashboard' },
    t: { label: 'Tickets', href: '/dashboard/tickets' },
    c: { label: 'Create a new ticket', href: '/dashboard/tickets/new' },
    p: { label: 'Projects', href: '/dashboard/projects' },
    m: { label: 'Modules', href: '/dashboard/modules' },
    w: { label: 'Worklogs', href: '/dashboard/worklogs' },
    n: { label: 'Notifications', href: '/dashboard/notifications' },
    a: { label: 'Analytics', href: '/dashboard/analytics' },
    s: { label: 'Settings', href: '/dashboard/admin' },
    h: { label: 'Help & Support', href: '/dashboard/help' },
  },
  project_manager: {
    d: { label: 'Dashboard', href: '/dashboard' },
    t: { label: 'Tickets', href: '/dashboard/tickets' },
    c: { label: 'Create a new ticket', href: '/dashboard/tickets/new' },
    p: { label: 'Projects', href: '/dashboard/projects' },
    m: { label: 'Modules', href: '/dashboard/modules' },
    r: { label: 'Team', href: '/dashboard/team' },
    n: { label: 'Notifications', href: '/dashboard/notifications' },
    h: { label: 'Help & Support', href: '/dashboard/help' },
  },
  developer: {
    d: { label: 'Dashboard', href: '/dashboard' },
    t: { label: 'My Tickets', href: '/dashboard/tickets' },
    r: { label: 'Resource Dashboard', href: '/dashboard/resources' },
    n: { label: 'Notifications', href: '/dashboard/notifications' },
    h: { label: 'Help & Support', href: '/dashboard/help' },
  },
  client: {
    d: { label: 'Dashboard', href: '/dashboard' },
    t: { label: 'My Tickets', href: '/dashboard/tickets' },
    c: { label: 'Create a new ticket', href: '/dashboard/tickets/new' },
    p: { label: 'My Projects', href: '/dashboard/projects' },
    n: { label: 'Notifications', href: '/dashboard/notifications' },
    h: { label: 'Help & Support', href: '/dashboard/help' },
  },
}

export interface ShortcutPage {
  /** Stable key used to look up the lucide icon in the command palette. */
  key: string
  label: string
  href: string
  keywords?: string
}

/** Pages available to each role via the Global Search (Ctrl+K) palette. */
export const SHORTCUT_PAGES_BY_ROLE: Record<UserRole, ShortcutPage[]> = {
  admin: [
    { key: 'dashboard', label: 'Dashboard', href: '/dashboard' },
    { key: 'onboarding', label: 'Customer Onboarding', href: '/dashboard/customer-onboarding', keywords: 'onboard clients' },
    { key: 'projects', label: 'Projects', href: '/dashboard/projects' },
    { key: 'modules', label: 'Modules', href: '/dashboard/modules' },
    { key: 'tickets', label: 'Tickets', href: '/dashboard/tickets', keywords: 'my tickets support' },
    { key: 'create-ticket', label: 'Create Ticket', href: '/dashboard/tickets/new', keywords: 'new ticket raise' },
    { key: 'worklogs', label: 'Worklogs', href: '/dashboard/worklogs', keywords: 'time logs hours tracking' },
    { key: 'wallets', label: 'Support Wallets', href: '/dashboard/wallets', keywords: 'support wallet hours' },
    { key: 'analytics', label: 'Analytics', href: '/dashboard/analytics' },
    { key: 'reports', label: 'Report Center', href: '/dashboard/reports/view', keywords: 'reports' },
    { key: 'reviews', label: 'Reviews', href: '/dashboard/reviews' },
    { key: 'customer-reviews', label: 'Customer Reviews', href: '/dashboard/reports/customer-reviews' },
    { key: 'notifications', label: 'Notifications', href: '/dashboard/notifications', keywords: 'alerts bell' },
    { key: 'users', label: 'Users', href: '/dashboard/admin/users', keywords: 'user management team members' },
    { key: 'teams', label: 'Teams', href: '/dashboard/admin/teams', keywords: 'teams integration' },
    { key: 'settings', label: 'Settings', href: '/dashboard/admin', keywords: 'system settings admin' },
    { key: 'help', label: 'Help & Support', href: '/dashboard/help', keywords: 'help shortcuts docs' },
  ],
  project_manager: [
    { key: 'dashboard', label: 'Dashboard', href: '/dashboard' },
    { key: 'onboarding', label: 'Customer Onboarding', href: '/dashboard/customer-onboarding', keywords: 'onboard clients' },
    { key: 'projects', label: 'Projects', href: '/dashboard/projects' },
    { key: 'modules', label: 'Modules', href: '/dashboard/modules' },
    { key: 'tickets', label: 'Tickets', href: '/dashboard/tickets', keywords: 'my tickets support' },
    { key: 'create-ticket', label: 'Create Ticket', href: '/dashboard/tickets/new', keywords: 'new ticket raise' },
    { key: 'assignments', label: 'Assignments', href: '/dashboard/assignments', keywords: 'assign resources' },
    { key: 'review-queue', label: 'Review Queue', href: '/dashboard/review-queue', keywords: 'reviews approvals' },
    { key: 'team', label: 'Team', href: '/dashboard/team', keywords: 'resources developers' },
    { key: 'wallets', label: 'Support Wallets', href: '/dashboard/wallets', keywords: 'support wallet hours' },
    { key: 'reports', label: 'Report Center', href: '/dashboard/reports/view', keywords: 'reports' },
    { key: 'reviews', label: 'Reviews', href: '/dashboard/reviews' },
    { key: 'customer-reviews', label: 'Customer Reviews', href: '/dashboard/reports/customer-reviews' },
    { key: 'notifications', label: 'Notifications', href: '/dashboard/notifications', keywords: 'alerts bell' },
    { key: 'help', label: 'Help & Support', href: '/dashboard/help', keywords: 'help shortcuts docs' },
  ],
  developer: [
    { key: 'dashboard', label: 'Dashboard', href: '/dashboard' },
    { key: 'tickets', label: 'My Tickets', href: '/dashboard/tickets', keywords: 'tickets support' },
    { key: 'time-tracking', label: 'Time Tracking', href: '/dashboard/time-tracking', keywords: 'timer worklogs hours' },
    { key: 'resources', label: 'Resource Dashboard', href: '/dashboard/resources', keywords: 'my performance stats' },
    { key: 'notifications', label: 'Notifications', href: '/dashboard/notifications', keywords: 'alerts bell' },
    { key: 'profile', label: 'Profile', href: '/dashboard/profile', keywords: 'account me' },
    { key: 'help', label: 'Help & Support', href: '/dashboard/help', keywords: 'help shortcuts docs' },
  ],
  client: [
    { key: 'dashboard', label: 'Dashboard', href: '/dashboard' },
    { key: 'projects', label: 'My Projects', href: '/dashboard/projects' },
    { key: 'create-ticket', label: 'Create Ticket', href: '/dashboard/tickets/new', keywords: 'new ticket raise' },
    { key: 'tickets', label: 'My Tickets', href: '/dashboard/tickets', keywords: 'tickets support' },
    { key: 'support-wallet', label: 'Support Wallet', href: '/dashboard/support-wallet', keywords: 'hours balance' },
    { key: 'notifications', label: 'Notifications', href: '/dashboard/notifications', keywords: 'alerts bell' },
    { key: 'profile', label: 'Profile', href: '/dashboard/profile', keywords: 'account me' },
    { key: 'help', label: 'Help & Support', href: '/dashboard/help', keywords: 'help shortcuts docs' },
  ],
}

