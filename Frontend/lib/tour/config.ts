import type { UserRole } from '@/lib/types'
import type { FeatureTourConfig, TourConfig, TourStep } from './types'

/**
 * ────────────────────────────────────────────────────────────────────────────
 * Product Tour configuration
 * ────────────────────────────────────────────────────────────────────────────
 *
 * - Bump `TOUR_VERSION` when a release changes the tour meaningfully.
 *   Users who already saw an older version will be offered the new one again.
 * - Add a new role: create a `TourConfig` and register it in `ROLE_TOURS`.
 * - Add a new page tour: append a path → steps entry in `PAGE_TOURS`.
 * - Add a feature announcement: push a `FeatureTourConfig` into `FEATURE_TOURS`.
 *
 * Steps reference `[data-tour="..."]` attributes sprinkled across the UI.
 */

export const TOUR_VERSION = '1.0.0'

// ─── Small helpers to keep step declarations terse ──────────────────────────
const el = (selector: string, side?: TourStep['side'], align?: TourStep['align']) =>
  ({ element: selector, side, align }) as Pick<TourStep, 'element' | 'side' | 'align'>

const go = (href: string, selector: string, side?: TourStep['side'], align?: TourStep['align']) =>
  ({ href, element: selector, side, align }) as Pick<TourStep, 'href' | 'element' | 'side' | 'align'>
const DONE_STEP: TourStep = {
  id: 'done',
  title: "You're all set! 🎉",
  description:
    'You now know your way around Support Hero. Use the Help Center any time — or restart this tour from your profile or the help page.',
}

// ═══════════════════════════════════════════════════════════════════════════
// ROLE-BASED TOURS
// ═══════════════════════════════════════════════════════════════════════════

export const CLIENT_TOUR: TourConfig = {
  id: 'client',
  title: 'Client Tour',
  description: 'Everything you need to submit and track support tickets.',
  steps: [
    {
      id: 'client-dashboard',
      ...go('/dashboard', '[data-tour="dashboard-kpis"]', 'bottom'),
      title: 'Your Dashboard',
      description:
        'This is your command center. The KPI cards show ticket volume and open items at a glance — click any card to drill into a filtered list.',
    },
    {
      id: 'client-create-entry',
      ...el('[data-tour="nav-new-ticket"]', 'right'),
      title: 'Create a Ticket',
      description:
        "Need help? Hit \"Create Ticket\" in the sidebar to open a new support request. It only takes a minute.",
    },
    {
      id: 'client-title',
      ...go('/dashboard/tickets/new', '#title', 'bottom'),
      title: 'Title your request',
      description:
        'Start with a short, descriptive title — like “Login page throws an error on Safari”. A clear title helps our team route your request instantly.',
    },
    {
      id: 'client-project',
      // Highlight the actual select trigger, not the wrapping div.
      ...el('[data-tour="ticket-project"] [data-slot="select-trigger"]', 'bottom'),
      title: 'Select your Project',
      description:
        'Choose the project where this issue occurred. The project determines which team receives and manages your ticket.',
    },
    {
      id: 'client-module',
      ...el('[data-tour="ticket-module"] [data-slot="select-trigger"]', 'bottom'),
      title: 'Pick the Module',
      description:
        'Narrow it down to the affected module — e.g. “Payments” or “User Portal”. Module level detail means faster triage.',
    },
    {
      id: 'client-priority',
      ...el('[data-tour="ticket-priority"] [data-slot="select-trigger"]', 'bottom'),
      title: 'Set the Priority',
      description:
        'How urgent is this? Use “Critical” only for production-blocking issues. Honest priorities keep the queue fair for everyone.',
    },
    {
      id: 'client-attachments',
      // Highlight the dropzone itself (role=button), not the wrapper.
      ...el('[data-tour="ticket-attachments"] [role="button"]', 'bottom'),
      title: 'Attach evidence',
      description:
        'Drag in screenshots, error logs or documents (up to 10 MB each). Visual context helps us resolve issues up to 2× faster.',
    },
    {
      id: 'client-submit',
      // The Submit button only renders on the review step, so fall back to the
      // always-present “Next: Review” action on the details step.
      ...el('[data-tour="ticket-submit"], [data-tour="ticket-next-review"]', 'top'),
      title: 'Submit your ticket',
      description:
        'Complete the form, hit “Next: Review” to check everything, then “Submit Ticket” on the final screen. You’ll get a ticket number and email updates at every step of the journey.',
    },
    {
      id: 'client-track',
      ...go('/dashboard/tickets', '[data-tour="ticket-list"]', 'bottom'),
      title: 'Track your ticket',
      description:
        'Back on My Tickets, every request shows its live status — from “New” through “In Progress” to “Resolved”. Click a ticket to open the full timeline.',
    },
    {
      id: 'client-wallet',
      ...go('/dashboard/support-wallet', '[data-tour="wallet-card"]', 'bottom'),
      // The wallet page is server-rendered (wallet + transactions arrive with
      // the RSC payload, so by the time the route commits the card exists in
      // BOTH the has-wallet and no-wallet states). A short wait is enough — a
      // long one only delays the tour when something is genuinely missing.
      waitForElement: 4_000,
      title: 'Support Hours',
      description:
        'Your Support Wallet shows the hours you have under contract and how many remain. When it runs low you’ll be notified before work slows down.',
    },
    {
      id: 'client-notifications',
      ...go('/dashboard/notifications', '[data-tour="notifications-list"]', 'bottom'),
      title: 'Notifications',
      description:
        'Every status change, estimate approval and reply lands here. Use the bell in the sidebar to check unread updates from any page.',
    },
    {
      id: 'client-help',
      ...go('/dashboard/help', '[data-tour="help-hero"]', 'bottom'),
      title: 'Help Center',
      description:
        'Guides, FAQs, status explainers and release notes — all in one place. You can restart this tour any time from the Help Center.',
    },
    {
      id: 'client-profile',
      ...go('/dashboard/profile', '[data-tour="profile-card"]', 'bottom'),
      title: 'Your Profile',
      description:
        'Keep your details and preferences up to date here — and restart this product tour any time from the Help Center or your profile.',
    },
    DONE_STEP,
  ],
}

export const MANAGER_TOUR: TourConfig = {
  id: 'project_manager',
  title: 'Manager Tour',
  description: 'Assign work, approve estimates and monitor your team.',
  steps: [
    {
      id: 'manager-dashboard',
      ...go('/dashboard', '[data-tour="dashboard-kpis"]', 'bottom'),
      title: 'Your Dashboard',
      description:
        'A live snapshot of ticket volume, open work and pending estimates across all projects you manage.',
    },
    {
      id: 'manager-tickets',
      ...go('/dashboard/tickets', '[data-tour="ticket-list"]', 'bottom'),
      title: 'Incoming Tickets',
      description:
        'New client requests land here. Use the filters to isolate unassigned work, pending estimates or specific priorities.',
    },
    {
      id: 'manager-assignment',
      ...go('/dashboard/assignments', '[data-tour="assignments-panel"]', 'bottom'),
      title: 'Assignment',
      description:
        'Drag unassigned tickets onto the right developer. Assignment balances workload and keeps SLAs on track.',
    },
    {
      id: 'manager-estimates',
      ...go('/dashboard/review-queue', '[data-tour="estimate-approval"], [data-tour="review-queue"]', 'bottom'),
      title: 'Estimate Approval',
      description:
        'Resources submit hour estimates here. Approve, request changes, or let the auto-approval window lapse — the choice is yours.',
    },
    {
      id: 'manager-additional-hours',
      // The Additional Hours card lives on ticket detail pages. We land on the
      // tickets list first; the provider opens the first ticket automatically
      // (`needsTicketContext`) so the real card is always highlighted.
      ...go('/dashboard/tickets', '[data-tour="additional-hours"], [data-tour="estimate-section"]', 'bottom'),
      needsTicketContext: true,
      title: 'Additional Hours',
      description:
        'When a ticket exceeds its estimate, a request for additional hours appears on the ticket. Approve it to keep the work moving.',
    },
    {
      id: 'manager-reports',
      ...go('/dashboard/reports/view', '[data-tour="reports-center"]', 'bottom'),
      title: 'Reports',
      description:
        'Exportable reports for ticket summaries, resolutions, workloads and wallet usage — perfect for monthly reviews.',
    },
    {
      id: 'manager-analytics',
      ...go('/dashboard/analytics', '[data-tour="analytics-charts"]', 'bottom'),
      title: 'Analytics',
      description:
        'Trend charts show ticket velocity, team throughput and backlogs over time, so you can spot problems before they escalate.',
    },
    {
      id: 'manager-notifications',
      ...go('/dashboard/notifications', '[data-tour="notifications-list"]', 'bottom'),
      title: 'Notifications',
      description:
        'Stay on top of estimate deadlines, approvals and escalations. Everything that needs your attention shows up here.',
    },
    {
      id: 'manager-help',
      ...go('/dashboard/help', '[data-tour="help-hero"]', 'bottom'),
      title: 'Help Center',
      description:
        'Manager guides, ticket-lifecycle explainers and FAQs. Restart this tour any time from the Help Center.',
    },
    DONE_STEP,
  ],
}

export const RESOURCE_TOUR: TourConfig = {
  id: 'developer',
  title: 'Resource Tour',
  description: 'Work your queue and track time like a pro.',
  steps: [
    {
      id: 'resource-dashboard',
      ...go('/dashboard', '[data-tour="dashboard-kpis"]', 'bottom'),
      title: 'Your Dashboard',
      description:
        'A quick overview of the work in your queue — assigned tickets, active timers and recent activity.',
    },
    {
      id: 'resource-tickets',
      ...go('/dashboard/tickets', '[data-tour="ticket-list"]', 'bottom'),
      title: 'Assigned Tickets',
      description:
        'Tickets assigned to you are listed here. Open any ticket to see the full thread, estimate and attachments.',
    },
    {
      id: 'resource-start-work',
      ...go('/dashboard/time-tracking', '[data-tour="time-tracker"]', 'bottom'),
      title: 'Start Work',
      description:
        'Pick a ticket, add a short note and hit “Start Timer”. The clock runs automatically and logs billable time to that ticket.',
    },
    {
      id: 'resource-pause-work',
      // Start / Pause / Stop / Complete live on the ticket page for resources.
      ...go('/dashboard/tickets', '[data-tour="ticket-status-actions"]', 'bottom'),
      needsTicketContext: true,
      title: 'Pause Work',
      description:
        'Need a break? Open your assigned ticket and hit “Pause” — the timer stops without losing the session. “Resume” picks up right where you left off.',
    },
    {
      id: 'resource-resolve',
      ...go('/dashboard/tickets', '[data-tour="ticket-status-actions"]', 'bottom'),
      needsTicketContext: true,
      title: 'Resolve the Ticket',
      description:
        'When the work is done, stop the timer and hit “Mark Completed”. The ticket moves to the next stage automatically.',
    },
    {
      id: 'resource-worklogs',
      // Developers can see their own logged sessions here (the admin-only
      // /dashboard/worklogs page redirects developers away).
      ...go('/dashboard/time-tracking', '[data-tour="time-tracker-entries"]', 'bottom'),
      title: 'Worklogs',
      description:
        'Every session you log appears here with billable markers — full transparency on the effort you put in.',
    },
    {
      id: 'resource-notifications',
      ...go('/dashboard/notifications', '[data-tour="notifications-list"]', 'bottom'),
      title: 'Notifications',
      description:
        'New assignments, revision requests and approvals land here so you never miss a handoff.',
    },
    {
      id: 'resource-help',
      ...go('/dashboard/help', '[data-tour="help-hero"]', 'bottom'),
      title: 'Help Center',
      description:
        'Resource guides, time-tracking tips and FAQs. You can restart this tour any time from the Help Center.',
    },
    DONE_STEP,
  ],
}

export const ADMIN_TOUR: TourConfig = {
  id: 'admin',
  title: 'Admin Tour',
  description: 'Configure the platform, onboard customers and manage users.',
  steps: [
    {
      id: 'admin-dashboard',
      ...go('/dashboard', '[data-tour="dashboard-kpis"]', 'bottom'),
      title: 'Your Dashboard',
      description:
        'The system-wide view — ticket volume, project health and pending work across every customer.',
    },
    {
      id: 'admin-onboarding',
      ...go('/dashboard/customer-onboarding', '[data-tour="customer-onboarding"]', 'bottom'),
      title: 'Customer Onboarding',
      description:
        'Spin up a new customer in one flow — project, modules, users and support wallet are created together.',
    },
    {
      id: 'admin-projects',
      ...go('/dashboard/projects', '[data-tour="projects-list"]', 'bottom'),
      title: 'Projects',
      description:
        'Manage every project, its manager and lifecycle status from a single list.',
    },
    {
      id: 'admin-modules',
      ...go('/dashboard/modules', '[data-tour="modules-list"]', 'bottom'),
      title: 'Modules',
      description:
        'Define the modules tickets attach to — they keep requests organized per project.',
    },
    {
      id: 'admin-users',
      ...go('/dashboard/admin/users', '[data-tour="users-table"]', 'bottom'),
      title: 'Users',
      description:
        'Create and manage accounts, assign roles (Client, Manager, Resource, Admin) and control access.',
    },
    {
      id: 'admin-wallets',
      ...go('/dashboard/wallets', '[data-tour="wallets-list"]', 'bottom'),
      title: 'Support Hours',
      description:
        'Every client’s support wallet — purchased hours, consumption and contract status — in one place.',
    },
    {
      id: 'admin-reports',
      ...go('/dashboard/reports/view', '[data-tour="reports-center"]', 'bottom'),
      title: 'Reports',
      description:
        'System-wide reports on tickets, resolutions, workload and wallet usage, exportable for leadership.',
    },
    {
      id: 'admin-settings',
      ...go('/dashboard/admin', '[data-tour="system-settings"]', 'bottom'),
      title: 'System Settings',
      description:
        'Branding, user statistics and platform configuration live here.',
    },
    {
      id: 'admin-help',
      ...go('/dashboard/help', '[data-tour="help-hero"]', 'bottom'),
      title: 'Help Center',
      description:
        'Admin guides and reference docs. Restart this tour any time from the Help Center.',
    },
    DONE_STEP,
  ],
}

/**
 * Role → tour mapping. Add a new role here and in `lib/types.ts` `UserRole`
 * to ship a new tour without touching any other logic.
 */
export const ROLE_TOURS: Record<UserRole, TourConfig> = {
  client: CLIENT_TOUR,
  project_manager: MANAGER_TOUR,
  developer: RESOURCE_TOUR,
  admin: ADMIN_TOUR,
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE-SPECIFIC TOURS (elements available on that page only)
//
// “Explore This Page” (Help Hub) loads the entry matching the current route
// and walks the user through EVERY meaningful component in visual order:
// header → actions → KPIs → search/filters → main content → secondary
// sections → bottom controls. Steps whose element is role-conditional or
// data-dependent are skipped gracefully by the provider when absent, so the
// same config serves Client / Manager / Resource / Admin alike.
//
// Selector rules: unique per page, semantic, stable, never index-based.
// ═══════════════════════════════════════════════════════════════════════════

/** Shared completion step for every page walkthrough. */
function pageDone(pageName: string): TourStep {
  return {
    id: 'page-done',
    title: "You're all set! 🎉",
    description: `You've explored the main features available on this page (${pageName}). Open Help → Explore This Page any time to walk through it again.`,
  }
}

export const PAGE_TOURS: Record<string, TourStep[]> = {
  // ───────────────────────────────────────────────────────────────────────────
  // Dashboard — header, KPIs, actions, recent tickets, role widgets
  // ───────────────────────────────────────────────────────────────────────────
  '/dashboard': [
    {
      id: 'page-dashboard-header',
      ...el('[data-tour="dashboard-header"]', 'bottom'),
      title: 'Dashboard header',
      description:
        'Your command center. The subtitle adapts to your role — client, manager, resource or admin — and the current date is always shown here.',
    },
    {
      id: 'page-dashboard-kpis',
      ...el('[data-tour="dashboard-kpis"]', 'bottom'),
      title: 'Key performance indicators',
      description:
        'These cards summarize ticket volume — total, open, in progress and resolved. Managers and admins also see pending revisions and estimates. Click any card to open the matching filtered view.',
    },
    {
      id: 'page-dashboard-new-ticket',
      ...el('[data-tour="new-ticket-button"]', 'bottom'),
      title: 'New Ticket',
      description: 'The fastest way to open a support request — one click away, right from the header.',
    },
    {
      id: 'page-dashboard-recent-tickets',
      ...el('[data-tour="dashboard-recent-tickets"]', 'top'),
      title: 'Recent tickets',
      description:
        'Your most recent tickets with their live status. Click “View all” to open the full ticket list, or click a ticket to jump straight into it.',
    },
    {
      id: 'page-dashboard-sidebar-timer',
      ...el('[data-tour="sidebar-active-timer"]', 'left'),
      title: 'Active timer',
      description:
        'Resources see their running timer here. Click “View Timer” to jump to time tracking and manage the session. (Shown for resource users.)',
      waitForElement: 3_000,
    },
    {
      id: 'page-dashboard-sidebar-projects',
      ...el('[data-tour="sidebar-active-projects"]', 'left'),
      title: 'Active projects',
      description:
        'A snapshot of the projects you are part of. Click any project to open it, or “View all” to browse every project.',
      waitForElement: 3_000,
    },
    {
      id: 'page-dashboard-sidebar-unassigned',
      ...el('[data-tour="sidebar-unassigned"]', 'left'),
      title: 'Unassigned tickets',
      description:
        'Managers and admins see how many tickets still need a developer. Click “Manage Assignments” to route them. (Shown for manager/admin users.)',
      waitForElement: 3_000,
    },
    {
      id: 'page-dashboard-sidebar-team',
      ...el('[data-tour="sidebar-team"]', 'left'),
      title: 'Team',
      description:
        'The number of active developers on your team. Click “View Team” to open the team overview. (Shown for manager/admin users.)',
      waitForElement: 3_000,
    },
    {
      id: 'page-dashboard-sidebar-quick-actions',
      ...el('[data-tour="sidebar-quick-actions"]', 'left'),
      title: 'Quick actions',
      description:
        'Clients get a shortcut here to submit a new support ticket without navigating away from the dashboard.',
      waitForElement: 3_000,
    },
    {
      id: 'page-dashboard-sidebar-analytics',
      ...el('[data-tour="sidebar-project-analytics"]', 'left'),
      title: 'Project analytics',
      description:
        'Managers and admins get per-project ticket health at a glance — open, in progress, resolved and closed counts. (Shown for manager/admin users.)',
      waitForElement: 3_000,
    },
    pageDone('Dashboard'),
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // Create Ticket — full multi-step form
  // ───────────────────────────────────────────────────────────────────────────
  '/dashboard/tickets/new': [
    {
      id: 'page-create-header',
      ...el('[data-tour="create-ticket-header"]', 'bottom'),
      title: 'Create Ticket',
      description:
        'Submit a new support request. Use the back arrow to return to your tickets at any time.',
    },
    {
      id: 'page-create-stepper',
      ...el('[data-tour="create-ticket-stepper"]', 'bottom'),
      title: 'Two-step form',
      description:
        'Fill in the ticket details first, then review everything before submitting. You can move between steps using these controls.',
    },
    {
      id: 'page-create-title',
      ...el('#title', 'bottom'),
      title: 'Ticket title',
      description:
        'Give your request a short, descriptive title — like “Login page throws an error on Safari”. A clear title helps our team route your request instantly.',
    },
    {
      id: 'page-create-description',
      ...el('[data-tour="create-ticket-description"]', 'bottom'),
      title: 'Description',
      description:
        'Explain the issue in detail — what you did, what you expected, and what happened instead. Rich text formatting is supported.',
    },
    {
      id: 'page-create-attachments',
      ...el('[data-tour="ticket-attachments"] [role="button"]', 'bottom'),
      title: 'Attachments',
      description:
        'Drag in screenshots, error logs or documents (up to 10 MB each). Visual context helps us resolve issues up to 2× faster.',
    },
    {
      id: 'page-create-category',
      ...el('[data-tour="ticket-category"] [data-slot="select-trigger"]', 'bottom'),
      title: 'Category',
      description:
        'Categorize the request (general, bug, feature request…) so it reaches the right specialist.',
    },
    {
      id: 'page-create-priority',
      ...el('[data-tour="ticket-priority"] [data-slot="select-trigger"]', 'bottom'),
      title: 'Priority',
      description:
        'How urgent is this? Use “Critical” only for production-blocking issues. Honest priorities keep the queue fair for everyone.',
    },
    {
      id: 'page-create-project',
      ...el('[data-tour="ticket-project"] [data-slot="select-trigger"]', 'bottom'),
      title: 'Project',
      description:
        'Choose the project where this issue occurred. The project determines which team receives and manages your ticket.',
    },
    {
      id: 'page-create-module',
      ...el('[data-tour="ticket-module"] [data-slot="select-trigger"]', 'bottom'),
      title: 'Module',
      description:
        'Narrow it down to the affected module — e.g. “Payments” or “User Portal”. Module level detail means faster triage.',
    },
    {
      id: 'page-create-environment',
      ...el('[data-tour="ticket-environment"] [data-slot="select-trigger"]', 'bottom'),
      title: 'Environment',
      description:
        'Where did the issue happen? Production, staging, development — the right environment saves the team a lot of guesswork.',
    },
    {
      id: 'page-create-additional-info',
      ...el('[data-tour="ticket-additional-info"]', 'bottom'),
      title: 'Additional information',
      description:
        'Optional extra context — steps to reproduce, error messages or anything else that helps us understand the issue faster.',
    },
    {
      id: 'page-create-form-actions',
      ...el('[data-tour="ticket-form-actions"]', 'top'),
      title: 'Save draft & continue',
      description:
        '“Save Draft” keeps your work in this browser so you can finish later. “Next: Review” validates the form and takes you to the review step.',
    },
    {
      id: 'page-create-review',
      ...el('[data-tour="ticket-review-summary"], [data-tour="ticket-submit"], [data-tour="ticket-next-review"]', 'top'),
      title: 'Review & submit',
      description:
        'On the review step you can double-check everything, go back to edit, and finally hit “Submit Ticket” — you’ll get a ticket number instantly.',
    },
    pageDone('Create Ticket'),
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // Tickets list — header, KPIs, search, filters, list, pagination, panel
  // ───────────────────────────────────────────────────────────────────────────
  '/dashboard/tickets': [
    {
      id: 'page-tickets-header',
      ...el('[data-tour="tickets-header"]', 'bottom'),
      title: 'Tickets header',
      description:
        'This is where you track, manage and review support tickets. The badge shows your total ticket count.',
    },
    {
      id: 'page-tickets-new-ticket',
      ...el('[data-tour="tickets-new-ticket"]', 'bottom'),
      title: 'New Ticket',
      description: 'Open a new support request — the quickest way to get help.',
    },
    {
      id: 'page-tickets-kpis',
      ...el('[data-tour="ticket-kpis"]', 'bottom'),
      title: 'Ticket statistics',
      description:
        'Total, open, in progress and closed counts at a glance. Click a status pill below to filter the list by the same state.',
    },
    {
      id: 'page-tickets-search',
      ...el('[data-tour="ticket-search"]', 'bottom'),
      title: 'Search',
      description: 'Search by title, ticket ID or description. Results update as you type.',
    },
    {
      id: 'page-tickets-status-pills',
      ...el('[data-tour="ticket-status-pills"]', 'bottom'),
      title: 'Status shortcuts',
      description:
        'One-click filters for All, New Request, Work in Progress, Manager Review and Completed — each with its current count.',
    },
    {
      id: 'page-tickets-view-toggle',
      ...el('[data-tour="ticket-view-toggle"]', 'bottom'),
      title: 'List / grid view',
      description: 'Switch between the compact list and the visual grid layout. Your preference is remembered in the URL.',
    },
    {
      id: 'page-tickets-filter-toggle',
      ...el('[data-tour="ticket-filter-toggle"]', 'bottom'),
      title: 'Filters',
      description: 'Open the filter panel to narrow by status, priority or project. An indicator dot shows when filters are active.',
    },
    {
      id: 'page-tickets-filters',
      ...el('[data-tour="ticket-filters"]', 'bottom'),
      title: 'Filter panel',
      description:
        'Combine status, priority and project filters to slice the queue exactly the way you need it. “Clear” resets everything.',
    },
    {
      id: 'page-tickets-list',
      ...el('[data-tour="ticket-list"]', 'bottom'),
      title: 'Ticket list',
      description:
        'Every ticket with its live status, priority and key details. Click any ticket to open the full detail view with the whole conversation.',
    },
    {
      id: 'page-tickets-pagination',
      ...el('[data-tour="ticket-pagination"]', 'bottom'),
      title: 'Pagination',
      description: 'Browse through large queues page by page. The counter shows where you are and how many tickets exist in total.',
    },
    {
      id: 'page-tickets-right-panel',
      ...el('[data-tour="tickets-right-panel"]', 'left'),
      title: 'Side panel',
      description:
        'Quick actions, analytics snapshots and shortcuts to assignments, reports, time tracking and projects — role aware and always one click away.',
    },
    pageDone('My Tickets'),
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // Ticket detail — dynamic route, role-conditional sections skip gracefully
  // ───────────────────────────────────────────────────────────────────────────
  '/dashboard/tickets/[id]': [
    {
      id: 'page-ticket-detail-back',
      ...el('[data-tour="ticket-back-nav"]', 'bottom'),
      title: 'Back to tickets',
      description: 'Return to the full ticket list whenever you need to switch context.',
    },
    {
      id: 'page-ticket-detail-header',
      ...el('[data-tour="ticket-detail-header"]', 'bottom'),
      title: 'Ticket status & details',
      description:
        'The ticket number, live status, priority and category stay pinned at the top — this is the source of truth for where the request stands.',
    },
    {
      id: 'page-ticket-detail-description',
      ...el('[data-tour="ticket-description"]', 'bottom'),
      title: 'Description',
      description: 'The original request in full — everything the team knows about the problem at a glance.',
    },
    {
      id: 'page-ticket-detail-status-actions',
      ...el('[data-tour="ticket-status-actions"]', 'bottom'),
      title: 'Work controls',
      description:
        'Resources can start, pause and stop their timer here, then mark the ticket completed when the work is done. (Shown for resource users.)',
      waitForElement: 3_000,
    },
    {
      id: 'page-ticket-detail-estimate',
      ...el('[data-tour="estimate-section"]', 'bottom'),
      title: 'Estimate',
      description:
        'The estimated hours and completion date for this request. Clients can review and approve estimates here; managers can submit them. (Shown for clients, managers and admins.)',
      waitForElement: 3_000,
    },
    {
      id: 'page-ticket-detail-additional-hours',
      ...el('[data-tour="additional-hours"]', 'bottom'),
      title: 'Additional hours',
      description:
        'When a ticket exceeds its estimate, a request for additional hours appears here. Approve it to keep the work moving. (Shown when relevant.)',
      waitForElement: 3_000,
    },
    {
      id: 'page-ticket-detail-manager-review',
      ...el('[data-tour="ticket-manager-review"]', 'bottom'),
      title: 'Manager review',
      description:
        'When a resource marks a ticket resolved, managers and admins review the work here — approve it, or send it back for changes. (Shown for manager/admin users.)',
      waitForElement: 3_000,
    },
    {
      id: 'page-ticket-detail-revision-request',
      ...el('[data-tour="ticket-revision-request"]', 'bottom'),
      title: 'Request a revision',
      description:
        'Need changes before this ticket is done? Managers and admins can request a revision with clear notes. (Shown for manager/admin users.)',
      waitForElement: 3_000,
    },
    {
      id: 'page-ticket-detail-revision-approval',
      ...el('[data-tour="ticket-revision-approval-card"], [data-tour="ticket-revision-approval"]', 'bottom'),
      title: 'Revision approval',
      description:
        'Pending revision requests from clients land here so managers and admins can approve or reject them. (Shown when pending.)',
      waitForElement: 3_000,
    },
    {
      id: 'page-ticket-detail-client-review',
      ...el('[data-tour="ticket-review-form"], [data-tour="ticket-review-display"]', 'bottom'),
      title: 'Rate your experience',
      description:
        'Once a ticket is closed, clients can rate the resolution and leave feedback — it drives the review analytics shown to managers. (Shown for clients on closed tickets.)',
      waitForElement: 3_000,
    },
    {
      id: 'page-ticket-detail-client-approval',
      ...el('[data-tour="ticket-client-approval"], [data-tour="ticket-closed-card"]', 'bottom'),
      title: 'Client approval',
      description:
        'Clients approve resolved tickets here, which moves them to the review stage. (Shown for clients.)',
      waitForElement: 3_000,
    },
    {
      id: 'page-ticket-detail-time-tracking',
      ...el('[data-tour="ticket-time-tracking"]', 'bottom'),
      title: 'Time tracking',
      description:
        'Resources see the time logged against this ticket — every session with its duration and billable status. (Shown for resource users.)',
      waitForElement: 3_000,
    },
    {
      id: 'page-ticket-detail-uploader',
      ...el('[data-tour="ticket-uploader"]', 'bottom'),
      title: 'Attachments',
      description:
        'Upload and manage files on this ticket — screenshots, logs and documents stay attached to the conversation for everyone to see.',
    },
    {
      id: 'page-ticket-detail-revision-history',
      ...el('[data-tour="ticket-revision-history"]', 'bottom'),
      title: 'Revision history',
      description:
        'A timeline of every revision requested and its outcome — who asked for what, when, and whether it was approved or rejected. (Shown when revisions exist.)',
      waitForElement: 3_000,
    },
    {
      id: 'page-ticket-detail-comments',
      ...el('[data-tour="ticket-comments"]', 'top'),
      title: 'Comments',
      description:
        'The whole conversation stays on the ticket. Attach screenshots, leave notes for the team, and never lose context.',
    },
    {
      id: 'page-ticket-detail-meta',
      ...el('[data-tour="ticket-detail-meta"]', 'left'),
      title: 'Ticket details',
      description:
        'Who submitted it, who’s assigned, the project, module and revision count — the key facts about this request.',
    },
    {
      id: 'page-ticket-detail-panel',
      ...el('[data-tour="ticket-details-panel"]', 'left'),
      title: 'Details & activity',
      description:
        'A full activity timeline showing every status change along the way, plus the attachment list for this ticket.',
    },
    pageDone('Ticket Details'),
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // Projects — header, KPIs, search/filters, table, pagination
  // ───────────────────────────────────────────────────────────────────────────
  '/dashboard/projects': [
    {
      id: 'page-projects-header',
      ...el('[data-tour="projects-header"]', 'bottom'),
      title: 'Projects header',
      description:
        'Manage and monitor all projects. Managers and admins can create a new project with “New Project”.',
    },
    {
      id: 'page-projects-kpis',
      ...el('[data-tour="projects-kpis"]', 'bottom'),
      title: 'Project statistics',
      description: 'Total, active, completed and archived project counts — the health of your portfolio at a glance.',
    },
    {
      id: 'page-projects-search',
      ...el('[data-tour="projects-search-filters"]', 'bottom'),
      title: 'Search, sort & filters',
      description:
        'Search by name, code or description, sort by newest/name/tickets/progress, switch between table/grid/list views, and filter by status, client or manager.',
    },
    {
      id: 'page-projects-table',
      ...el('[data-tour="projects-table"]', 'bottom'),
      title: 'Projects table',
      description:
        'Every project with its key, status, manager, module/ticket counts and progress. Click a project name to open it, or use the “…” menu for actions.',
    },
    {
      id: 'page-projects-pagination',
      ...el('[data-tour="projects-pagination"]', 'bottom'),
      title: 'Pagination',
      description: 'Browse through large project lists page by page.',
    },
    pageDone('Projects'),
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // New Project — creation form (manager/admin)
  // ───────────────────────────────────────────────────────────────────────────
  '/dashboard/projects/new': [
    {
      id: 'page-new-project-header',
      ...el('[data-tour="new-project-header"]', 'bottom'),
      title: 'New Project',
      description:
        'Create a project to organize tickets and modules. Use the back arrow to return to the project list at any time.',
    },
    {
      id: 'page-new-project-name',
      ...el('[data-tour="new-project-name"]', 'bottom'),
      title: 'Project name',
      description: 'A clear, descriptive name for the project — e.g. “Customer Portal Redesign”.',
    },
    {
      id: 'page-new-project-client',
      ...el('[data-tour="new-project-client"] [data-slot="select-trigger"]', 'bottom'),
      title: 'Client',
      description: 'Select the client this project belongs to. The client’s support wallet is used to pay for hours.',
    },
    {
      id: 'page-new-project-manager',
      ...el('[data-tour="new-project-manager"] [data-slot="select-trigger"]', 'bottom'),
      title: 'Project manager',
      description: 'Assign the manager who will own this project, assign work and approve estimates.',
    },
    {
      id: 'page-new-project-description',
      ...el('[data-tour="new-project-description"]', 'bottom'),
      title: 'Description',
      description: 'Describe the project goals, scope and objectives so the team knows what they are building.',
    },
    {
      id: 'page-new-project-start-date',
      ...el('[data-tour="new-project-start-date"]', 'bottom'),
      title: 'Start date',
      description: 'Optional kickoff date for the project. It appears on the project detail page.',
    },
    {
      id: 'page-new-project-actions',
      ...el('[data-tour="new-project-actions"]', 'top'),
      title: 'Create the project',
      description:
        'Review the details and click “Create Project”. You’ll land on the new project page where you can add modules right away.',
    },
    pageDone('New Project'),
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // Edit Project — update form (manager/admin)
  // ───────────────────────────────────────────────────────────────────────────
  '/dashboard/projects/[id]/edit': [
    {
      id: 'page-edit-project-header',
      ...el('[data-tour="edit-project-header"]', 'bottom'),
      title: 'Edit Project',
      description:
        'Update the project’s name, status, description and start date. Use the back arrow to return to the project without saving.',
    },
    {
      id: 'page-edit-project-name',
      ...el('[data-tour="edit-project-name"]', 'bottom'),
      title: 'Project name',
      description: 'Adjust the project name if it has changed or was entered incorrectly.',
    },
    {
      id: 'page-edit-project-status',
      ...el('[data-tour="edit-project-status"] [data-slot="select-trigger"]', 'bottom'),
      title: 'Status',
      description: 'Active, completed or archived — status controls where the project appears in lists and reports.',
    },
    {
      id: 'page-edit-project-description',
      ...el('[data-tour="edit-project-description"]', 'bottom'),
      title: 'Description',
      description: 'Keep the description up to date so the team always has accurate scope.',
    },
    {
      id: 'page-edit-project-start-date',
      ...el('[data-tour="edit-project-start-date"]', 'bottom'),
      title: 'Start date',
      description: 'Change the kickoff date if the schedule has shifted.',
    },
    {
      id: 'page-edit-project-actions',
      ...el('[data-tour="edit-project-actions"]', 'top'),
      title: 'Save changes',
      description: 'Click “Save Changes” to apply the updates, or Cancel to discard them.',
    },
    pageDone('Edit Project'),
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // Project detail — dynamic route
  // ───────────────────────────────────────────────────────────────────────────
  '/dashboard/projects/[id]': [
    {
      id: 'page-project-detail-header',
      ...el('[data-tour="project-detail-header"]', 'bottom'),
      title: 'Project header',
      description: 'The project code, status and name. Managers and admins can edit the project from here.',
    },
    {
      id: 'page-project-detail-stats',
      ...el('[data-tour="project-detail-stats"]', 'bottom'),
      title: 'Quick stats',
      description: 'Modules, tickets, client and manager for this project at a glance.',
    },
    {
      id: 'page-project-detail-description',
      ...el('[data-tour="project-detail-description"]', 'bottom'),
      title: 'Description',
      description: 'The full project description — scope and goals for everyone involved.',
    },
    {
      id: 'page-project-detail-stats-panel',
      ...el('[data-tour="project-detail-stats-panel"]', 'bottom'),
      title: 'Project stats',
      description:
        'Detailed ticket statistics for this project. (Shown for manager/admin users.)',
      waitForElement: 3_000,
    },
    {
      id: 'page-project-detail-modules',
      ...el('[data-tour="module-manager"]', 'bottom'),
      title: 'Modules',
      description:
        'The modules this project uses. Managers and admins can add, edit and remove modules right here.',
    },
    {
      id: 'page-project-detail-info',
      ...el('[data-tour="project-detail-info"]', 'left'),
      title: 'Project details',
      description: 'Client, manager, start date and created date — the key facts about this project.',
    },
    {
      id: 'page-project-detail-actions',
      ...el('[data-tour="project-detail-actions"]', 'left'),
      title: 'Quick actions',
      description: 'Create a ticket for this project in one click, pre-filtered to the right project.',
    },
    pageDone('Project Details'),
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // Modules — header, KPIs, search/filters, table, pagination
  // ───────────────────────────────────────────────────────────────────────────
  '/dashboard/modules': [
    {
      id: 'page-modules-header',
      ...el('[data-tour="modules-header"]', 'bottom'),
      title: 'Modules header',
      description: 'Manage and organize project modules. “New Module” creates a fresh module.',
    },
    {
      id: 'page-modules-kpis',
      ...el('[data-tour="modules-kpis"]', 'bottom'),
      title: 'Module statistics',
      description: 'Total, active, completed and archived modules across all projects.',
    },
    {
      id: 'page-modules-search',
      ...el('[data-tour="modules-search-filters"]', 'bottom'),
      title: 'Search & filters',
      description: 'Search by name, description or project, and filter by project or status.',
    },
    {
      id: 'page-modules-table',
      ...el('[data-tour="modules-table"]', 'bottom'),
      title: 'Modules table',
      description:
        'Every module with its project, status and ticket count. Use the “…” menu to view, edit or delete a module.',
    },
    {
      id: 'page-modules-pagination',
      ...el('[data-tour="modules-pagination"]', 'bottom'),
      title: 'Pagination',
      description: 'Browse through large module lists page by page.',
    },
    pageDone('Modules'),
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // Create Module — creation form (manager/admin)
  // ───────────────────────────────────────────────────────────────────────────
  '/dashboard/modules/create': [
    {
      id: 'page-create-module-header',
      ...el('[data-tour="create-module-header"]', 'bottom'),
      title: 'Create Module',
      description:
        'Add a new module to organize tickets within a project. Use the back arrow to return to the module list.',
    },
    {
      id: 'page-create-module-project',
      ...el('[data-tour="create-module-project"] [data-slot="select-trigger"]', 'bottom'),
      title: 'Project',
      description: 'Choose the project this module belongs to — tickets get attached to modules within a project.',
    },
    {
      id: 'page-create-module-name',
      ...el('[data-tour="create-module-name"]', 'bottom'),
      title: 'Module name',
      description: 'A short, clear name — e.g. “Authentication”, “Billing” or “Dashboard”.',
    },
    {
      id: 'page-create-module-description',
      ...el('[data-tour="create-module-description"]', 'bottom'),
      title: 'Description',
      description: 'Describe what this module covers so clients can pick the right one when filing tickets.',
    },
    {
      id: 'page-create-module-actions',
      ...el('[data-tour="create-module-actions"]', 'top'),
      title: 'Create the module',
      description: 'Click “Create Module” to save it — you’ll be taken to the project page where it now appears.',
    },
    pageDone('Create Module'),
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // Module Details — the selected module's information + its tickets
  // (manager/admin only — the page redirects other roles away)
  // ───────────────────────────────────────────────────────────────────────────
  '/dashboard/modules/[id]': [
    {
      id: 'page-module-detail-header',
      ...el('[data-tour="module-detail-header"]', 'bottom'),
      title: 'Module details',
      description:
        'The module name, status and the project it belongs to stay pinned at the top — plus “Edit Module” and “Back to Modules” are always one click away.',
    },
    {
      id: 'page-module-detail-info',
      ...el('[data-tour="module-detail-info"]', 'bottom'),
      title: 'Module information',
      description:
        'Description, created/updated dates, assigned resources and ticket count — the full picture of what this module covers.',
    },
    {
      id: 'page-module-detail-tickets',
      ...el('[data-tour="module-detail-tickets"]', 'bottom'),
      title: 'Module tickets',
      description:
        'Only the tickets belonging to this module appear here — with ID, status, priority and the assigned resource. Click any row to open it.',
    },
    pageDone('Module Details'),
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // Edit Module — update form (manager/admin)
  // ───────────────────────────────────────────────────────────────────────────
  '/dashboard/modules/[id]/edit': [
    {
      id: 'page-edit-module-header',
      ...el('[data-tour="edit-module-header"]', 'bottom'),
      title: 'Edit Module',
      description:
        'Update the module’s name, status and description. Use the back arrow to return without saving.',
    },
    {
      id: 'page-edit-module-name',
      ...el('[data-tour="edit-module-name"]', 'bottom'),
      title: 'Module name',
      description: 'Adjust the module name if it has changed or was entered incorrectly.',
    },
    {
      id: 'page-edit-module-status',
      ...el('[data-tour="edit-module-status"] [data-slot="select-trigger"]', 'bottom'),
      title: 'Status',
      description: 'Active, completed or archived — status controls where the module appears in lists.',
    },
    {
      id: 'page-edit-module-description',
      ...el('[data-tour="edit-module-description"]', 'bottom'),
      title: 'Description',
      description: 'Keep the description up to date so clients know what this module covers.',
    },
    {
      id: 'page-edit-module-actions',
      ...el('[data-tour="edit-module-actions"]', 'top'),
      title: 'Save changes',
      description: 'Click “Save Changes” to apply the updates, or Cancel to discard them.',
    },
    pageDone('Edit Module'),
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // Support Wallet — header, alerts, summary, usage, transactions
  // ───────────────────────────────────────────────────────────────────────────
  '/dashboard/support-wallet': [
    {
      id: 'page-wallet-header',
      ...el('[data-tour="wallet-header"]', 'bottom'),
      title: 'Support wallet header',
      description:
        'Your contracted support hours. The badges show your wallet and contract status, and “New Ticket” is always one click away.',
      // Server-rendered page — the card renders in both the has-wallet and
      // no-wallet states, so it exists as soon as the route commits.
      waitForElement: 4_000,
    },
    {
      id: 'page-wallet-summary',
      ...el('[data-tour="wallet-summary"]', 'bottom'),
      title: 'Wallet summary',
      description:
        'Purchased, used, remaining hours and the percentage still available — your balance at a glance.',
      waitForElement: 3_000,
    },
    {
      id: 'page-wallet-usage',
      ...el('[data-tour="wallet-usage"]', 'bottom'),
      title: 'Hour usage',
      description:
        'A visual progress bar of how much of your support package has been consumed. Colors warn you as the balance runs low.',
    },
    {
      id: 'page-wallet-transactions',
      ...el('[data-tour="wallet-transactions"]', 'top'),
      title: 'Transaction history',
      description:
        'Every recharge, deduction and adjustment with its balance after each change. This is the full audit trail for your hours.',
    },
    pageDone('Support Wallet'),
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // Notifications — header, tabs, bulk actions, list, pagination
  // ───────────────────────────────────────────────────────────────────────────
  '/dashboard/notifications': [
    {
      id: 'page-notifications-header',
      ...el('[data-tour="notifications-header"]', 'bottom'),
      title: 'Notifications header',
      description:
        'Your notification inbox. The unread counter and “Mark all read” live here — stay on top of what needs your attention.',
    },
    {
      id: 'page-notifications-tabs',
      ...el('[data-tour="notifications-tabs"]', 'bottom'),
      title: 'Filter tabs',
      description:
        'Switch between All, Unread and type-specific tabs (tickets, comments, wallet, system…) each with its own count.',
    },
    {
      id: 'page-notifications-bulk',
      ...el('[data-tour="notifications-bulk-bar"]', 'bottom'),
      title: 'Bulk selection',
      description: 'Select multiple notifications at once to mark them as read in bulk.',
    },
    {
      id: 'page-notifications-list',
      ...el('[data-tour="notifications-list"]', 'top'),
      title: 'Notification list',
      description:
        'Every update, mention and alert. Unread items are highlighted — click one to open the details and jump to the related ticket.',
    },
    {
      id: 'page-notifications-pagination',
      ...el('[data-tour="notifications-pagination"]', 'bottom'),
      title: 'Pagination',
      description: 'Browse through older notifications page by page.',
    },
    pageDone('Notifications'),
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // Analytics — KPIs + charts (manager/admin)
  // ───────────────────────────────────────────────────────────────────────────
  '/dashboard/analytics': [
    {
      id: 'page-analytics-header',
      ...el('[data-tour="analytics-header"]', 'bottom'),
      title: 'Analytics header',
      description: 'Ticket trends and developer performance over the last 30 days — the management view of how work is moving.',
    },
    {
      id: 'page-analytics-kpis',
      ...el('[data-tour="analytics-kpis"]', 'bottom'),
      title: 'Analytics KPIs',
      description:
        'Total tickets, resolution rate and average resolution time — the headline numbers for the last 30 days.',
      waitForElement: 8_000,
    },
    {
      id: 'page-analytics-volume',
      ...el('[data-tour="ticket-volume-chart"]', 'bottom'),
      title: 'Ticket volume',
      description: 'Daily ticket volume over the last 30 days — spot trends and spikes at a glance.',
    },
    {
      id: 'page-analytics-status',
      ...el('[data-tour="status-distribution-chart"]', 'bottom'),
      title: 'Status distribution',
      description: 'Where tickets currently sit — from new requests through to closed.',
    },
    {
      id: 'page-analytics-priority',
      ...el('[data-tour="priority-distribution-chart"]', 'bottom'),
      title: 'Priority breakdown',
      description: 'How tickets are distributed by priority — watch for a pile-up of urgent work.',
    },
    {
      id: 'page-analytics-category',
      ...el('[data-tour="category-distribution-chart"]', 'bottom'),
      title: 'Category breakdown',
      description: 'Tickets grouped by category, so you can see where the demand concentrates.',
    },
    {
      id: 'page-analytics-workload',
      ...el('[data-tour="developer-workload-chart"]', 'bottom'),
      title: 'Resource workload',
      description: 'Active vs resolved tickets per developer — see who is overloaded and who has capacity.',
    },
    {
      id: 'page-analytics-time-table',
      ...el('[data-tour="developer-time-table"]', 'bottom'),
      title: 'Resource time logged',
      description: 'Total time logged per developer, ranked — useful for capacity planning.',
    },
    pageDone('Analytics'),
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // Report Center — filters, results, summary, charts, table
  // ───────────────────────────────────────────────────────────────────────────
  '/dashboard/reports/view': [
    {
      id: 'page-reports-header',
      ...el('[data-tour="reports-header"]', 'bottom'),
      title: 'Report Center',
      description:
        'View, filter, analyze and export system reports. Once a report is generated, refresh and export controls appear in the header.',
    },
    {
      id: 'page-reports-filters',
      ...el('[data-tour="report-filters"]', 'bottom'),
      title: 'Report filters',
      description:
        'Pick a report type and narrow it by status, priority, project or developer. Click “Generate” to build the report.',
    },
    {
      id: 'page-reports-results',
      ...el('[data-tour="report-results"]', 'top'),
      title: 'Report results',
      description: 'The generated report with its metadata — generated time, record count and applied filters.',
    },
    {
      id: 'page-reports-summary',
      ...el('[data-tour="report-summary-cards"]', 'bottom'),
      title: 'Summary cards',
      description: 'Headline numbers for the report — totals, averages and key metrics at a glance.',
    },
    {
      id: 'page-reports-charts',
      ...el('[data-tour="report-charts"]', 'bottom'),
      title: 'Charts',
      description: 'Visual breakdowns that make the report easy to scan and present.',
    },
    {
      id: 'page-reports-table',
      ...el('[data-tour="report-table"]', 'bottom'),
      title: 'Data table',
      description: 'The full report data, row by row. Use the header’s export button to download it as a file.',
    },
    pageDone('Report Center'),
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // Assignments — KPIs, filters, tickets, developers, summary (manager/admin)
  // ───────────────────────────────────────────────────────────────────────────
  '/dashboard/assignments': [
    {
      id: 'page-assignments-header',
      ...el('[data-tour="assignments-header"]', 'bottom'),
      title: 'Assignments header',
      description: 'Assign tickets to developers in your team and balance the workload.',
    },
    {
      id: 'page-assignments-kpis',
      ...el('[data-tour="assignments-kpis"]', 'bottom'),
      title: 'Assignment statistics',
      description: 'Total tickets, still unassigned, already assigned and available developers.',
    },
    {
      id: 'page-assignments-filters',
      ...el('[data-tour="assignments-filters"]', 'bottom'),
      title: 'Search & filters',
      description: 'Narrow the unassigned queue by keyword, priority or project.',
    },
    {
      id: 'page-assignments-tickets',
      ...el('[data-tour="assignments-tickets"]', 'bottom'),
      title: 'Unassigned tickets',
      description:
        'Every ticket waiting for a developer. Pick a developer from the dropdown and click “Assign Resource” to route it.',
    },
    {
      id: 'page-assignments-developers',
      ...el('[data-tour="assignments-developers"]', 'left'),
      title: 'Developer workload',
      description: 'See how many active tickets each developer carries so you can assign fairly.',
    },
    {
      id: 'page-assignments-summary',
      ...el('[data-tour="assignments-summary"]', 'left'),
      title: 'Assignment summary',
      description: 'A live summary of totals — and “Auto Assign Tickets” to route everything in one click.',
    },
    pageDone('Assignments'),
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // Review Queue — header, KPIs, filters, list (manager/admin)
  // ───────────────────────────────────────────────────────────────────────────
  '/dashboard/review-queue': [
    {
      id: 'page-review-queue-header',
      ...el('[data-tour="estimate-approval"]', 'bottom'),
      title: 'Review Queue header',
      description:
        'Tickets resolved by developers that are awaiting your review. Export the queue as CSV, Excel or PDF from here.',
    },
    {
      id: 'page-review-queue-kpis',
      ...el('[data-tour="review-queue-kpis"]', 'bottom'),
      title: 'Queue statistics',
      description: 'Pending requests, totals and review outcomes — how much is waiting for you.',
    },
    {
      id: 'page-review-queue-filters',
      ...el('[data-tour="review-queue-filters"]', 'bottom'),
      title: 'Search & filters',
      description: 'Search the queue by keyword, priority or assigned developer.',
    },
    {
      id: 'page-review-queue-list',
      ...el('[data-tour="review-queue-list"]', 'top'),
      title: 'Review tickets',
      description:
        'Each resolved ticket with its developer. Approve the work, or request changes right from the ticket card.',
    },
    pageDone('Review Queue'),
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // Team — header, KPIs, search/filters, table, pagination (manager/admin)
  // ───────────────────────────────────────────────────────────────────────────
  '/dashboard/team': [
    {
      id: 'page-team-header',
      ...el('[data-tour="team-header"]', 'bottom'),
      title: 'Team header',
      description: 'Monitor your development team’s workload. Use the “…” menu on any member to edit, assign work or reset a password.',
    },
    {
      id: 'page-team-kpis',
      ...el('[data-tour="team-kpis"]', 'bottom'),
      title: 'Team statistics',
      description: 'Total members, active members and average workload across the team.',
    },
    {
      id: 'page-team-search',
      ...el('[data-tour="team-search-filters"]', 'bottom'),
      title: 'Search & filters',
      description: 'Find members by name or email and sort by workload, name or join date.',
    },
    {
      id: 'page-team-table',
      ...el('[data-tour="team-table"]', 'bottom'),
      title: 'Team table',
      description:
        'Every member with their role, status, active tickets and workload. Use the “…” menu to view, edit or assign work.',
    },
    {
      id: 'page-team-pagination',
      ...el('[data-tour="team-pagination"]', 'bottom'),
      title: 'Pagination',
      description: 'Browse through larger teams page by page.',
    },
    pageDone('Team'),
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // Time Tracking — header, KPIs, timer, entries, charts (resource)
  // ───────────────────────────────────────────────────────────────────────────
  '/dashboard/time-tracking': [
    {
      id: 'page-time-tracking-header',
      ...el('[data-tour="time-tracking-header"]', 'bottom'),
      title: 'Time tracking header',
      description: 'Track and review the time spent on your assigned tickets.',
    },
    {
      id: 'page-time-tracking-kpis',
      ...el('[data-tour="time-tracking-kpis"]', 'bottom'),
      title: 'Time statistics',
      description: 'Total logged, billable, non-billable hours and your billable rate.',
    },
    {
      id: 'page-time-tracker',
      ...el('[data-tour="time-tracker"]', 'bottom'),
      title: 'Timer',
      description:
        'Select a ticket, add a work description and hit “Start Timer”. The clock runs automatically and logs billable time to that ticket.',
    },
    {
      id: 'page-time-entries',
      ...el('[data-tour="time-tracker-entries"]', 'left'),
      title: 'Recent entries',
      description: 'Your most recent time entries with duration — and an export button for your records.',
    },
    {
      id: 'page-time-chart-daily',
      ...el('[data-tour="time-chart-daily"]', 'bottom'),
      title: 'Daily hours',
      description: 'Your logged hours per day over the last 30 days, split by billable and non-billable.',
    },
    {
      id: 'page-time-chart-by-ticket',
      ...el('[data-tour="time-chart-by-ticket"]', 'bottom'),
      title: 'Time by ticket',
      description: 'Where your hours went — the top tickets ranked by time logged, with billable markers.',
    },
    pageDone('Time Tracking'),
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // Worklogs — header, KPIs, summary, activity log (manager/admin)
  // ───────────────────────────────────────────────────────────────────────────
  '/dashboard/worklogs': [
    {
      id: 'page-worklogs-header',
      ...el('[data-tour="worklogs-header"]', 'bottom'),
      title: 'Worklogs header',
      description: 'All employee time logs across tickets — the team’s effort in one place.',
    },
    {
      id: 'page-worklogs-kpis',
      ...el('[data-tour="worklogs-kpis"]', 'bottom'),
      title: 'Worklog statistics',
      description: 'Total logged, billable, non-billable hours and the number of active developers.',
    },
    {
      id: 'page-worklog-summary',
      ...el('[data-tour="worklog-summary"]', 'bottom'),
      title: 'Employee summary',
      description: 'Per-developer cards with hours, tickets worked and productivity — perfect for reviews.',
    },
    {
      id: 'page-worklogs-activity-log',
      ...el('[data-tour="worklogs-activity-log"]', 'left'),
      title: 'Activity log',
      description: 'A live, scrollable feed of every logged session. It follows you down the page as you review the summary cards.',
    },
    pageDone('Worklogs'),
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // Support Wallets (admin) — header, KPIs, filters, table, pagination
  // ───────────────────────────────────────────────────────────────────────────
  '/dashboard/wallets': [
    {
      id: 'page-wallets-header',
      ...el('[data-tour="wallets-header"]', 'bottom'),
      title: 'Support wallets header',
      description: 'Every client’s support wallet — purchased hours, consumption and contract status in one place.',
    },
    {
      id: 'page-wallets-kpis',
      ...el('[data-tour="wallets-kpis"]', 'bottom'),
      title: 'Wallet statistics',
      description: 'Total wallet hours, remaining hours, low-balance clients and recharge requests this month.',
    },
    {
      id: 'page-wallets-filters',
      ...el('[data-tour="wallets-filters"]', 'bottom'),
      title: 'Search & filters',
      description: 'Search by client or project and filter by status or project.',
    },
    {
      id: 'page-wallets-export',
      ...el('[data-tour="wallets-export"]', 'bottom'),
      title: 'Export',
      description: 'Download the current wallet list as a CSV file.',
    },
    {
      id: 'page-wallets-table',
      ...el('[data-tour="wallets-table"]', 'bottom'),
      title: 'Wallets table',
      description:
        'Every wallet with its hours and status. Click a wallet to open its full detail view with transactions.',
    },
    {
      id: 'page-wallets-pagination',
      ...el('[data-tour="wallets-pagination"]', 'bottom'),
      title: 'Pagination',
      description: 'Browse through larger wallet lists page by page.',
    },
    pageDone('Support Wallets'),
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // Wallet detail — dynamic route
  // ───────────────────────────────────────────────────────────────────────────
  '/dashboard/wallets/[id]': [
    {
      id: 'page-wallet-detail-back',
      ...el('[data-tour="wallet-detail-back"]', 'bottom'),
      title: 'Back to wallets',
      description: 'Return to the wallet list whenever you need to switch context.',
    },
    {
      id: 'page-wallet-detail-header',
      ...el('[data-tour="wallet-detail-header"]', 'bottom'),
      title: 'Wallet header',
      description:
        'The wallet status for this project. Managers and admins can add hours or export the transaction history.',
    },
    {
      id: 'page-wallet-detail-summary',
      ...el('[data-tour="wallet-detail-summary"]', 'bottom'),
      title: 'Wallet summary',
      description: 'Purchased, reserved, consumed and remaining hours for this wallet.',
    },
    {
      id: 'page-wallet-detail-utilization',
      ...el('[data-tour="wallet-detail-utilization"]', 'bottom'),
      title: 'Hour utilization',
      description: 'A visual breakdown of how the wallet is being consumed — consumed, reserved and remaining.',
    },
    {
      id: 'page-wallet-detail-tabs',
      ...el('[data-tour="wallet-detail-tabs"]', 'top'),
      title: 'Detail tabs',
      description:
        'Overview, Transactions, Consumption and Alerts — switch tabs to see the wallet’s full story.',
    },
    pageDone('Wallet Details'),
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // Resource Dashboard — header, KPIs, charts, metrics (resource / manager/admin)
  // ───────────────────────────────────────────────────────────────────────────
  '/dashboard/resources': [
    {
      id: 'page-resources-header',
      ...el('[data-tour="resources-header"]', 'bottom'),
      title: 'Resource dashboard header',
      description:
        'Your performance and resource overview. Use the 7d / 30d / 90d toggle to change the time window.',
    },
    {
      id: 'page-resources-kpis',
      ...el('[data-tour="resources-kpis"]', 'bottom'),
      title: 'Performance KPIs',
      description:
        'Time logged, tickets assigned, resolved and your productivity score — the headline numbers.',
    },
    {
      id: 'page-resources-status-chart',
      ...el('[data-tour="resources-status-chart"]', 'bottom'),
      title: 'Status breakdown',
      description: 'Where your tickets currently sit, in a donut chart. (Shown for resource users.)',
      waitForElement: 3_000,
    },
    {
      id: 'page-resources-time-chart',
      ...el('[data-tour="resources-time-chart"]', 'bottom'),
      title: 'Time logged trend',
      description: 'Your logged hours over time — see your momentum at a glance. (Shown for resource users.)',
      waitForElement: 3_000,
    },
    {
      id: 'page-resources-metrics',
      ...el('[data-tour="resources-metrics"]', 'bottom'),
      title: 'Additional metrics',
      description:
        'Avg resolution time, SLA compliance, efficiency and more — deeper insight into your performance. (Shown for resource users.)',
      waitForElement: 3_000,
    },
    {
      id: 'page-resources-rankings',
      ...el('[data-tour="resources-rankings"]', 'bottom'),
      title: 'Employee rankings',
      description:
        'Team members ranked by hours, work and resolved tickets. (Shown for manager/admin users.)',
      waitForElement: 3_000,
    },
    pageDone('Resource Dashboard'),
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // Customer Onboarding — stepper + wizard (admin/manager)
  // ───────────────────────────────────────────────────────────────────────────
  '/dashboard/customer-onboarding': [
    {
      id: 'page-onboarding-header',
      ...el('[data-tour="customer-onboarding"]', 'bottom'),
      title: 'Customer onboarding',
      description:
        'Spin up a new customer in one flow — users, project, modules and support wallet are created together.',
    },
    {
      id: 'page-onboarding-stepper',
      ...el('[data-tour="onboarding-stepper"]', 'bottom'),
      title: 'Wizard steps',
      description: 'The wizard walks you through User → Project → Modules → Hours, then Review & Confirm.',
      waitForElement: 8_000,
    },
    {
      id: 'page-onboarding-wizard',
      ...el('[data-tour="onboarding-wizard"]', 'top'),
      title: 'Onboarding form',
      description:
        'Fill in each step and use the Previous / Next controls at the bottom. “Save Draft” lets you resume later.',
    },
    pageDone('Customer Onboarding'),
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // Admin — header, branding, user stats, quick actions
  // ───────────────────────────────────────────────────────────────────────────
  '/dashboard/admin': [
    {
      id: 'page-admin-header',
      ...el('[data-tour="admin-header"]', 'bottom'),
      title: 'System overview',
      description: 'User management and system-wide administration.',
    },
    {
      id: 'page-admin-branding',
      ...el('[data-tour="admin-branding"]', 'bottom'),
      title: 'Branding',
      description:
        'Customize your company appearance — name, logo and favicon. Changes apply across the whole portal instantly.',
    },
    {
      id: 'page-admin-user-stats',
      ...el('[data-tour="admin-user-stats"]', 'bottom'),
      title: 'User statistics',
      description: 'Total users broken down by role — admins, managers, developers and clients.',
    },
    {
      id: 'page-admin-quick-actions',
      ...el('[data-tour="admin-quick-actions"]', 'bottom'),
      title: 'Quick actions',
      description: 'Jump straight to the full user management table.',
    },
    pageDone('System Settings'),
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // Admin Users — header, KPIs, table (admin)
  // ───────────────────────────────────────────────────────────────────────────
  '/dashboard/admin/users': [
    {
      id: 'page-admin-users-header',
      ...el('[data-tour="admin-users-header"]', 'bottom'),
      title: 'User management',
      description: 'Manage user accounts and roles across the platform.',
    },
    {
      id: 'page-admin-users-kpis',
      ...el('[data-tour="admin-users-kpis"]', 'bottom'),
      title: 'User statistics',
      description: 'Total users and the client, manager and developer counts.',
    },
    {
      id: 'page-admin-users-toolbar',
      ...el('[data-tour="users-table-toolbar"]', 'bottom'),
      title: 'Table toolbar',
      description: 'Search users, add new accounts and control what the table shows.',
    },
    {
      id: 'page-admin-users-table',
      ...el('[data-tour="admin-users-table"]', 'bottom'),
      title: 'Users table',
      description:
        'Every account with its role and status. Use the row actions to edit, reset passwords or manage access.',
    },
    pageDone('User Management'),
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // Profile — card, tabs, personal info, preferences
  // ───────────────────────────────────────────────────────────────────────────
  '/dashboard/profile': [
    {
      id: 'page-profile-card',
      ...el('[data-tour="profile-card"]', 'bottom'),
      title: 'Your profile',
      description:
        'Your avatar, name, role and email. Hover the avatar to change your profile picture.',
    },
    {
      id: 'page-profile-tabs',
      ...el('[data-tour="profile-tabs"]', 'bottom'),
      title: 'Profile tabs',
      description: 'Switch between Personal Information and Preferences.',
    },
    {
      id: 'page-profile-personal',
      ...el('[data-tour="profile-personal-info"]', 'bottom'),
      clickElement: '[data-tour="profile-tab-personal"]',
      title: 'Personal information',
      description:
        'Update your name, phone and timezone. Save changes when you are done.',
    },
    {
      id: 'page-profile-preferences',
      ...el('[data-tour="profile-preferences"]', 'bottom'),
      // The Preferences panel is hidden behind its tab — click it first so the
      // tour highlights a real, visible component (interactive activation).
      clickElement: '[data-tour="profile-tab-preferences"]',
      title: 'Preferences',
      description:
        'Theme, language, time format and notification toggles — plus the “Restart Tour” button to replay the product walkthrough.',
    },
    pageDone('Profile'),
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // Help Center — hero + sections
  // ───────────────────────────────────────────────────────────────────────────
  '/dashboard/help': [
    {
      id: 'page-help-hero',
      ...el('[data-tour="help-hero"]', 'bottom'),
      title: 'Help Center',
      description:
        'Search guides, FAQs and release notes — or restart the full tour below.',
    },
    {
      id: 'page-help-sections',
      ...el('[data-tour="help-section"]', 'bottom'),
      title: 'Help sections',
      description:
        'Getting Started, role guides, ticket lifecycle, statuses, FAQs, troubleshooting, release notes and contact — all in one place.',
    },
    pageDone('Help Center'),
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // Customer Review Reports — filters, KPIs, tables (manager/admin)
  // ───────────────────────────────────────────────────────────────────────────
  '/dashboard/reports/customer-reviews': [
    {
      id: 'page-customer-reviews-header',
      ...el('[data-tour="customer-reviews-header"]', 'bottom'),
      title: 'Customer review reports',
      description:
        'Analyze customer feedback, resource performance and review completion. Export and refresh controls appear in the header once a report is generated.',
    },
    {
      id: 'page-customer-reviews-filters',
      ...el('[data-tour="customer-reviews-filters"]', 'bottom'),
      title: 'Search & filters',
      description:
        'Search by ticket number or open the filter panel for dates, client, project, module, resource, review status and star rating. Click “Generate” to build the report.',
    },
    {
      id: 'page-customer-reviews-kpis',
      ...el('[data-tour="customer-reviews-kpis"]', 'bottom'),
      title: 'Review KPIs',
      description:
        'Total closed tickets, reviews submitted, pending reviews, average rating, 5-star reviews and low-rated reviews at a glance.',
    },
    {
      id: 'page-customer-reviews-table',
      ...el('[data-tour="customer-reviews-table"]', 'bottom'),
      title: 'Review details',
      description:
        'Every closed ticket with its review status, rating and comment. Click “View” on a row to open the full review detail.',
    },
    {
      id: 'page-customer-reviews-resource-performance',
      ...el('[data-tour="customer-reviews-resource-performance"]', 'bottom'),
      title: 'Resource performance',
      description:
        'How each resource scores on client reviews — average rating and the star distribution. (Shown when data exists.)',
      waitForElement: 3_000,
    },
    pageDone('Customer Review Reports'),
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // Microsoft Teams Integration (admin)
  // ───────────────────────────────────────────────────────────────────────────
  '/dashboard/admin/teams': [
    {
      id: 'page-teams-header',
      ...el('[data-tour="teams-header"]', 'bottom'),
      title: 'Teams integration',
      description: 'Configure and monitor Microsoft Teams notification delivery.',
    },
    {
      id: 'page-teams-status',
      ...el('[data-tour="teams-status"]', 'bottom'),
      title: 'Integration status',
      description:
        'Provider, mode (mock vs live), messages sent and failed — the health of the integration at a glance.',
    },
    {
      id: 'page-teams-validation',
      ...el('[data-tour="teams-validation"]', 'bottom'),
      title: 'Configuration validation',
      description:
        'Every configuration check with pass/fail severity — so you know exactly what to fix.',
    },
    {
      id: 'page-teams-queue',
      ...el('[data-tour="teams-queue"]', 'bottom'),
      title: 'Queue status',
      description:
        'Pending notification events, processed, failed and retried counts — monitor delivery reliability.',
    },
    {
      id: 'page-teams-monitor',
      ...el('[data-tour="teams-monitor"]', 'bottom'),
      title: 'Recent events',
      description: 'A live log of notification events with duration and timestamp.',
    },
    pageDone('Teams Integration'),
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // Reviews — KPIs, distributions, highest/lowest rated (manager/admin)
  // ───────────────────────────────────────────────────────────────────────────
  '/dashboard/reviews': [
    {
      id: 'page-reviews-kpis',
      ...el('[data-tour="reviews-kpis"]', 'bottom'),
      title: 'Review analytics',
      description:
        'Average rating, total reviews, 5-star rate and this month’s count — client satisfaction at a glance.',
    },
    {
      id: 'page-reviews-distribution',
      ...el('[data-tour="reviews-rating-distribution"]', 'bottom'),
      title: 'Rating distribution',
      description: 'How ratings are spread across the star scale — spot the drift early.',
    },
    {
      id: 'page-reviews-satisfaction',
      ...el('[data-tour="reviews-satisfaction"]', 'bottom'),
      title: 'Resolution satisfaction',
      description: 'The average resolution satisfaction across all categories.',
    },
    {
      id: 'page-reviews-highest',
      ...el('[data-tour="reviews-highest-rated"]', 'bottom'),
      title: 'Highest rated tickets',
      description: 'Your best-received work — repeat what works.',
    },
    {
      id: 'page-reviews-lowest',
      ...el('[data-tour="reviews-lowest-rated"]', 'bottom'),
      title: 'Lowest rated tickets',
      description: 'The work that needs attention — investigate and improve.',
    },
    pageDone('Reviews'),
  ],
}

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE ANNOUNCEMENT TOURS (short, shown only to users who haven't seen them)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map a real pathname to its page-tour config key.
 *
 * Handles dynamic routes — e.g. `/dashboard/tickets/42` resolves to the
 * `/dashboard/tickets/[id]` tour, `/dashboard/wallets/7` to
 * `/dashboard/wallets/[id]`, `/dashboard/projects/9` to
 * `/dashboard/projects/[id]`. Unknown paths return `undefined`.
 */
export function resolvePageTourKey(pathname: string): string | undefined {
  if (PAGE_TOURS[pathname]) return pathname
  if (/^\/dashboard\/tickets\/\d+$/.test(pathname)) return '/dashboard/tickets/[id]'
  if (/^\/dashboard\/wallets\/\d+$/.test(pathname)) return '/dashboard/wallets/[id]'
  if (/^\/dashboard\/projects\/\d+$/.test(pathname)) return '/dashboard/projects/[id]'
  if (/^\/dashboard\/projects\/\d+\/edit$/.test(pathname)) return '/dashboard/projects/[id]/edit'
  if (/^\/dashboard\/modules\/\d+\/edit$/.test(pathname)) return '/dashboard/modules/[id]/edit'
  if (/^\/dashboard\/modules\/\d+$/.test(pathname)) return '/dashboard/modules/[id]'
  return undefined
}

export const FEATURE_TOURS: FeatureTourConfig[] = [
  {
    id: 'teams-notifications',
    title: 'Microsoft Teams Notifications',
    description: 'Receive ticket updates directly inside Teams — no email chasing required.',
    icon: 'MessageSquare',
    steps: [
      {
        id: 'feature-teams-bell',
        ...el('[data-tour="notification-bell"]', 'bottom'),
        title: '✨ New: Teams Notifications',
        description:
          'Ticket updates can now be delivered straight to Microsoft Teams. Check the notification bell — your team will never miss a handoff again.',
      },
    ],
  },
]
